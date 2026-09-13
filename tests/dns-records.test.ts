import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  evaluateDkim,
  evaluateDmarc,
  evaluateMx,
  evaluateSpf,
  joinTxt,
  recommendedRecords,
} from '@/scripts/lib/dns-records.mjs';

/**
 * The rules behind scripts/dns-verify.mjs. They exist because a missing SPF
 * record and a wrong one fail in different ways, and the wrong ones are the
 * quiet failures: two SPF records, or one ending +all, look like a configured
 * domain and authenticate nothing.
 */

describe('SPF', () => {
  it('fails when there is none — the state nexphaselabs.net is in', () => {
    const result = evaluateSpf(['google-site-verification=abc123']);
    expect(result.ok).toBe(false);
    expect(result.problems.join(' ')).toContain('No SPF record');
  });

  it('accepts one correct record', () => {
    expect(evaluateSpf(['v=spf1 include:_spf.google.com ~all']).ok).toBe(true);
    expect(evaluateSpf(['v=spf1 include:_spf.google.com -all']).ok).toBe(true);
  });

  it('rejects two records, which is worse than none', () => {
    const result = evaluateSpf([
      'v=spf1 include:_spf.google.com ~all',
      'v=spf1 include:spf.privateemail.com ~all',
    ]);
    expect(result.ok).toBe(false);
    expect(result.problems.join(' ')).toContain('permanent error');
  });

  it('rejects +all outright', () => {
    const result = evaluateSpf(['v=spf1 include:_spf.google.com +all']);
    expect(result.ok).toBe(false);
    expect(result.problems.join(' ')).toContain('worse than no record');
  });

  it('notices a record that authorises the wrong sender', () => {
    const result = evaluateSpf(['v=spf1 include:spf.privateemail.com ~all']);
    expect(result.ok).toBe(false);
    expect(result.problems.join(' ')).toContain('_spf.google.com');
  });

  it('notices a missing qualifier and too many lookups', () => {
    expect(evaluateSpf(['v=spf1 include:_spf.google.com']).problems.join(' ')).toContain('~all');
    const many = `v=spf1 ${Array.from({ length: 11 }, (_, i) => `include:h${i}.example.org`).join(' ')} ~all`;
    expect(evaluateSpf(many.split('|'), { expectInclude: '' }).problems.join(' ')).toContain('limit is 10');
  });
});

describe('DMARC', () => {
  it('fails when absent', () => {
    expect(evaluateDmarc([]).ok).toBe(false);
  });

  it('accepts a monitoring record and says what to do next', () => {
    const result = evaluateDmarc(['v=DMARC1; p=none; rua=mailto:dmarc@nexphaselabs.net; fo=1']);
    expect(result.ok).toBe(true);
    expect(result.policy).toBe('none');
    expect(result.note).toContain('quarantine');
  });

  it('rejects a record with no policy and one with no reporting address', () => {
    expect(evaluateDmarc(['v=DMARC1; rua=mailto:x@example.org']).problems.join(' ')).toContain('p=');
    expect(evaluateDmarc(['v=DMARC1; p=reject']).problems.join(' ')).toContain('rua=');
  });

  it('has no note once the policy is enforcing', () => {
    expect(evaluateDmarc(['v=DMARC1; p=reject; rua=mailto:x@example.org']).note).toBeUndefined();
  });
});

describe('DKIM', () => {
  it('fails when no selector resolves, and names the ones it looked for', () => {
    const result = evaluateDkim({ google: [], default: [], brevo1: [] });
    expect(result.ok).toBe(false);
    expect(result.problems.join(' ')).toContain('google, default, brevo1');
  });

  it('accepts a real key and reports the selector', () => {
    const result = evaluateDkim({
      google: ['v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA'],
      default: [],
    });
    expect(result.ok).toBe(true);
    expect(result.selectors).toEqual(['google']);
  });

  it('does not accept a selector record with no key in it', () => {
    expect(evaluateDkim({ google: ['v=DKIM1; k=rsa; p='] }).ok).toBe(false);
  });

  it('reassembles a key split across TXT chunks', () => {
    const chunks = ['v=DKIM1; k=rsa; p=MIIBIjANBgkq', 'hkiG9w0BAQEFAAOCAQ8AMIIBCg'];
    expect(joinTxt(chunks)).toContain('p=MIIBIjANBgkqhkiG9w0B');
    expect(evaluateDkim({ google: [chunks as unknown as string] }).ok).toBe(true);
  });
});

describe('MX', () => {
  it('fails when the domain cannot receive mail at all', () => {
    expect(evaluateMx([]).ok).toBe(false);
  });

  it('accepts the Google Workspace host the domain actually uses', () => {
    expect(evaluateMx(['smtp.google.com.']).ok).toBe(true);
  });

  it('warns rather than fails when mail goes somewhere else', () => {
    const result = evaluateMx(['mx1.privateemail.com', 'mx2.privateemail.com']);
    expect(result.ok).toBe(false);
    expect(result.severity).toBe('warning');
  });
});

describe('the records it tells you to add', () => {
  it('gives a literal SPF and DMARC, and refuses to invent a DKIM key', () => {
    const rows = recommendedRecords({ domain: 'nexphaselabs.net' });
    const spf = rows.find((row) => row.host === '@')!;
    const dmarc = rows.find((row) => row.host === '_dmarc')!;
    const dkim = rows.find((row) => row.host.includes('_domainkey'))!;
    expect(evaluateSpf([spf.value]).ok).toBe(true);
    expect(evaluateDmarc([dmarc.value]).ok).toBe(true);
    expect(dkim.value).toContain('generate in Google Admin');
    expect(dkim.value).not.toMatch(/p=[A-Za-z0-9+/]{40}/);
  });

  it('says to keep the site-verification record separate — that is what makes SPF valid', () => {
    expect(recommendedRecords().find((row) => row.host === '@')!.why).toContain('separate record');
  });
});

describe('the verifier itself', () => {
  it('runs read-only and reports a domain with nothing published', () => {
    // example.com publishes no SPF/DKIM/DMARC and is stable to check against.
    let output = '';
    let code = 0;
    try {
      output = execFileSync('node', ['scripts/dns-verify.mjs', 'example.com', '--json'], {
        encoding: 'utf8',
        stdio: 'pipe',
      });
    } catch (error) {
      const failure = error as { status: number; stdout: string };
      code = failure.status;
      output = failure.stdout;
    }
    const report = JSON.parse(output);
    expect(report.domain).toBe('example.com');
    expect(report.checks.SPF.ok).toBe(false);
    expect(report.checks.DMARC.ok).toBe(false);
    expect(code).toBe(1);
  }, 30_000);
});
