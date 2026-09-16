/**
 * What a mail-authenticating domain must publish, and how to tell whether it
 * does. Pure functions — the resolver lives in scripts/dns-verify.mjs — so the
 * rules can be tested without a network (tests/dns-records.test.ts).
 *
 * Chapter 7 / chapter 11 c11-dns: RESOLVED 16 September 2026. nexphaselabs.net now
 * publishes SPF, a google._domainkey selector and DMARC, and `npm run dns:verify`
 * passes against all three resolvers. The earlier text here — "no SPF, no DMARC and
 * no DKIM" — described the zone before the take-back and is no longer true.
 *
 * This module stays because the records still have to be re-checked before and
 * after every zone change, and because DMARC is still p=none. Monitor-only is a
 * starting point, not the finished state.
 */

/** TXT records arrive as arrays of chunks; a long DKIM key is split across them. */
export function joinTxt(record) {
  return Array.isArray(record) ? record.join('') : String(record ?? '');
}

export function findSpf(txtRecords) {
  return txtRecords.map(joinTxt).filter((value) => value.toLowerCase().startsWith('v=spf1'));
}

export function evaluateSpf(txtRecords, { expectInclude = '_spf.google.com' } = {}) {
  const found = findSpf(txtRecords);
  if (found.length === 0) {
    return {
      ok: false,
      severity: 'critical',
      problems: [
        'No SPF record. Any server on the internet can send mail claiming to be this domain,',
        'and receivers have nothing to check it against.',
      ],
    };
  }
  if (found.length > 1) {
    return {
      ok: false,
      severity: 'critical',
      record: found,
      problems: [
        `${found.length} SPF records. More than one is a permanent error (RFC 7208 §4.5) and`,
        'receivers treat the whole domain as unauthenticated. Merge them into one.',
      ],
    };
  }
  const record = found[0];
  const problems = [];
  if (expectInclude && !record.toLowerCase().includes(expectInclude.toLowerCase())) {
    problems.push(`Does not include ${expectInclude}, so mail sent through it is not authorised.`);
  }
  if (!/\s[~-]all\s*$/.test(record)) {
    problems.push(
      record.includes('+all')
        ? 'Ends with +all, which authorises the entire internet. That is worse than no record.'
        : 'Does not end with ~all or -all, so the record makes no statement about anyone else.',
    );
  }
  const lookups = (record.match(/\b(include|a|mx|ptr|exists|redirect)[:=]/gi) ?? []).length;
  if (lookups > 10) {
    problems.push(`${lookups} DNS-lookup mechanisms; the limit is 10 and exceeding it fails the check.`);
  }
  return { ok: problems.length === 0, severity: 'critical', record, problems };
}

export function evaluateDmarc(txtRecords) {
  const found = txtRecords.map(joinTxt).filter((value) => value.toLowerCase().startsWith('v=dmarc1'));
  if (found.length === 0) {
    return {
      ok: false,
      severity: 'critical',
      problems: [
        'No DMARC record. Nobody is told what to do with mail that fails authentication,',
        'and no reports arrive, so a forgery campaign would be invisible.',
      ],
    };
  }
  if (found.length > 1) {
    return { ok: false, severity: 'critical', record: found, problems: ['More than one DMARC record; receivers ignore all of them.'] };
  }
  const record = found[0];
  const policy = record.match(/\bp\s*=\s*(none|quarantine|reject)\b/i)?.[1]?.toLowerCase();
  const problems = [];
  if (!policy) problems.push('No p= policy tag. A DMARC record without one is ignored.');
  if (!/\brua\s*=/i.test(record)) {
    problems.push('No rua= address, so aggregate reports go nowhere and the policy can never be tightened safely.');
  }
  return {
    ok: problems.length === 0,
    severity: 'critical',
    record,
    policy,
    problems,
    note:
      policy === 'none'
        ? 'p=none only monitors. Start there, read the reports, then move to quarantine and reject.'
        : undefined,
  };
}

export function evaluateDkim(selectorRecords) {
  const present = Object.entries(selectorRecords).filter(([, records]) =>
    records.map(joinTxt).some((value) => /v=DKIM1/i.test(value) && /\bp=[A-Za-z0-9+/=]+/.test(value)),
  );
  if (present.length === 0) {
    return {
      ok: false,
      severity: 'critical',
      problems: [
        `No DKIM selector resolves (checked: ${Object.keys(selectorRecords).join(', ') || 'none'}).`,
        'Mail carries no signature, so a receiver cannot tell a real message from a forged one',
        'even when SPF passes — and SPF alone breaks whenever a message is forwarded.',
      ],
    };
  }
  return { ok: true, severity: 'critical', selectors: present.map(([name]) => name), problems: [] };
}

export function evaluateMx(hosts, { expect = ['google.com', 'googlemail.com'] } = {}) {
  if (hosts.length === 0) {
    return { ok: false, severity: 'critical', problems: ['No MX record: this domain cannot receive mail at all.'] };
  }
  const normalised = hosts.map((host) => String(host).replace(/\.$/, '').toLowerCase());
  const unexpected = normalised.filter((host) => !expect.some((suffix) => host.endsWith(suffix)));
  return {
    ok: unexpected.length === 0,
    severity: 'warning',
    hosts: normalised,
    problems: unexpected.length
      ? [`Mail is delivered to ${unexpected.join(', ')}, which is not the provider these checks assume.`]
      : [],
  };
}

/**
 * The records to add, as rows someone can type into a DNS panel. Values that
 * only the provider can generate say so rather than being guessed.
 */
export function recommendedRecords({ domain = 'nexphaselabs.net', reportTo = `dmarc@${domain}` } = {}) {
  return [
    {
      type: 'TXT',
      host: '@',
      value: 'v=spf1 include:_spf.google.com ~all',
      why: 'Authorises Google Workspace to send as this domain, and says every other sender is unauthorised. One SPF record only — keep the existing google-site-verification TXT as a separate record.',
    },
    {
      type: 'TXT',
      host: 'google._domainkey',
      value: '(generate in Google Admin → Apps → Google Workspace → Gmail → Authenticate email, 2048-bit; paste the value it gives you)',
      why: 'Signs outgoing mail. Needs the Workspace super admin, and the key is generated there — it cannot be written down in advance. Turn on authentication AFTER the record resolves.',
    },
    {
      type: 'TXT',
      host: '_dmarc',
      value: `v=DMARC1; p=none; rua=mailto:${reportTo}; fo=1`,
      why: 'Starts in monitoring mode so nothing is rejected while the setup is proved. Read the reports for a fortnight, then move to p=quarantine and later p=reject.',
    },
  ];
}
