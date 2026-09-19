#!/usr/bin/env node
/**
 * Staging access boundary check — the last step of deploy-staging.yml.
 *
 * Staging runs in one of two access modes. This reads which one from the BUILT
 * configuration — the file that was just deployed — and never infers it from
 * what the server answers. Inferring it would wave through a storefront that is
 * open by accident, which is what 16.3 was on 12 September 2026.
 *
 * What each mode must answer is defined once, in scripts/lib/staging-access.mjs:
 * open, a public storefront with the staff area and private APIs still behind
 * their own logins; closed, the password challenge on every path; noindex on
 * every answer in both. scripts/cutover-verify.ts proves the same boundary on
 * cutover day.
 *
 *   node scripts/staging-access-check.mjs https://<staging-host> [dist/server/wrangler.json]
 *
 * Exit 0: the boundary holds. Exit 1: it does not, and the deploy has failed.
 * Exit 2: the check could not run as asked. tests/staging-access-check.test.ts
 * runs this script against a stand-in staging worker in each state and reads the
 * exit code.
 */
import { proveAccessBoundary, readAccessMode } from './lib/staging-access.mjs';

const [originArgument, configPath = 'dist/server/wrangler.json'] = process.argv.slice(2);

const origin = parseOrigin(originArgument);
if (!origin) {
  console.error(`staging-access-check: name the staging origin first, e.g. https://nexphaselabs-staging.<subdomain>.workers.dev. Got: ${JSON.stringify(originArgument)}`);
  process.exit(2);
}

let access;
try {
  access = readAccessMode(configPath);
} catch (error) {
  console.error(`staging-access-check: ${error.message}`);
  process.exit(2);
}
const { mode, declared } = access;

console.log(`staging-access-check: ${origin}`);
console.log(`  mode ${mode} — STAGING_ACCESS_OPEN is ${declared === undefined ? 'not declared' : JSON.stringify(declared)} in ${configPath}`);

const failures = [];
for await (const verdict of proveAccessBoundary(origin, mode)) {
  console.log(`  ${verdict.ok ? 'ok ' : 'BAD'} ${verdict.kind.padEnd(8)}${verdict.path.padEnd(33)}${verdict.detail}`);
  if (!verdict.ok) failures.push(verdict);
}

if (failures.length) {
  console.error(`\nstaging-access-check: REFUSING this deploy — the ${mode}-mode boundary does not hold.`);
  for (const hint of new Set(failures.map((failure) => failure.hint))) console.error(`  ${hint}`);
  process.exit(1);
}
console.log(
  mode === 'open'
    ? 'staging-access-check: the boundary holds. Public paths answer 200, staff pages send strangers to sign-in, private APIs refuse them, and every answer is noindex.'
    : 'staging-access-check: the boundary holds. Every path is challenged for the staging password, and every answer is noindex.',
);

function parseOrigin(value) {
  try {
    const url = new URL(value ?? '');
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : null;
  } catch {
    return null;
  }
}
