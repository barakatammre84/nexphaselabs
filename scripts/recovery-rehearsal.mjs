#!/usr/bin/env node
/**
 * One command that runs the whole recovery rehearsal and times it.
 *
 * 16.4: the pieces existed — D1 export, checksum manifest, isolated restore
 * verification — but the rehearsal had never completed end to end. The export
 * failed with Cloudflare auth error 10000 and stopped there, so no recovery time
 * was ever measured. This driver does the sequence in order, checks the
 * credentials BEFORE it touches anything, times every phase, and writes a report
 * that a witness can sign.
 *
 *   node scripts/recovery-rehearsal.mjs staging /absolute/private/recovery-dir
 *   NEXPHASE_CONFIRM_PRODUCTION_BACKUP=yes node scripts/recovery-rehearsal.mjs production /abs/dir
 *
 * Credentials, all read from the environment, never written down:
 *   CLOUDFLARE_API_TOKEN        D1 export (Workers + D1 read)
 *   CLOUDFLARE_ACCOUNT_ID       optional; read from wrangler.jsonc when absent
 *   R2_ACCESS_KEY_ID            R2 S3 credentials, read for the source bucket,
 *   R2_SECRET_ACCESS_KEY        write for the isolated rehearsal bucket
 *
 * Without the R2 credentials the document half is SKIPPED and the rehearsal is
 * reported INCOMPLETE. A database without its evidence files is not a recovery.
 *
 * Nothing here writes to a source database or bucket. The restore goes into a
 * new bucket named ...-rehearsal-<stamp>, which the script never deletes on its
 * own; the delete command is printed at the end.
 */
import { createHash, createHmac } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { objectManifestDiff, rehearsalVerdict, renderReport, formatDuration } from './lib/rehearsal-report.mjs';

const ENVIRONMENTS = {
  staging: { database: 'nexphase-labs-staging', bucket: 'nexphase-documents-staging' },
  production: { database: 'nexphase-labs', bucket: 'nexphase-documents' },
};

const environment = process.argv[2];
const outputDirectory = process.argv[3];
const options = new Set(process.argv.slice(4));

if (!ENVIRONMENTS[environment] || !outputDirectory) {
  console.error('Usage: node scripts/recovery-rehearsal.mjs <staging|production> <private-output-directory> [--skip-r2]');
  process.exit(2);
}
if (environment === 'production' && process.env.NEXPHASE_CONFIRM_PRODUCTION_BACKUP !== 'yes') {
  console.error('Production export refused. Set NEXPHASE_CONFIRM_PRODUCTION_BACKUP=yes for the approved read-only maintenance window.');
  process.exit(2);
}

const { database, bucket } = ENVIRONMENTS[environment];
const directory = resolve(outputDirectory);
if ([resolve('.'), resolve(process.env.HOME ?? '/nonexistent'), '/'].includes(directory)) {
  console.error('Choose a dedicated private directory, not the repository, your home directory, or the filesystem root.');
  process.exit(2);
}
mkdirSync(directory, { recursive: true, mode: 0o700 });

const stamp = new Date().toISOString().replaceAll(':', '').replaceAll('.', '-');
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || accountIdFromWranglerConfig();
const startedAt = new Date().toISOString();
/** @type {import('./lib/rehearsal-report.mjs').Phase[]} */
const phases = [];
let dataSummary = null;

step('1/4  Credentials and access');
const preflightStart = Date.now();
const preflight = checkCredentials();
report('preflight', preflight.ok ? 'passed' : 'failed', preflightStart, preflight.detail, preflight.reason);
if (!preflight.ok) finish(1);

step('2/4  Export the database');
const exportStart = Date.now();
const exported = exportDatabase();
report('d1-export', exported.ok ? 'passed' : 'failed', exportStart, exported.detail, exported.reason);
if (!exported.ok) finish(1);

step('3/4  Restore into an isolated database and check it');
const restoreStart = Date.now();
const restored = verifyRestore(exported.detail.sqlPath);
report('d1-restore-verify', restored.ok ? 'passed' : 'failed', restoreStart, restored.detail, restored.reason);
if (!restored.ok) finish(1);

