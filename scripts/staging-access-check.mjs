#!/usr/bin/env node
/**
 * Staging access boundary check — the last step of deploy-staging.yml.
 *
 * Staging runs in one of two access modes. This reads which one from the BUILT
 * configuration — the file that was just deployed — and never infers it from
 * what the server answers. Inferring it would wave through a storefront that is
 * open by accident, which is what 16.3 was on 12 September 2026.
 *
 *   open    vars.STAGING_ACCESS_OPEN is exactly "true": the owner chose public
 *           staging on 14 September 2026. Public pages must answer 200. Staff
 *           pages must still send a stranger to staff sign-in, and private APIs
 *           must still refuse one — opening the storefront opens neither the
 *           staff area nor anyone's records.
 *   closed  anything else. The Basic-auth gate (lib/environment-gate.ts) must
 *           challenge every path with 401 before the application sees it.
 *
 * In both modes every answer must carry X-Robots-Tag: noindex. Redirects are
 * read, never followed, so a sign-in page answering 200 cannot stand in for the
 * staff page that redirected to it.
 *
 *   node scripts/staging-access-check.mjs https://<staging-host> [dist/server/wrangler.json]
 *
 * Exit 0: the boundary holds. Exit 1: it does not, and the deploy has failed.
 * Exit 2: the check could not run as asked. tests/staging-access-check.test.ts
 * runs this script against a stand-in staging worker in each state and reads the
 * exit code.
 */
import { readFileSync } from 'node:fs';

// Anyone may read these. The favicon is a static file that reaches visitors
// through the worker (assets.run_worker_first), so it must be unindexable too.
const PUBLIC_PATHS = ['/', '/catalog', '/favicon.svg'];
// Staff pages: the application redirects an anonymous request to staff sign-in.
const STAFF_PAGES = ['/manage', '/manage/orders', '/manage/controls'];
// Private APIs: two staff reports (customer names, addresses, lot costs) and a
// customer's own invoice. Each must refuse a request that carries no login.
const PRIVATE_APIS = [
  '/api/manage/reports/orders.csv',
  '/api/manage/reports/lots.csv',
  '/api/orders/NX-00000/invoice',
];
const STAFF_SIGN_IN = '/staff/sign-in';
const REDIRECTS = [301, 302, 303, 307, 308];
const NETWORK_ATTEMPTS = 3;
const PROPAGATION_ATTEMPTS = 6;
const PROPAGATION_DELAY_MS = 2_000;

const [originArgument, configPath = 'dist/server/wrangler.json'] = process.argv.slice(2);

const origin = parseOrigin(originArgument);
if (!origin) {
  console.error(`staging-access-check: name the staging origin first, e.g. https://nexphaselabs-staging.<subdomain>.workers.dev. Got: ${JSON.stringify(originArgument)}`);
  process.exit(2);
}

let built;
try {
  built = JSON.parse(readFileSync(configPath, 'utf8'));
} catch {
  console.error(`staging-access-check: no built configuration at ${configPath} — run the staging build first.`);
  process.exit(2);
}
if (built.vars?.APP_ENV !== 'staging') {
  console.error(`staging-access-check: ${configPath} is not a staging build (APP_ENV is ${JSON.stringify(built.vars?.APP_ENV)}).`);
  process.exit(2);
}

const declared = built.vars?.STAGING_ACCESS_OPEN;
// The gate's own rule: exactly "true" opens staging, and nothing looser does.
const mode = declared === 'true' ? 'open' : 'closed';

console.log(`staging-access-check: ${origin}`);
console.log(`  mode ${mode} — STAGING_ACCESS_OPEN is ${declared === undefined ? 'not declared' : JSON.stringify(declared)} in ${configPath}`);

const probes = [
  ...PUBLIC_PATHS.map((path) => ({ kind: 'public', path })),
  ...STAFF_PAGES.map((path) => ({ kind: 'staff', path })),
  ...PRIVATE_APIS.map((path) => ({ kind: 'private', path })),
];

