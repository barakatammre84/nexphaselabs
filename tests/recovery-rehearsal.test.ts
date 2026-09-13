import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  formatDuration,
  objectManifestDiff,
  rehearsalVerdict,
  renderReport,
} from '@/scripts/lib/rehearsal-report.mjs';

/**
 * 16.4/16.5: the rehearsal had never completed, so the rules for what counts as
 * a completed rehearsal had never been exercised either. The one that matters is
 * that a half-run rehearsal is not evidence.
 */

describe('recovery rehearsal verdict', () => {
  const phase = (name: string, status: string, ms = 1000, reason?: string) =>
    ({ name, status, ms, reason }) as never;

  it('passes only when every phase passed', () => {
    expect(
      rehearsalVerdict({ phases: [phase('d1-export', 'passed'), phase('r2', 'passed')] }).status,
    ).toBe('passed');
  });

  it('calls a skipped document copy incomplete, not passed', () => {
    const verdict = rehearsalVerdict({
      phases: [phase('d1-export', 'passed'), phase('r2', 'skipped', 0, 'no R2 credentials')],
    });
    expect(verdict.status).toBe('incomplete');
    expect(verdict.reasons[0]).toContain('not attempted');
  });

  it('reports a failure ahead of a skip, and says which phase failed', () => {
    const verdict = rehearsalVerdict({
      phases: [phase('d1-export', 'failed', 0, 'auth 10000'), phase('r2', 'skipped')],
    });
    expect(verdict.status).toBe('failed');
    expect(verdict.reasons.join(' ')).toContain('d1-export failed: auth 10000');
  });

  it('does not treat "nothing ran" as a pass', () => {
    expect(rehearsalVerdict({ phases: [] }).status).toBe('incomplete');
  });
});

describe('document manifest comparison', () => {
  const object = (key: string, size: number, etag?: string) => ({ key, size, etag });

  it('accepts an identical restore', () => {
    const source = [object('coa/a.pdf', 10, '"abc"'), object('sds/b.pdf', 20, '"def"')];
    const diff = objectManifestDiff(source, [...source]);
    expect(diff.ok).toBe(true);
    expect(diff.sourceCount).toBe(2);
    expect(diff.sourceBytes).toBe(30);
  });

  it('catches a missing document, which is the failure that matters', () => {
    const diff = objectManifestDiff([object('coa/a.pdf', 10), object('sds/b.pdf', 20)], [object('coa/a.pdf', 10)]);
    expect(diff.ok).toBe(false);
    expect(diff.missing).toEqual(['sds/b.pdf']);
  });

  it('catches a truncated document and an unexpected extra one', () => {
    const diff = objectManifestDiff(
      [object('coa/a.pdf', 100)],
      [object('coa/a.pdf', 60), object('stray.pdf', 1)],
    );
    expect(diff.ok).toBe(false);
    expect(diff.byteMismatches).toEqual([{ key: 'coa/a.pdf', source: 100, restored: 60 }]);
    expect(diff.extra).toEqual(['stray.pdf']);
  });

  it('compares checksums when both sides have one, and ignores quoting', () => {
    expect(objectManifestDiff([object('a', 1, '"abc"')], [object('a', 1, 'abc')]).ok).toBe(true);
    expect(objectManifestDiff([object('a', 1, '"abc"')], [object('a', 1, '"zzz"')]).ok).toBe(false);
    // R2 omits the ETag for multipart objects; an absent one is not a mismatch
    expect(objectManifestDiff([object('a', 1, '"abc"')], [object('a', 1, undefined)]).ok).toBe(true);
  });
});