step('4/4  Copy the documents and restore them into an isolated bucket');
const r2Start = Date.now();
const documents = await rehearseDocuments();
report('r2-copy-restore-compare', documents.status, r2Start, documents.detail, documents.reason);

finish(rehearsalVerdict({ phases }).status === 'passed' ? 0 : 1);

/* ------------------------------------------------------------------ phases */

function checkCredentials() {
  const problems = [];
  if (!process.env.CLOUDFLARE_API_TOKEN) {
    problems.push('CLOUDFLARE_API_TOKEN is not set. The D1 export cannot authenticate without it.');
  }
  if (!accountId) {
    problems.push('No account id: set CLOUDFLARE_ACCOUNT_ID, or keep account_id in wrangler.jsonc.');
  }
  const whoami = spawnSync('npx', ['wrangler', 'whoami'], { encoding: 'utf8' });
  const output = `${whoami.stdout ?? ''}${whoami.stderr ?? ''}`;
  if (whoami.status !== 0) {
    problems.push(
      output.includes('10000')
        ? [
            'Cloudflare returned authentication error 10000 — this is the failure that stopped the rehearsal before.',
            'It means the token was rejected, not that the database is missing. Check, in this order:',
            '  · the token exists and has not expired (Cloudflare dashboard → My Profile → API Tokens)',
            '  · its permissions include Account · D1 · Edit and Account · Workers R2 Storage · Edit',
            '  · its account scope is the account holding this database',
            '  · the shell really has it: it must be exported, not just present in a file',
          ].join('\n')
        : `wrangler whoami failed:\n${output.trim()}`,
    );
  }
  return {
    ok: problems.length === 0,
    reason: problems.join('\n') || undefined,
    detail: {
      accountId: accountId ? `${accountId.slice(0, 6)}…` : null,
      apiToken: process.env.CLOUDFLARE_API_TOKEN ? 'present' : 'missing',
      r2Credentials: r2CredentialsPresent() ? 'present' : 'missing',
      wranglerWhoami: whoami.status === 0 ? 'ok' : 'failed',
    },
  };
}

function exportDatabase() {
  const result = spawnSync('node', ['scripts/d1-backup.mjs', environment, directory], { encoding: 'utf8' });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  process.stdout.write(output);
  if (result.status !== 0) {
    return { ok: false, reason: 'scripts/d1-backup.mjs exited non-zero', detail: { output: output.slice(-4000) } };
  }
  const parsed = lastJsonObject(result.stdout ?? '');
  if (!parsed?.sqlPath) {
    return { ok: false, reason: 'the export produced no manifest', detail: { output: output.slice(-4000) } };
  }
  return { ok: true, detail: parsed };
}

function verifyRestore(sqlPath) {
  const result = spawnSync('node', ['scripts/d1-restore-verify.mjs', sqlPath], { encoding: 'utf8' });
  const parsed = lastJsonObject(result.stdout ?? '');
  if (result.status !== 0 || !parsed?.ok) {
    return {
      ok: false,
      reason: 'integrity, foreign-key or required-table check failed',
      detail: parsed ?? { output: `${result.stdout ?? ''}${result.stderr ?? ''}`.slice(-4000) },
    };
  }
  return { ok: true, detail: parsed };
}

