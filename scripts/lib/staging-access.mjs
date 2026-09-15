/**
 * The staging access boundary, as one set of rules for both scripts that prove
 * it: the staging deploy's last step (scripts/staging-access-check.mjs) and
 * cutover day (scripts/cutover-verify.ts). Neither keeps its own list of paths,
 * so the two cannot come to disagree about what a stranger may read.
 *
 * The mode is read from a BUILT configuration and never inferred from what the
 * server answers. Inferring it would wave through a storefront that is open by
 * accident, which is what 16.3 was on 12 September 2026.
 *
 *   open    vars.STAGING_ACCESS_OPEN is exactly "true": the owner chose public
 *           staging on 14 September 2026. Public pages must answer 200. Staff
 *           pages must still send a stranger to staff sign-in, and private APIs
 *           must still refuse one — opening the storefront opens neither the
 *           staff area nor anyone's records.
 *   closed  anything else. The Basic-auth gate (lib/environment-gate.ts) must
 *           challenge every path with 401 before the application sees it.
 *
 * In both modes every answer must carry X-Robots-Tag: noindex. Every path is
 * asked anonymously, and redirects are read, never followed, so a sign-in page
 * answering 200 cannot stand in for the staff page that redirected to it.
 */
import { readFileSync } from 'node:fs';

// Anyone may read these. The favicon is a static file that reaches visitors
// through the worker (assets.run_worker_first), so it must be unindexable too.
export const PUBLIC_PATHS = ['/', '/catalog', '/favicon.svg'];
// Staff pages: the application redirects an anonymous request to staff sign-in.
export const STAFF_PAGES = ['/manage', '/manage/orders', '/manage/controls'];
// Private APIs: two staff reports (customer names, addresses, lot costs) and a
// customer's own invoice. Each must refuse a request that carries no login.
export const PRIVATE_APIS = [
  '/api/manage/reports/orders.csv',
  '/api/manage/reports/lots.csv',
  '/api/orders/NX-00000/invoice',
];
export const STAFF_SIGN_IN = '/staff/sign-in';
const REDIRECTS = [301, 302, 303, 307, 308];
const NETWORK_ATTEMPTS = 3;
const PROPAGATION_ATTEMPTS = 6;
const PROPAGATION_DELAY_MS = 2_000;

const PROBES = [
  ...PUBLIC_PATHS.map((path) => ({ kind: 'public', path })),
  ...STAFF_PAGES.map((path) => ({ kind: 'staff', path })),
  ...PRIVATE_APIS.map((path) => ({ kind: 'private', path })),
];

/**
 * @typedef {{ kind: 'public' | 'staff' | 'private', path: string, ok: boolean, detail: string, hint?: string }} Verdict
 */

/**
 * The access mode a built configuration declares, by the gate's own rule:
 * exactly "true" opens staging, and nothing looser does. Throws a sentence
 * saying what to do when there is no such file, or it is not a build for
 * `environment`.
 *
 * @param {string} configPath
 * @param {string} [environment]
 * @returns {{ mode: 'open' | 'closed', declared: string | undefined }}
 */
export function readAccessMode(configPath, environment = 'staging') {
  let built;
  try {
    built = JSON.parse(readFileSync(configPath, 'utf8'));
  } catch {
    throw new Error(`no built configuration at ${configPath} — run the ${environment} build first.`);
  }
  if (built?.vars?.APP_ENV !== environment) {
    throw new Error(`${configPath} is not a ${environment} build (APP_ENV is ${JSON.stringify(built?.vars?.APP_ENV)}).`);
  }
  const declared = built.vars.STAGING_ACCESS_OPEN;
  return { mode: declared === 'true' ? 'open' : 'closed', declared };
}

/**
 * Ask every boundary path anonymously, in order — a stranger's pages, then the
 * staff area, then the private records — and yield each verdict as soon as it is
 * known. A path that cannot be reached ends the run: nothing after it was checked.
 *
 * @param {string} origin scheme://host[:port], with no path
 * @param {'open' | 'closed'} mode
 * @returns {AsyncGenerator<Verdict>}
 */
export async function* proveAccessBoundary(origin, mode) {
  for (const probe of PROBES) {
    const answer = await ask(origin, probe.path, mode);
    if (answer.unreachable) {
      yield {
        ...probe,
        ...fail(`could not be reached (${answer.unreachable})`, `${origin} did not answer, so nothing after ${probe.path} was checked.`),
      };
      return;
    }
    yield { ...probe, ...(mode === 'open' ? openBoundary(probe, answer, origin) : closedBoundary(probe, answer)) };
  }
}

/** Open mode: the storefront is public; the staff area and private records are not. */
function openBoundary({ kind }, answer, origin) {
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
  const target = kind === 'staff' ? signInTarget(answer, origin) : null;
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
function signInTarget(answer, origin) {
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
async function ask(origin, path, mode) {
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
