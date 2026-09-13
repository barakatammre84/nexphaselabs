/**
 * Cutover day, checked rather than hoped.
 *
 *   npx tsx scripts/cutover-verify.ts                              # the live domain
 *   npx tsx scripts/cutover-verify.ts https://staging-host --user tester:password
 *   npx tsx scripts/cutover-verify.ts --json > vantage-oakland.json
 *   npx tsx scripts/cutover-verify.ts --compare vantage-a.json vantage-b.json
 *
 * Reads only: it fetches pages. It publishes nothing, changes nothing, and
 * never submits a form.
 *
 * What it answers, in the order it matters on the day:
 *
 *   1. Is the worker healthy?
 *   2. Does every URL the old site had still resolve the way the register
 *      decided — 301 to its equivalent, or 410 if it is genuinely gone?
 *      (Chapter 1. The expectations come from lib/legacy-redirects.ts and the
 *      mirrored URL list, so this cannot drift from the code that serves them.)
 *   3. Is the sitemap there, and does it leak anything it should not?
 *   4. Does robots.txt say what production robots.txt should say?
 *   5. Is the production origin indexable — and no staging origin competing?
 *   6. Warm the top paths and time them.
 *
 * On timings: chapter 11 §11.4 withdrew a 78-second "measurement" that came
 * from the measuring tool rather than the site. The rule adopted afterwards is
 * that no timing enters a register from a single vantage, so this writes a JSON
 * report and compares two of them rather than pronouncing on its own.
 */
import { readFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { legacyDecision, normalisePath } from '../lib/legacy-redirects';

type Check = {
  name: string;
  ok: boolean;
  detail: string;
  severity: 'blocker' | 'warning';
};

type Timing = { path: string; status: number; ms: number; bytes: number };

const args = process.argv.slice(2);
const json = args.includes('--json');
const compare = args.indexOf('--compare');
const credentials = valueOf('--user');
const vantage = valueOf('--vantage') ?? hostname();
const origin = (args.find((arg) => arg.startsWith('http')) ?? 'https://nexphaselabs.net').replace(/\/$/, '');

if (compare !== -1) {
  compareVantages(args[compare + 1], args[compare + 2]);
  process.exit(0);
}

const INDEXED = readFileSync('docs/strategy/2026-09-12-wordpress-indexed-urls.txt', 'utf8')
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean);

const checks: Check[] = [];
const timings: Timing[] = [];

/**
 * Non-production origins must be the mirror image: no sitemap, robots closed,
 * noindex on every page. Checking them against production's expectations would
 * report correct behaviour as three failures, so the environment is read from
 * the health endpoint and the expectations follow it.
 */
let environment = 'unknown';

await health();
await legacyUrls();
const sitemapPaths = await sitemap();
await robots();
await indexability();
await warm(sitemapPaths);

const blockers = checks.filter((check) => !check.ok && check.severity === 'blocker');
report();
process.exit(blockers.length ? 1 : 0);

/* --------------------------------------------------------------- the checks */

async function health() {
  const response = await get('/api/health');
  const body = await response.text().catch(() => '');
  environment = body.match(/"env"\s*:\s*"([^"]+)"/)?.[1] ?? 'unknown';
  checks.push({
    name: 'health',
    ok: response.status === 200 && body.includes('"ok":true'),
    detail: `${response.status} ${body.slice(0, 120)}`,
    severity: 'blocker',
  });
}

async function legacyUrls() {
  const failures: string[] = [];
  let redirected = 0;
  let gone = 0;
  for (const path of INDEXED) {
    if (normalisePath(path) === '/') continue;
    const response = await get(path);
    const location = response.headers.get('location');
    const isProduct = normalisePath(path).startsWith('/product/');
    const expected = legacyDecision(path);

    if (isProduct) {
      // Decided against the catalog: either answer is correct, neither 404 nor 200 is.
      if (response.status === 301 && location) redirected += 1;
      else if (response.status === 410) gone += 1;
      else failures.push(`${path} → ${response.status} (expected 301 to its new page, or 410)`);
      continue;
    }
    if (!expected) {
      // No map entry means the new build is expected to serve this address
      // itself — /about/, /faq/ and /contact/ differ from the new pages only by
      // a trailing slash. The question is simply whether the URL still works.
      const followed = await follow(path);
      if (followed.status === 200) {
        redirected += 1;
        continue;
      }
      failures.push(`${path} → ${followed.status} with no decision in the map; it will 404 at the cutover`);
      continue;
    }
    if (response.status !== expected.status) {
      failures.push(`${path} → ${response.status} (expected ${expected.status})`);
      continue;
    }
    if (expected.status === 301) {
      const target = location ? new URL(location, origin).pathname : '';
      if (target !== expected.location) {
        failures.push(`${path} → 301 to ${target} (expected ${expected.location})`);
        continue;
      }
      if (target === '/') failures.push(`${path} → redirects to the homepage, which reads as a soft 404`);
      redirected += 1;
    } else {
      gone += 1;
    }
  }
  checks.push({
    name: 'old URLs',
    ok: failures.length === 0,
    detail: failures.length
      ? failures.join('\n           ')
      : `${INDEXED.length} indexed paths: ${redirected} redirected, ${gone} gone, 0 left to 404`,
    severity: 'blocker',
  });
}

