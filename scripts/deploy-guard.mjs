#!/usr/bin/env node
/**
 * Deploy guard. Refuses to hand a built worker to wrangler unless the built
 * configuration provably targets the environment the operator asked for.
 *
 * Why this exists: on 9 September 2026 a deploy labelled "staging" reached
 * production because the generated dist/server/wrangler.json had been built
 * without CLOUDFLARE_ENV=staging and therefore carried the production name,
 * database and bucket. wrangler deployed exactly what it was given. This script
 * makes the target explicit, checks every environment-bearing field in the
 * built config against it, and fails loudly on any mismatch. It never guesses.
 *
 *   node scripts/deploy-guard.mjs staging
 *   node scripts/deploy-guard.mjs production
 */
import { readFileSync } from 'node:fs';

const EXPECT = {
  staging: {
    name: 'nexphaselabs-staging',
    targetEnvironment: 'staging',
    APP_ENV: 'staging',
    database: 'nexphase-labs-staging',
    bucket: 'nexphase-documents-staging',
    originHost: 'nexphaselabs-staging.ammre.workers.dev',
  },
  production: {
    name: 'nexphaselabs',
    targetEnvironment: undefined,
    APP_ENV: 'production',
    database: 'nexphase-labs',
    bucket: 'nexphase-documents',
    originHost: 'nexphaselabs.net',
  },
};

const target = process.argv[2];
if (!EXPECT[target]) {
  console.error(`deploy-guard: state the target explicitly — "staging" or "production". Got: ${JSON.stringify(target)}`);
  process.exit(2);
}
const want = EXPECT[target];

let built;
try {
  built = JSON.parse(readFileSync('dist/server/wrangler.json', 'utf8'));
} catch (e) {
  console.error('deploy-guard: no built configuration at dist/server/wrangler.json — run the build first.');
  process.exit(2);
}

const got = {
  name: built.name,
  targetEnvironment: built.targetEnvironment,
  APP_ENV: built.vars?.APP_ENV,
  database: built.d1_databases?.[0]?.database_name,
  bucket: built.r2_buckets?.[0]?.bucket_name,
  originHost: (() => { try { return new URL(built.vars?.PUBLIC_ORIGIN ?? '').host; } catch { return undefined; } })(),
};

const mismatches = Object.entries(want).filter(([k, v]) => got[k] !== v);
console.log(`deploy-guard: target=${target}`);
for (const [k, v] of Object.entries(got)) {
  const ok = want[k] === v;
  console.log(`  ${ok ? 'ok ' : 'BAD'} ${k.padEnd(18)} ${String(v)}${ok ? '' : `   (expected ${String(want[k])})`}`);
}
if (mismatches.length) {
  console.error(`\ndeploy-guard: REFUSING to deploy. The built configuration does not target ${target}.`);
  console.error(`Rebuild with ${target === 'staging' ? 'CLOUDFLARE_ENV=staging ' : ''}vinext build and run the guard again.`);
  process.exit(1);
}
if (target === 'production' && process.env.NX_CONFIRM_PRODUCTION !== 'yes') {
  console.error('\ndeploy-guard: production deploys require NX_CONFIRM_PRODUCTION=yes in the environment, so a production release is never a side effect.');
  process.exit(1);
}
console.log(`deploy-guard: configuration targets ${target}. Proceeding.`);