describe('the report a witness signs', () => {
  const record = {
    environment: 'staging',
    database: 'nexphase-labs-staging',
    bucket: 'nexphase-documents-staging',
    operator: 'ammre',
    startedAt: '2026-09-12T20:00:00.000Z',
    finishedAt: '2026-09-12T20:04:12.000Z',
    dataSummary: '12 documents (3.4 MB) and the staging database',
    phases: [
      { name: 'd1-export', status: 'passed', ms: 42_000 },
      { name: 'd1-restore-verify', status: 'passed', ms: 8_000 },
      { name: 'r2-copy-restore-compare', status: 'passed', ms: 190_000, detail: { sourceCount: 12 } },
    ],
  };

  it('states the measured recovery time rather than leaving it to be inferred', () => {
    const report = renderReport(record as never);
    expect(report).toContain('Elapsed, export to verified restore: 4m 0s');
    expect(report).toContain('## Recovery time');
    expect(report).toContain('12 documents (3.4 MB)');
  });

  it('carries a witness block, because the performer does not accept their own result', () => {
    const report = renderReport(record as never);
    expect(report).toContain('Witness and business acceptance');
    expect(report).toContain('Witness name and role');
    expect(report).toContain('continuity.backup');
  });

  it('says plainly when the rehearsal is not evidence', () => {
    const incomplete = {
      ...record,
      phases: [{ name: 'r2-copy-restore-compare', status: 'skipped', ms: 0, reason: 'no R2 credentials' }],
    };
    const report = renderReport(incomplete as never);
    expect(report).toContain('**Verdict: INCOMPLETE**');
    expect(report).toContain('the control stays open');
  });

  it('formats durations the way an operator reads them', () => {
    expect(formatDuration(900)).toBe('1s');
    expect(formatDuration(65_000)).toBe('1m 5s');
    expect(formatDuration(3_725_000)).toBe('1h 2m 5s');
    expect(formatDuration(Number.NaN)).toBe('unknown');
  });
});

describe('the rehearsal driver refuses before it touches anything', () => {
  const run = (args: string[], env: Record<string, string> = {}) => {
    try {
      const stdout = execFileSync('node', ['scripts/recovery-rehearsal.mjs', ...args], {
        encoding: 'utf8',
        stdio: 'pipe',
        env: { ...process.env, ...env },
      });
      return { code: 0, output: stdout };
    } catch (error) {
      const failure = error as { status: number; stdout: string; stderr: string };
      return { code: failure.status, output: `${failure.stdout}${failure.stderr}` };
    }
  };

  it('will not guess the environment or the output directory', () => {
    expect(run([]).code).toBe(2);
    expect(run(['staging']).code).toBe(2);
    expect(run(['prod', '/tmp/whatever']).code).toBe(2);
  });

  it('refuses production without the maintenance-window confirmation', () => {
    const result = run(['production', join(tmpdir(), 'nexphase-rehearsal-test')], {
      NEXPHASE_CONFIRM_PRODUCTION_BACKUP: '',
    });
    expect(result.code).toBe(2);
    expect(result.output).toContain('NEXPHASE_CONFIRM_PRODUCTION_BACKUP=yes');
  });

  it('refuses to write into the repository or a home directory', () => {
    expect(run(['staging', process.cwd()]).code).toBe(2);
    expect(run(['staging', process.env.HOME ?? '/nonexistent']).code).toBe(2);
  });

  it('stops at the credential check and still writes a signed-off-able record', () => {
    const directory = mkdtempSync(join(tmpdir(), 'nexphase-rehearsal-'));
    const result = run(['staging', directory], { CLOUDFLARE_API_TOKEN: '' });
    expect(result.code).toBe(1);
    expect(result.output).toContain('CLOUDFLARE_API_TOKEN is not set');
    const written = readdirSync(directory);
    const json = written.find((name) => name.endsWith('.json'));
    const markdown = written.find((name) => name.endsWith('.md'));
    expect(json).toBeDefined();
    expect(markdown).toBeDefined();
    const record = JSON.parse(readFileSync(join(directory, json!), 'utf8'));
    expect(record.verdict.status).toBe('failed');
    expect(record.phases[0].name).toBe('preflight');
    // no database export was attempted
    expect(written.some((name) => name.endsWith('.sql'))).toBe(false);
  });
});
