#!/usr/bin/env node
/**
 * Does the domain authenticate its mail? Answered from several public
 * resolvers, because a record that resolves on one is not yet a fact.
 *
 *   node scripts/dns-verify.mjs                      # nexphaselabs.net
 *   node scripts/dns-verify.mjs example.org --json
 *
 * Reads only. It publishes nothing and changes nothing; adding DNS records is
 * the owner's job and the exact rows to add are printed when something is
 * missing.
 *
 * Chapter 7 F-01 / chapter 11 c11-dns: on 13 September 2026 this domain had no
 * SPF, no DMARC and no DKIM selector, nine days after it was first written down.
 * Every downstream test — order confirmation, verification, reset, recall
 * notice — is untestable until that is fixed.
 */
import { Resolver } from 'node:dns/promises';
import {
  evaluateDkim,
  evaluateDmarc,
  evaluateMx,
  evaluateSpf,
  joinTxt,
  recommendedRecords,
} from './lib/dns-records.mjs';

const RESOLVERS = {
  Cloudflare: '1.1.1.1',
  Google: '8.8.8.8',
  Quad9: '9.9.9.9',
};
const DKIM_SELECTORS = ['google', 'default', 'selector1', 'selector2', 'brevo1', 'brevo2'];

const args = process.argv.slice(2);
const json = args.includes('--json');
const domain = args.find((arg) => !arg.startsWith('--')) ?? 'nexphaselabs.net';

const perResolver = {};
for (const [name, address] of Object.entries(RESOLVERS)) {
  perResolver[name] = await lookUp(address, domain);
}

// The rule adopted after Correction 5: nothing measured from one vantage.
const vantages = Object.entries(perResolver).filter(([, result]) => !result.error);
if (vantages.length === 0) {
  console.error(`Could not reach any resolver. Checked: ${Object.values(RESOLVERS).join(', ')}`);
  process.exit(2);
}
const [, primary] = vantages[0];
const disagreement = vantages
  .slice(1)
  .filter(([, other]) => JSON.stringify(other.txt) !== JSON.stringify(primary.txt))
  .map(([name]) => name);

const checks = {
  MX: evaluateMx(primary.mx),
  SPF: evaluateSpf(primary.txt),
  DKIM: evaluateDkim(primary.dkim),
  DMARC: evaluateDmarc(primary.dmarc),
};

const failed = Object.entries(checks).filter(([, check]) => !check.ok);
const criticalFailures = failed.filter(([, check]) => check.severity === 'critical');

if (json) {
  console.log(JSON.stringify({ domain, checkedAt: new Date().toISOString(), resolvers: perResolver, checks, disagreement }, null, 2));
} else {
  console.log(`\nMail authentication for ${domain}`);
  console.log(`Resolvers: ${vantages.map(([name]) => name).join(', ')}${disagreement.length ? ` — DISAGREE: ${disagreement.join(', ')} (a record may be mid-propagation)` : ''}\n`);
  for (const [name, check] of Object.entries(checks)) {
    const mark = check.ok ? 'ok  ' : check.severity === 'critical' ? 'FAIL' : 'warn';
    console.log(`  ${mark} ${name.padEnd(6)} ${describe(name, check)}`);
    for (const problem of check.problems) console.log(`         ${problem}`);
    if (check.note) console.log(`         ${check.note}`);
  }
  if (criticalFailures.length) {
    console.log('\nRecords to add. Values are literal except where they say otherwise.\n');
    for (const row of recommendedRecords({ domain })) {
      const relevant =
        (row.host === '@' && !checks.SPF.ok) ||
        (row.host === '_dmarc' && !checks.DMARC.ok) ||
        (row.host.includes('_domainkey') && !checks.DKIM.ok);
      if (!relevant) continue;
      console.log(`  ${row.type}  ${row.host}`);
      console.log(`      ${row.value}`);
      console.log(`      ${row.why}\n`);
    }
    console.log('These are additive: adding them cannot break mail that works today.');
    console.log('Re-run this command afterwards. DNS caches, so allow up to an hour.\n');
  } else {
    console.log('\nEvery required record is present.\n');
  }
}

process.exit(criticalFailures.length ? 1 : 0);

async function lookUp(address, name) {
  const resolver = new Resolver({ timeout: 5000, tries: 2 });
  resolver.setServers([address]);
  const result = { txt: [], mx: [], dmarc: [], dkim: {} };
  try {
    result.txt = (await resolver.resolveTxt(name)).map(joinTxt).sort();
  } catch (error) {
    if (error.code !== 'ENODATA' && error.code !== 'ENOTFOUND') return { error: String(error.code ?? error) };
  }
  try {
    result.mx = (await resolver.resolveMx(name)).map((record) => record.exchange);
  } catch {
    result.mx = [];
  }
  try {
    result.dmarc = (await resolver.resolveTxt(`_dmarc.${name}`)).map(joinTxt);
  } catch {
    result.dmarc = [];
  }
  for (const selector of DKIM_SELECTORS) {
    try {
      result.dkim[selector] = (await resolver.resolveTxt(`${selector}._domainkey.${name}`)).map(joinTxt);
    } catch {
      result.dkim[selector] = [];
    }
  }
  return result;
}

function describe(name, check) {
  if (name === 'MX') return check.hosts?.length ? check.hosts.join(', ') : 'none';
  if (name === 'DKIM') return check.selectors?.length ? `selector ${check.selectors.join(', ')}` : 'no selector resolves';
  return check.record ? String(check.record) : 'absent';
}
