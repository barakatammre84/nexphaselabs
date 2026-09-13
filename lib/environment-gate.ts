/**
 * Non-production access gate.
 *
 * Staging holds the real schema, a working checkout, and — until 12 September
 * 2026 — a publicly readable lot record with a fabricated manufacturer. It must
 * not be browsable by anyone who finds the URL, and it must never be indexed.
 *
 *  - A deployed non-production environment (APP_ENV=staging, or any named
 *    environment that is neither production nor a local one) requires HTTP Basic
 *    auth: any username, STAGING_ACCESS_PASSWORD as the password. Browsers
 *    remember it for the session, so the team types it once.
 *  - Without that secret the gate FAILS CLOSED with 503 and a message naming the
 *    missing variable. It used to fail open with a console warning; nobody reads
 *    an isolate's console, and the result was 16.3 — a public storefront serving
 *    fabricated manufacturer data. A missing secret is now a broken deploy, which
 *    is loud, rather than an open shop, which is silent.
 *  - STAGING_ACCESS_OPEN=true deliberately opens it again. It is a stated choice
 *    that sits in the configuration where it can be read, not a default.
 *  - Local development (APP_ENV development/test, or unset — the same default
 *    lib/site-config.ts uses) is never gated. It is not reachable from outside.
 *  - Provider webhooks and the health check are exempt: Shippo and BTCPay cannot
 *    authenticate with a browser password and are already token-gated, and the
 *    deploy smoke test has to reach health on a worker whose secret is missing.
 *
 * The noindex header applies to every non-production response either way.
 */

const EXEMPT_PREFIXES = [
  '/api/health',
  '/api/webhooks/',
  '/api/payments/btcpay/webhook',
];

/** Environments that only ever run on someone's machine. */
const LOCAL_ENVIRONMENTS = ['development', 'test', 'local'];

export type GateRequirement = 'open' | 'local' | 'password';

export function isNonProduction(appEnv: string | undefined): boolean {
  return normalize(appEnv) !== 'production';
}

/** What this environment demands of an anonymous request. */
export function gateRequirement(appEnv: string | undefined): GateRequirement {
  const value = normalize(appEnv);
  if (value === 'production') return 'open';
  if (LOCAL_ENVIRONMENTS.includes(value)) return 'local';
  return 'password';
}

export function gateNonProduction(
  request: Request,
  appEnv: string | undefined,
  password: string | undefined,
  deliberatelyOpen?: string | undefined,
): Response | null {
  if (gateRequirement(appEnv) !== 'password') return null;
  const path = new URL(request.url).pathname;
  if (EXEMPT_PREFIXES.some((p) => path.startsWith(p))) return null;
  if (deliberatelyOpen === 'true') return null;
  if (!password) {
    return refuse(
      503,
      'This environment is not configured for use. STAGING_ACCESS_PASSWORD is not set, so it stays closed.\n' +
        'Set it (wrangler secret put STAGING_ACCESS_PASSWORD --env staging) and redeploy.',
    );
  }
  const header = request.headers.get('authorization') ?? '';
  if (header.startsWith('Basic ')) {
    try {
      const decoded = atob(header.slice(6));
      const supplied = decoded.slice(decoded.indexOf(':') + 1);
      if (supplied.length === password.length && timingSafeEqual(supplied, password)) return null;
    } catch {
      /* fall through to challenge */
    }
  }
  return refuse(401, 'Staging is restricted to approved testers.', {
    'WWW-Authenticate': 'Basic realm="NexPhase staging", charset="UTF-8"',
  });
}

/** Never let a non-production origin compete with the real domain in search. */
export function withNoindex(response: Response, appEnv: string | undefined): Response {
  if (!isNonProduction(appEnv)) return response;
  if (response.headers.get('X-Robots-Tag')) return response;
  const out = new Response(response.body, response);
  out.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return out;
}

function refuse(status: number, body: string, headers: Record<string, string> = {}): Response {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Robots-Tag': 'noindex, nofollow',
      'Cache-Control': 'no-store',
      ...headers,
    },
  });
}

function normalize(appEnv: string | undefined): string {
  // lib/site-config.ts reads an unset APP_ENV as development; the gate must agree,
  // or a missing variable would mean "open" here and "local" there. Case is NOT
  // folded: "Production" is not production, and an environment this gate cannot
  // name falls through to requiring a password, which is the safe direction.
  return (appEnv ?? '').trim() || 'development';
}

function timingSafeEqual(a: string, b: string): boolean {
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