const failures = [];
for (const probe of probes) {
  const answer = await ask(probe.path);
  const verdict = answer.unreachable
    ? fail(`could not be reached (${answer.unreachable})`, `${origin} did not answer, so nothing after ${probe.path} was checked.`)
    : mode === 'open'
      ? openBoundary(probe, answer)
      : closedBoundary(probe, answer);
  console.log(`  ${verdict.ok ? 'ok ' : 'BAD'} ${probe.kind.padEnd(8)}${probe.path.padEnd(33)}${verdict.detail}`);
  if (!verdict.ok) failures.push(verdict);
  if (answer.unreachable) break;
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

/** Open mode: the storefront is public; the staff area and private records are not. */
function openBoundary({ kind }, answer) {
  const { status } = answer;
  if (answer.basicChallenge) {
    return fail(
      `${status}, challenged for the staging password`,
      'The configuration declares open mode but the worker still asks for the password: the deploy did not land, or this is not the build that was deployed.',
    );
  }
  if (kind === 'public') {
    return status === 200
      ? unindexable(answer, '200')
      : fail(`${status}, expected 200`, 'A public page is not answering. Read the worker logs: npx wrangler tail --env staging');
  }
  if (status >= 200 && status < 300) {
    return fail(
      `${status} — served to a request with no login`,
      'A staff page or private API answered a stranger. Roll staging back (npx wrangler rollback --env staging) and fix that route before redeploying: opening the storefront never opens the staff area.',
    );
  }
  const target = kind === 'staff' ? signInTarget(answer) : null;
  if (target) return unindexable(answer, `${status} → ${target}`);
  if (status === 401 || status === 403) return unindexable(answer, String(status));
  return fail(
    `${status}${answer.location ? ` → ${answer.location}` : ''}, expected ${kind === 'staff' ? `a redirect to ${STAFF_SIGN_IN}` : '401'}`,
    'A private path answered with something other than its login, which is not proof that the login is still in front of it.',
  );
}

/** Closed mode: the Basic-auth gate answers before the application does. */
function closedBoundary({ kind }, answer) {
  const { status } = answer;
  if (status === 401 && answer.basicChallenge) return unindexable(answer, '401, challenged for the staging password');
  if (status === 503) {
    return fail(
      '503 — refused: no staging password is set',
      'STAGING_ACCESS_PASSWORD is not set, so staging refuses everyone. Set it (npx wrangler secret put STAGING_ACCESS_PASSWORD --env staging), or, if staging is meant to be public, declare STAGING_ACCESS_OPEN in wrangler.jsonc env.staging vars.',
    );
  }
  if (kind === 'public' && status === 200) {
    return fail(
      '200 — staging is OPEN to anonymous requests',
      'Staging is open but the configuration does not say so: the 16.3 failure. If the owner has chosen public staging, declare STAGING_ACCESS_OPEN in wrangler.jsonc env.staging vars, never as a Worker secret. Otherwise close it.',
    );
  }
  return fail(
    status === 401 ? '401 from the application, without the password challenge' : `${status}, expected the password challenge (401)`,
    'In closed mode the gate must answer before the application does, on every path.',
  );
}

function unindexable(answer, seen) {
  return /\bnoindex\b/i.test(answer.robots)
    ? { ok: true, detail: `${seen} · noindex` }
    : fail(`${seen}, but no X-Robots-Tag: noindex`, 'Every non-production answer must carry X-Robots-Tag: noindex (withNoindex in lib/environment-gate.ts).');
}

function fail(detail, hint) {
  return { ok: false, detail, hint };
}

/** The sign-in path a redirect points at, if it is this origin's staff sign-in and nothing else. */
function signInTarget(answer) {
  if (!REDIRECTS.includes(answer.status) || !answer.location) return null;
  try {
    const target = new URL(answer.location, origin);
    return target.origin === origin && target.pathname === STAFF_SIGN_IN ? `${target.pathname}${target.search}` : null;
  } catch {
    return null;
  }
}

/**
 * One anonymous request. Network failures are retried. In open mode only, a 503
 * is also retried briefly: the version that lost the former access secret fails
 * closed while Cloudflare drains it, so different paths can reach old and new
 * isolates for a few seconds immediately after upload. Every other answer is
 * final, including any response that could expose a private route.
 */
async function ask(path) {
  let networkFailure;
  let networkAttempts = 0;
  let propagationAttempts = 0;
  while (true) {
    try {
      const response = await fetch(`${origin}${path}`, {
        redirect: 'manual',
        headers: { 'user-agent': 'nexphase-staging-access-check' },
        signal: AbortSignal.timeout(20_000),
      });
      await response.body?.cancel();
      const answer = {
        status: response.status,
        location: response.headers.get('location'),
        robots: response.headers.get('x-robots-tag') ?? '',
        basicChallenge: /^\s*basic\b/i.test(response.headers.get('www-authenticate') ?? ''),
      };
      if (mode === 'open' && answer.status === 503 && ++propagationAttempts < PROPAGATION_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, PROPAGATION_DELAY_MS));
        continue;
      }
      return answer;
    } catch (error) {
      networkFailure = error;
      if (++networkAttempts >= NETWORK_ATTEMPTS) break;
      await new Promise((resolve) => setTimeout(resolve, networkAttempts * 1000));
    }
  }
  return { unreachable: networkFailure?.cause?.code ?? networkFailure?.name ?? String(networkFailure) };
}

function parseOrigin(value) {
  try {
    const url = new URL(value ?? '');
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : null;
  } catch {
    return null;
  }
}