async function sitemap(): Promise<string[]> {
  const response = await get('/sitemap.xml');
  const body = await response.text().catch(() => '');
  const urls = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  const leaked = urls.filter((url) => /\/(manage|staff|account|api)\b/.test(url));
  if (production()) {
    checks.push({
      name: 'sitemap',
      ok: response.status === 200 && urls.length > 0 && leaked.length === 0,
      detail:
        response.status !== 200
          ? `${response.status} — the sitemap did not arrive. ${body.slice(0, 120)}`
          : leaked.length
            ? `leaks ${leaked.length} private path(s): ${leaked.slice(0, 3).join(', ')}`
            : `${urls.length} URLs, ${urls.filter((url) => url.includes('/catalog/')).length} products, ${urls.filter((url) => url.includes('/lots/')).length} lots`,
      severity: 'blocker',
    });
  } else {
    checks.push({
      name: 'sitemap',
      ok: urls.length === 0,
      detail: urls.length
        ? `${urls.length} URLs on a ${environment} origin — it is competing with the domain in search`
        : `empty, as a ${environment} origin should be`,
      severity: 'blocker',
    });
  }
  return urls.map((url) => new URL(url).pathname);
}

async function robots() {
  const response = await get('/robots.txt');
  const body = await response.text().catch(() => '');
  const blanket = /^\s*disallow:\s*\/\s*$/im.test(body);
  const required = ['/manage', '/staff', '/api', '/account'].filter(
    (path) => !body.toLowerCase().includes(`disallow: ${path}`),
  );
  if (production()) {
    checks.push({
      name: 'robots.txt',
      ok: response.status === 200 && !blanket && required.length === 0 && /sitemap:/i.test(body),
      detail:
        response.status !== 200
          ? `${response.status}`
          : blanket
            ? 'Disallow: / — this origin is telling every crawler to stay out'
            : required.length
              ? `does not disallow ${required.join(', ')}`
              : 'staff and customer paths out, sitemap declared',
      severity: 'blocker',
    });
  } else {
    checks.push({
      name: 'robots.txt',
      ok: blanket,
      detail: blanket
        ? `Disallow: / — correct for a ${environment} origin`
        : `a ${environment} origin must disallow everything; this one does not`,
      severity: 'blocker',
    });
  }
}

async function indexability() {
  const response = await get('/');
  const tag = response.headers.get('x-robots-tag') ?? '';
  const noindex = /noindex/i.test(tag);
  checks.push({
    name: production() ? 'indexable' : 'unindexable',
    ok: production() ? !noindex : noindex,
    detail: production()
      ? noindex
        ? `X-Robots-Tag: ${tag} — the live domain would not be indexed at all`
        : 'no noindex header on the home page'
      : noindex
        ? `X-Robots-Tag: ${tag}`
        : `a ${environment} origin is missing X-Robots-Tag: noindex and can be indexed`,
    severity: 'blocker',
  });
  // A local environment is not reachable from outside, so there is nothing to close.
  if (!production() && !['development', 'test', 'local', 'unknown'].includes(environment)) {
    const anonymous = await fetch(`${origin}/`, { redirect: 'manual' }).catch(() => null);
    checks.push({
      name: 'closed',
      ok: anonymous?.status === 401,
      detail:
        anonymous === null
          ? 'could not be reached'
          : anonymous.status === 401
            ? '401 to an anonymous request'
            : anonymous.status === 503
              ? 'STAGING_ACCESS_PASSWORD is not set, so the environment refuses everyone'
              : `answered ${anonymous.status} to an anonymous request — this origin is OPEN`,
      severity: 'blocker',
    });
  }
}

/** Fetch the top paths once to pull them into the edge cache, and time them. */
async function warm(sitemapPaths: string[]) {
  const paths = [
    '/',
    '/catalog',
    '/documentation',
    '/documentation/lot-lookup',
    '/about',
    '/faq',
    '/contact',
    ...sitemapPaths.filter((path) => path.startsWith('/catalog/') || path.startsWith('/lots/')),
  ]
    .filter((path, index, all) => all.indexOf(path) === index)
    .slice(0, 20);

  for (const path of paths) {
    const started = Date.now();
    const response = await get(path);
    const body = await response.arrayBuffer().catch(() => new ArrayBuffer(0));
    timings.push({ path, status: response.status, ms: Date.now() - started, bytes: body.byteLength });
  }
  const bad = timings.filter((timing) => timing.status >= 400);
  const sorted = [...timings].map((timing) => timing.ms).sort((a, b) => a - b);
  checks.push({
    name: 'warm',
    ok: bad.length === 0,
    detail: bad.length
      ? `${bad.length} of ${timings.length} paths errored: ${bad.map((timing) => `${timing.path} ${timing.status}`).join(', ')}`
      : `${timings.length} paths warmed · median ${sorted[Math.floor(sorted.length / 2)]}ms · slowest ${sorted.at(-1)}ms`,
    severity: 'warning',
  });
}

