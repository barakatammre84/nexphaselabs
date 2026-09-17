import { env } from 'cloudflare:workers';
import { publicOrigin } from '@/lib/site-config';

/**
 * "Continue with Google" for customer accounts (owner, 16 Sep 2026).
 *
 * This is a separate OAuth client from the one that sends mail. That client is a Workspace
 * mailbox credential holding gmail.send for research@; this one is an external-consent client
 * whose only scopes are openid, email and profile. Reusing the mail client would put a customer
 * consent screen on an internal credential and would need its redirect URIs, so it is not done.
 *
 * Signing in with Google proves an email address. It does not prove age and it cannot record an
 * acknowledgement, so a new account still passes through the completion step that collects the
 * date of birth and the three confirmations. The reference site asks a visitor to "confirm the
 * research-use access requirements" by clicking a Google button; that is not a record of anything.
 */
export const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
export const GOOGLE_SCOPES = 'openid email profile';
/** How long a half-finished Google sign-up may sit before the visitor starts again. */
export const PENDING_TTL_SECONDS = 1800;

export function googleClientId(): string | null {
  const value = (env.GOOGLE_SIGN_IN_CLIENT_ID ?? '').trim();
  return value ? value : null;
}

function googleClientSecret(): string | null {
  const value = (env.GOOGLE_SIGN_IN_CLIENT_SECRET ?? '').trim();
  return value ? value : null;
}

/** Off until both halves are configured, so a partial deploy never shows a button that cannot work. */
export function googleSignInEnabled(): boolean {
  return Boolean(googleClientId() && googleClientSecret());
}

/** Must match a redirect URI registered on the OAuth client, byte for byte. */
export function googleRedirectUri(): string {
  return `${publicOrigin()}/api/auth/google/callback`;
}

export function randomUrlToken(bytes = 32): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return [...buffer].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function authorizationUrl(state: string, nonce: string): string | null {
  const clientId = googleClientId();
  if (!clientId) return null;
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', googleRedirectUri());
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', GOOGLE_SCOPES);
  url.searchParams.set('state', state);
  url.searchParams.set('nonce', nonce);
  // A returning visitor should not have to re-pick an account every time, but they must be able to.
  url.searchParams.set('prompt', 'select_account');
  return url.toString();
}

export type GoogleIdentity = {
  subject: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
};

export type ExchangeResult = { ok: true; identity: GoogleIdentity } | { ok: false; error: string };