async function rehearseDocuments() {
  if (options.has('--skip-r2')) {
    return { status: 'skipped', reason: 'asked for with --skip-r2', detail: {} };
  }
  if (!r2CredentialsPresent()) {
    return {
      status: 'skipped',
      reason: 'R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY are not set, so the documents were not copied',
      detail: {},
    };
  }
  const rehearsalBucket = `${bucket}-rehearsal-${stamp.slice(0, 10).toLowerCase()}`;
  try {
    const source = await listObjects(bucket);
    const objectDirectory = resolve(directory, `${bucket}-${stamp}`);
    mkdirSync(objectDirectory, { recursive: true, mode: 0o700 });
    const manifest = [];
    for (const object of source) {
      const body = await getObject(bucket, object.key);
      const target = resolve(objectDirectory, object.key.replaceAll('/', '__'));
      writeFileSync(target, body, { mode: 0o600 });
      manifest.push({ ...object, sha256: createHash('sha256').update(body).digest('hex') });
    }
    writeFileSync(
      resolve(directory, `${bucket}-${stamp}.objects.json`),
      `${JSON.stringify({ bucket, createdAt: new Date().toISOString(), objects: manifest }, null, 2)}\n`,
      { mode: 0o600 },
    );

    await createBucket(rehearsalBucket);
    for (const object of manifest) {
      const body = readFileSync(resolve(objectDirectory, object.key.replaceAll('/', '__')));
      await putObject(rehearsalBucket, object.key, body);
    }
    const restoredObjects = await listObjects(rehearsalBucket);
    const diff = objectManifestDiff(source, restoredObjects);
    dataSummary = `${diff.sourceCount} documents (${(diff.sourceBytes / 1_000_000).toFixed(1)} MB) and the ${environment} database`;
    return {
      status: diff.ok ? 'passed' : 'failed',
      reason: diff.ok ? undefined : 'the isolated restore does not match the source bucket',
      detail: { sourceBucket: bucket, rehearsalBucket, ...diff, samples: manifest.slice(0, 5).map((o) => ({ key: o.key, size: o.size, sha256: o.sha256.slice(0, 16) })) },
    };
  } catch (error) {
    return {
      status: 'failed',
      reason: String(error?.message ?? error),
      detail: { sourceBucket: bucket, rehearsalBucket },
    };
  }
}

/* --------------------------------------------------------------- R2 via S3 */

function r2CredentialsPresent() {
  return Boolean(process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY);
}

function r2Endpoint() {
  return `https://${accountId}.r2.cloudflarestorage.com`;
}

async function listObjects(name) {
  const objects = [];
  let token;
  do {
    const query = new URLSearchParams({ 'list-type': '2', 'max-keys': '1000' });
    if (token) query.set('continuation-token', token);
    const response = await s3('GET', `/${name}`, { query });
    const xml = await response.text();
    for (const block of xml.match(/<Contents>[\s\S]*?<\/Contents>/g) ?? []) {
      objects.push({
        key: decodeXml(block.match(/<Key>([\s\S]*?)<\/Key>/)?.[1] ?? ''),
        size: Number(block.match(/<Size>(\d+)<\/Size>/)?.[1] ?? 0),
        etag: block.match(/<ETag>([\s\S]*?)<\/ETag>/)?.[1]?.replaceAll('&quot;', '').replaceAll('"', ''),
      });
    }
    token = xml.includes('<IsTruncated>true</IsTruncated>')
      ? decodeXml(xml.match(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/)?.[1] ?? '')
      : undefined;
  } while (token);
  return objects;
}

async function getObject(name, key) {
  const response = await s3('GET', `/${name}/${encodeKey(key)}`);
  return Buffer.from(await response.arrayBuffer());
}

async function putObject(name, key, body) {
  await s3('PUT', `/${name}/${encodeKey(key)}`, { body });
}

async function createBucket(name) {
  try {
    await s3('PUT', `/${name}`);
  } catch (error) {
    // an existing rehearsal bucket from the same day is fine to reuse
    if (!String(error.message).includes('BucketAlreadyOwnedByYou')) throw error;
  }
}

