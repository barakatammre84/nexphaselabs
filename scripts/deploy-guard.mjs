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
 *
 * A second argument names a different built configuration to check; it exists so
 * tests/deploy-guard.test.ts can prove the refusals rather than trusting them.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const EXPECT = {
  staging: {
    name: 'nexphaselabs-staging',
    targetEnvironment: 'staging',
    APP_ENV: 'staging',
    database: 'nexphase-labs-staging',
    bucket: 'nexphase-documents-staging',
    originHost: 'nexphaselabs-staging.nexphase.workers.dev',
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
const configPath = process.argv[3] ?? 'dist/server/wrangler.json';

let built;
try {
  built = JSON.parse(readFileSync(configPath, 'utf8'));
} catch {
  console.error(`deploy-guard: no built configuration at ${configPath} — run the build first.`);
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
if (target === 'production') {
  if (process.env.NX_CONFIRM_PRODUCTION !== 'yes') {
    console.error('\ndeploy-guard: production deploys require NX_CONFIRM_PRODUCTION=yes in the environment, so a production release is never a side effect.');
    process.exit(1);
  }
  const release = releaseTag();
  if (!release.tag || !release.tag.startsWith('v')) {
    console.error('\ndeploy-guard: REFUSING to deploy. Production is released from a version tag and nothing else.');
    console.error(release.tag
      ? `HEAD is at "${release.tag}", which is not a v* tag.`
      : 'HEAD is not at a tag. Tag the reviewed commit (git tag -a v1.2.3 -m "…" && git push origin v1.2.3) and let deploy-production.yml run it.');
    process.exit(1);
  }
  if (release.fromGit && workingTreeDirty()) {
    console.error(`\ndeploy-guard: REFUSING to deploy. HEAD is at ${release.tag} but the working tree has uncommitted changes,`);
    console.error('so what would be uploaded is not what the tag names. Commit or stash, then re-tag if the content changed.');
    process.exit(1);
  }
  console.log(`  ok  releaseTag         ${release.tag}`);
}
console.log(`deploy-guard: configuration targets ${target}. Proceeding.`);

/**
 * Where the release tag comes from, most explicit first:
 *   NX_RELEASE_TAG   stated outright (also how the tests pin this deterministically;
 *                    set and empty means "no tag", which is a refusal)
 *   GITHUB_REF_*     a tag push or a workflow_dispatch whose ref is a tag
 *   git              a local deploy — the break-glass path, which also has to be clean
 */
function releaseTag() {
  if (process.env.NX_RELEASE_TAG !== undefined) {
    return { tag: process.env.NX_RELEASE_TAG.trim() || null, fromGit: false };
  }
  if (process.env.GITHUB_REF_TYPE === 'tag') {
    return { tag: (process.env.GITHUB_REF_NAME ?? '').trim() || null, fromGit: false };
  }
  return { tag: git(['describe', '--tags', '--exact-match', 'HEAD']), fromGit: true };
}

function workingTreeDirty() {
  const status = git(['status', '--porcelain']);
  return status === null ? false : status.length > 0;
}

function git(args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}