function decodeSegment(segment: string): Record<string, unknown> | null {
  try {
    const padded = segment.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
    const parsed = JSON.parse(json) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Reads the identity out of an ID token and checks the claims that matter.
 *
 * The signature is not re-verified here, and that is deliberate rather than an omission: this
 * token was not supplied by the browser. It came back on our own TLS connection to Google's token
 * endpoint, authenticated with our client secret, which is the case Google's own guidance says may
 * skip signature verification. Issuer, audience, expiry and nonce are still checked, because those
 * catch a token that is genuine but not ours or not this attempt.
 */
export function identityFromIdToken(idToken: string, expectedNonce: string, now = new Date()): ExchangeResult {
  const parts = idToken.split('.');
  if (parts.length !== 3) return { ok: false, error: 'malformed id token' };
  const claims = decodeSegment(parts[1]);
  if (!claims) return { ok: false, error: 'unreadable id token' };

  const issuer = String(claims.iss ?? '');
  if (!GOOGLE_ISSUERS.includes(issuer)) return { ok: false, error: 'unexpected issuer' };
  const audience = Array.isArray(claims.aud) ? claims.aud.map(String) : [String(claims.aud ?? '')];
  if (!audience.includes(googleClientId() ?? '')) return { ok: false, error: 'token issued for another client' };
  const expiry = Number(claims.exp ?? 0);
  if (!Number.isFinite(expiry) || expiry * 1000 <= now.getTime()) return { ok: false, error: 'expired id token' };
  if (!expectedNonce || String(claims.nonce ?? '') !== expectedNonce) return { ok: false, error: 'nonce mismatch' };

  const subject = String(claims.sub ?? '');
  const email = String(claims.email ?? '').trim().toLowerCase();
  if (!subject || !email) return { ok: false, error: 'incomplete id token' };
  const name = typeof claims.name === 'string' && claims.name.trim() ? claims.name.trim().slice(0, 120) : null;
  return { ok: true, identity: { subject, email, emailVerified: claims.email_verified === true, name } };
}

export async function exchangeCode(
  code: string,
  expectedNonce: string,
  fetchImpl: typeof fetch = fetch,
  now = new Date(),
): Promise<ExchangeResult> {
  const clientId = googleClientId();
  const clientSecret = googleClientSecret();
  if (!clientId || !clientSecret) return { ok: false, error: 'google sign-in is not configured' };
  let response: Response;
  try {
    response = await fetchImpl(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: googleRedirectUri(),
        grant_type: 'authorization_code',
      }),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return { ok: false, error: 'could not reach Google' };
  }
  if (!response.ok) return { ok: false, error: `Google answered ${response.status}` };
  let body: { id_token?: unknown };
  try {
    body = (await response.json()) as { id_token?: unknown };
  } catch {
    return { ok: false, error: 'unreadable token response' };
  }
  if (typeof body.id_token !== 'string') return { ok: false, error: 'no id token returned' };
  return identityFromIdToken(body.id_token, expectedNonce, now);
}

/* ------------------------------------------------------------------------ */
/* The half-finished sign-up carried between the callback and the form        */
/* ------------------------------------------------------------------------ */

export type PendingIdentity = GoogleIdentity & { issuedAt: number };

/**
 * A Google identity waiting for the visitor to give a date of birth and the acknowledgements.
 *
 * It is signed, and it has to be: the account it will create is marked email-verified on Google's
 * word rather than on a link we posted, so a forgeable cookie here would let somebody open a
 * verified account on an address they do not own. The key is the client secret, which is already
 * required for this flow and is used for nothing else in it.
 */
async function pendingKey(): Promise<CryptoKey | null> {
  const secret = googleClientSecret();
  if (!secret) return null;
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const fromB64url = (value: string) => {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
};

export async function sealPendingIdentity(identity: GoogleIdentity, now = new Date()): Promise<string | null> {
  const key = await pendingKey();
  if (!key) return null;
  const payload: PendingIdentity = { ...identity, issuedAt: Math.floor(now.getTime() / 1000) };
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)));
  return `${body}.${b64url(signature)}`;
}

export async function openPendingIdentity(sealed: string | null, now = new Date()): Promise<PendingIdentity | null> {
  const key = await pendingKey();
  if (!key || !sealed) return null;
  const [body, signature] = sealed.split('.');
  if (!body || !signature) return null;
  let valid = false;
  try {
    valid = await crypto.subtle.verify('HMAC', key, fromB64url(signature), new TextEncoder().encode(body));
  } catch {
    return null;
  }
  if (!valid) return null;
  let payload: PendingIdentity;
  try {
    payload = JSON.parse(new TextDecoder().decode(fromB64url(body))) as PendingIdentity;
  } catch {
    return null;
  }
  if (!payload?.subject || !payload.email) return null;
  if (payload.issuedAt * 1000 + PENDING_TTL_SECONDS * 1000 <= now.getTime()) return null;
  return payload;
}

/* ------------------------------------------------------------------------ */
/* Cookies                                                                    */
/* ------------------------------------------------------------------------ */

export const OAUTH_COOKIE = 'nx_oauth';
export const PENDING_COOKIE = 'nx_google';

function cookie(name: string, value: string, seconds: number, secure: boolean): string {
  const parts = [`${name}=${value}`, 'Path=/', `Max-Age=${seconds}`, 'HttpOnly', 'SameSite=Lax'];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

/** state, nonce and where to land afterwards, kept together so the callback can check all three. */
export function oauthCookie(state: string, nonce: string, returnTo: string, secure: boolean): string {
  return cookie(OAUTH_COOKIE, `${state}.${nonce}.${encodeURIComponent(returnTo)}`, 600, secure);
}

export function readOauthCookie(header: string | null): { state: string; nonce: string; returnTo: string } | null {
  const raw = readCookie(header, OAUTH_COOKIE);
  if (!raw) return null;
  const [state, nonce, returnTo] = raw.split('.');
  if (!state || !nonce) return null;
  try {
    return { state, nonce, returnTo: decodeURIComponent(returnTo ?? '') || '/account' };
  } catch {
    return { state, nonce, returnTo: '/account' };
  }
}

export function pendingCookie(sealed: string, secure: boolean): string {
  return cookie(PENDING_COOKIE, sealed, PENDING_TTL_SECONDS, secure);
}

export function clearedCookie(name: string, secure: boolean): string {
  return `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
}

export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=') || null;
  }
  return null;
}