/** Minimal AWS SigV4 for the R2 S3 API. region "auto", service "s3". */
async function s3(method, path, { query, body } = {}) {
  const url = new URL(`${r2Endpoint()}${path}`);
  if (query) url.search = query.toString();
  const payload = body ?? Buffer.alloc(0);
  const payloadHash = createHash('sha256').update(payload).digest('hex');
  const now = new Date();
  const amzDate = `${now.toISOString().replaceAll('-', '').replaceAll(':', '').slice(0, 15)}Z`;
  const dateStamp = amzDate.slice(0, 8);
  const canonicalQuery = [...url.searchParams.entries()]
    .map(([k, v]) => [encodeRfc3986(k), encodeRfc3986(v)])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  const canonicalHeaders = `host:${url.host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = [method, url.pathname, canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const scope = `${dateStamp}/auto/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    createHash('sha256').update(canonicalRequest).digest('hex'),
  ].join('\n');
  let key = createHmac('sha256', `AWS4${process.env.R2_SECRET_ACCESS_KEY}`).update(dateStamp).digest();
  for (const part of ['auto', 's3', 'aws4_request']) key = createHmac('sha256', key).update(part).digest();
  const signature = createHmac('sha256', key).update(stringToSign).digest('hex');
  const init = {
    method,
    headers: {
      authorization: `AWS4-HMAC-SHA256 Credential=${process.env.R2_ACCESS_KEY_ID}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
    },
  };
  if (method !== 'GET') init.body = payload;
  const response = await fetch(url, init);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`R2 ${method} ${url.pathname} → ${response.status}. ${text.slice(0, 400)}`);
  }
  return response;
}

const encodeRfc3986 = (value) =>
  encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const encodeKey = (key) => key.split('/').map(encodeRfc3986).join('/');
const decodeXml = (value) =>
  value.replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&#39;', "'");

/* -------------------------------------------------------------- bookkeeping */

function report(name, status, startedMs, detail, reason) {
  phases.push({ name, status, ms: Date.now() - startedMs, detail, reason });
  const mark = status === 'passed' ? 'ok' : status === 'skipped' ? '--' : 'FAILED';
  console.log(`     ${mark}  ${name}  (${formatDuration(Date.now() - startedMs)})`);
  if (reason) console.log(`         ${reason.split('\n').join('\n         ')}`);
}

function step(label) {
  console.log(`\n${label}`);
}

function finish(code) {
  const record = {
    format: 'nexphase-recovery-rehearsal-v1',
    environment,
    database,
    bucket,
    operator: process.env.USER ?? 'unknown',
    startedAt,
    finishedAt: new Date().toISOString(),
    dataSummary,
    phases,
    verdict: rehearsalVerdict({ phases }),
  };
  const jsonPath = resolve(directory, `recovery-rehearsal-${stamp}.json`);
  const reportPath = resolve(directory, `recovery-rehearsal-${stamp}.md`);
  writeFileSync(jsonPath, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
  writeFileSync(reportPath, renderReport(record), { mode: 0o600 });
  const elapsed = phases.reduce((sum, phase) => sum + phase.ms, 0);
  console.log(`\nVerdict: ${record.verdict.status.toUpperCase()}`);
  for (const reason of record.verdict.reasons) console.log(`  · ${reason}`);
  console.log(`Elapsed, export to verified restore: ${formatDuration(elapsed)}`);
  console.log(`Report:  ${reportPath}`);
  console.log(`Record:  ${jsonPath}`);
  if (record.verdict.status === 'passed') {
    console.log('\nNext: have Melissa or Wisam witness the result, sign the block at the end of the report,');
    console.log('and link it against the continuity.backup operating control.');
  }
  const rehearsalBucket = phases.find((p) => p.detail?.rehearsalBucket)?.detail?.rehearsalBucket;
  if (rehearsalBucket) {
    console.log(`\nThe isolated bucket ${rehearsalBucket} was left in place deliberately. Delete it when the`);
    console.log(`evidence is filed:  npx wrangler r2 bucket delete ${rehearsalBucket}`);
  }
  process.exit(code);
}

function lastJsonObject(text) {
  const start = text.lastIndexOf('\n{');
  const candidate = start === -1 ? text.slice(text.indexOf('{')) : text.slice(start);
  try {
    return JSON.parse(candidate.trim());
  } catch {
    return null;
  }
}

function accountIdFromWranglerConfig() {
  try {
    const source = readFileSync(resolve('wrangler.jsonc'), 'utf8');
    return source.match(/"account_id"\s*:\s*"([^"]+)"/)?.[1] ?? null;
  } catch {
    return null;
  }
}
