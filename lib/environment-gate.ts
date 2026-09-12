/**
 * Non-production access gate.
 *
 * Staging holds the real schema, a working checkout, and — until 12 September
 * 2026 — a publicly readable lot record with a fabricated manufacturer. It must
 * not be browsable by anyone who finds the URL, and it must never be indexed.
 *
 *  - With STAGING_ACCESS_PASSWORD set, every request outside the allowlist below
 *    needs HTTP Basic auth (any username, that password). Browsers remember it
 *    for the session, so the team types it once.
 *  - Without the secret, the gate FAILS OPEN and logs once per isolate, so a
 *    missing secret is loud rather than silently locking the team out. Setting
 *    it is on the launch checklist; the noindex header applies either way.
 *  - Provider webhooks and the health check are exempt: Shippo and BTCPay
 *    cannot authenticate with a browser password and are already token-gated.
 */

const EXEMPT_PREFIXES = [
  '/api/health',
  '/api/webhooks/',
  '/api/payments/btcpay/webhook',
];

let warned = false;

export function isNonProduction(appEnv: string | undefined): boolean {
  return appEnv !== 'production';
}

export function gateNonProduction(
  request: Request,
  appEnv: string | undefined,
  password: string | undefined,
): Response | null {
  if (!isNonProduction(appEnv)) return null;
  const path = new URL(request.url).pathname;
  if (EXEMPT_PREFIXES.some((p) => path.startsWith(p))) return null;
  if (!password) {
    if (!warned) {
      console.warn('[environment-gate] STAGING_ACCESS_PASSWORD is not set; the non-production storefront is OPEN.');
      warned = true;
    }
    return null;
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
  return new Response('Staging is restricted to approved testers.', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="NexPhase staging", charset="UTF-8"',
      'X-Robots-Tag': 'noindex, nofollow',
      'Cache-Control': 'no-store',
    },
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

function timingSafeEqual(a: string, b: string): boolean {
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