/* -------------------------------------------------------------- the reports */

function production() {
  return environment === 'production';
}

function report() {
  if (json) {
    console.log(
      JSON.stringify(
        { origin, vantage, environment, checkedAt: new Date().toISOString(), checks, timings },
        null,
        2,
      ),
    );
    return;
  }
  console.log(`\nCutover verification — ${origin}`);
  console.log(`Environment: ${environment} · vantage: ${vantage} · ${new Date().toISOString()}`);
  console.log(
    production()
      ? 'Checked as the live domain: indexable, sitemap present, old URLs redirected.\n'
      : `Checked as a ${environment} origin: closed, unindexable, no sitemap.\n`,
  );
  for (const check of checks) {
    const mark = check.ok ? 'ok  ' : check.severity === 'blocker' ? 'FAIL' : 'warn';
    console.log(`  ${mark} ${check.name.padEnd(10)} ${check.detail}`);
  }
  if (timings.length) {
    console.log('\n  slowest paths');
    for (const timing of [...timings].sort((a, b) => b.ms - a.ms).slice(0, 5)) {
      console.log(`    ${String(timing.ms).padStart(6)}ms  ${timing.status}  ${timing.path}`);
    }
  }
  console.log(
    blockers.length
      ? `\n${blockers.length} blocker(s). Do not move the domain until these are clear.\n`
      : '\nNo blockers.\n',
  );
  console.log('Timings from one machine are not a finding (chapter 11 §11.4). Run this from a second');
  console.log('machine with --json and compare:  npx tsx scripts/cutover-verify.ts --compare a.json b.json\n');
}

function compareVantages(first: string, second: string) {
  const a = JSON.parse(readFileSync(first, 'utf8'));
  const b = JSON.parse(readFileSync(second, 'utf8'));
  console.log(`\n${a.vantage} (${a.checkedAt})  vs  ${b.vantage} (${b.checkedAt})\n`);
  console.log(`  ${'path'.padEnd(34)} ${a.vantage.slice(0, 12).padStart(12)} ${b.vantage.slice(0, 12).padStart(12)}`);
  const byPath = new Map<string, number[]>();
  for (const timing of a.timings as Timing[]) byPath.set(timing.path, [timing.ms, Number.NaN]);
  for (const timing of b.timings as Timing[]) {
    byPath.set(timing.path, [byPath.get(timing.path)?.[0] ?? Number.NaN, timing.ms]);
  }
  for (const [path, [left, right]] of byPath) {
    console.log(`  ${path.padEnd(34)} ${fmt(left)} ${fmt(right)}`);
  }
  const median = (report: { timings: Timing[] }) => {
    const sorted = report.timings.map((timing) => timing.ms).sort((x, y) => x - y);
    return sorted[Math.floor(sorted.length / 2)];
  };
  const ratio = median(a) / median(b);
  console.log(`\n  medians: ${median(a)}ms vs ${median(b)}ms`);
  console.log(
    ratio > 3 || ratio < 1 / 3
      ? '  They disagree by more than 3x. Suspect the measuring path, not the site — that is\n  exactly how the withdrawn 78-second figure was produced.\n'
      : '  They agree closely enough to record.\n',
  );
}

const fmt = (ms: number) => (Number.isNaN(ms) ? '          —' : `${String(Math.round(ms)).padStart(10)}ms`.slice(-12));

/* ------------------------------------------------------------------- plumbing */

function valueOf(flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

/** Follow redirects, so "does this old URL still work" can be answered. */
async function follow(path: string): Promise<Response> {
  return get(path, 'follow');
}

/**
 * One retry, because a cutover-day tool that reports "the sitemap is missing"
 * when a single request was dropped is worse than no tool. 599 means the request
 * never completed twice, and the reason is in the body.
 */
async function get(path: string, redirect: RequestRedirect = 'manual'): Promise<Response> {
  const headers: Record<string, string> = { 'User-Agent': 'nexphase-cutover-verify' };
  if (credentials) headers.Authorization = `Basic ${Buffer.from(credentials).toString('base64')}`;
  let last = '';
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await fetch(`${origin}${path}`, { redirect, headers });
    } catch (error) {
      last = error instanceof Error ? `${error.message}${error.cause instanceof Error ? ` (${error.cause.message})` : ''}` : String(error);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  return new Response(last, { status: 599 });
}
