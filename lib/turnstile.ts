import { env } from 'cloudflare:workers';

/**
 * Cloudflare Turnstile on the sign-up form (owner, 16 Sep 2026). Both keys come from the
 * Turnstile widget the owner creates in the Cloudflare dashboard: the site key is a public
 * var (TURNSTILE_SITE_KEY), the secret is a Worker secret (TURNSTILE_SECRET_KEY). With either
 * missing the check is off — the form renders no widget and the route verifies nothing — so
 * a half-configured deploy cannot lock sign-up. Once on, it fails closed: a token that is
 * missing, rejected, or unverifiable because Cloudflare did not answer refuses the sign-up.
 */
export const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export function turnstileSiteKey(): string | null {
  const key = (env.TURNSTILE_SITE_KEY ?? '').trim();
  return key ? key : null;
}

function turnstileSecret(): string | null {
  const secret = (env.TURNSTILE_SECRET_KEY ?? '').trim();
  return secret ? secret : null;
}

export function turnstileEnabled(): boolean {
  return Boolean(turnstileSiteKey() && turnstileSecret());
}

export type TurnstileVerdict = { ok: true } | { ok: false; reason: 'missing' | 'rejected' | 'unavailable' };

export async function verifyTurnstile(
  token: string | null,
  remoteIp: string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<TurnstileVerdict> {
  const secret = turnstileSecret();
  if (!turnstileSiteKey() || !secret) return { ok: true };
  if (!token || token.length > 2048) return { ok: false, reason: 'missing' };
  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp && remoteIp !== 'unknown') body.set('remoteip', remoteIp);
  try {
    const response = await fetchImpl(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return { ok: false, reason: 'unavailable' };
    const data = (await response.json()) as { success?: boolean };
    return data.success === true ? { ok: true } : { ok: false, reason: 'rejected' };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}
