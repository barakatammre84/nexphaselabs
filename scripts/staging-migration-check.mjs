#!/usr/bin/env node
/**
 * Read-only staging release and D1 migration proof.
 *
 * The health endpoint reports the migration history seen by the deployed
 * staging Worker. This check compares it with the journal in the checkout
 * that was built and with the commit GitHub Actions intended to deploy.
 *
 *   node scripts/staging-migration-check.mjs https://staging.example SHA
 *
 * Exit 0 only when the current staging Worker is the intended release and its
 * D1 history exactly matches the build manifest. Production is never accepted.
 */
import { readFileSync } from 'node:fs';

const [originArgument, expectedRelease] = process.argv.slice(2);
const ATTEMPTS = 6;
const DELAY_MS = Number(process.env.STAGING_MIGRATION_CHECK_DELAY_MS ?? 10_000);

const origin = parseOrigin(originArgument);
if (!origin || !expectedRelease) {
  console.error('staging-migration-check: usage: node scripts/staging-migration-check.mjs <staging-origin> <expected-release>');
  process.exit(2);
}

let expectedMigrations;
try {
  const journal = JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8'));
  expectedMigrations = (journal.entries ?? []).map((entry) => entry.tag).filter((tag) => typeof tag === 'string');
} catch {
  console.error('staging-migration-check: could not read drizzle/meta/_journal.json.');
  process.exit(2);
}
if (expectedMigrations.length === 0) {
  console.error('staging-migration-check: the migration journal is empty.');
  process.exit(2);
}

console.log(`staging-migration-check: ${origin}`);
console.log(`  release ${expectedRelease}`);
console.log(`  expected migrations ${expectedMigrations.length}, latest ${expectedMigrations.at(-1)}`);

let last;
for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
  last = await readHealth(origin);
  if (last.ok && matches(last.health, expectedMigrations, expectedRelease)) {
    console.log(`staging-migration-check: release and ${expectedMigrations.length} migrations are current.`);
    process.exit(0);
  }
  if (attempt < ATTEMPTS) await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
}

console.error(`staging-migration-check: refusing smoke test after ${ATTEMPTS} attempts.`);
console.error(`  last response: ${last?.detail ?? 'none'}`);
console.error(`  expected release: ${expectedRelease}`);
console.error(`  expected latest migration: ${expectedMigrations.at(-1)}`);
process.exit(1);

async function readHealth(base) {
  try {
    const response = await fetch(`${base}/api/health`, {
      headers: { 'user-agent': 'nexphase-staging-migration-check' },
      signal: AbortSignal.timeout(20_000),
    });
    const text = await response.text();
    let health;
    try {
      health = JSON.parse(text);
    } catch {
      return { ok: false, detail: `${response.status}, non-JSON response` };
    }
    return { ok: response.ok, health, detail: `${response.status}, ${summarize(health)}` };
  } catch (error) {
    return { ok: false, detail: `unreachable (${error?.cause?.code ?? error?.name ?? String(error)})` };
  }
}

function matches(health, expected, release) {
  return (
    health?.env === 'staging' &&
    health.release === release &&
    health.ok === true &&
    health.migration?.ok === true &&
    sameMigrationSet(health.migration.expected, expected) &&
    sameMigrationSet(health.migration.applied, expected)
  );
}

function sameMigrationSet(actual, expected) {
  if (!Array.isArray(actual) || actual.length !== expected.length) return false;
  const actualSorted = [...actual].sort();
  const expectedSorted = [...expected].sort();
  return expectedSorted.every((tag, index) => tag === actualSorted[index]);
}

function summarize(health) {
  const migration = health?.migration;
  return `env=${health?.env ?? 'missing'} release=${health?.release ?? 'missing'} ok=${health?.ok ?? false} migration=${migration?.applied?.at(-1) ?? 'missing'}`;
}

function parseOrigin(value) {
  try {
    const url = new URL(value ?? '');
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : null;
  } catch {
    return null;
  }
}