import { accountCookie } from '@/lib/account-auth';
import { resolveGoogleSignIn } from '@/lib/google-accounts';
import {
  OAUTH_COOKIE,
  PENDING_COOKIE,
  clearedCookie,
  exchangeCode,
  googleSignInEnabled,
  pendingCookie,
  readOauthCookie,
  sealPendingIdentity,
} from '@/lib/google-signin';
import { allow, clientAddress, rateLimitKey } from '@/lib/rate-limit';
import { urlIsSecure } from '@/lib/staff-auth';

/**
 * Where Google sends the visitor back. Everything that can be checked is checked before any
 * account is touched: the state against the cookie this browser was given, then the issuer,
 * audience, expiry and nonce inside the token (lib/google-signin.ts).
 *
 * A visitor Google has not sent us before is not given an account here. They are handed a sealed
 * identity and sent to the completion form, because an account cannot be created without a date
 * of birth and the acknowledgements.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const secure = urlIsSecure(request);
  const drop = (name: string) => clearedCookie(name, secure);
  const fail = (reason: string) => {
    const headers = new Headers({
      Location: new URL(`/account/sign-in?error=${reason}`, request.url).toString(),
      'Cache-Control': 'no-store',
    });
    headers.append('Set-Cookie', drop(OAUTH_COOKIE));
    return new Response(null, { status: 303, headers });
  };

  if (!googleSignInEnabled()) return fail('google');
  if (!(await allow(rateLimitKey('google-callback', clientAddress(request)), 20, 3600)))
    return new Response('Please try again later.', { status: 429 });

  // A visitor who declines consent comes back with an error and no code; that is not a failure.
  if (url.searchParams.get('error')) return fail('google_cancelled');

  const expected = readOauthCookie(request.headers.get('cookie'));
  const state = url.searchParams.get('state') ?? '';
  const code = url.searchParams.get('code') ?? '';
  if (!expected || !state || state !== expected.state || !code) return fail('google_state');

  let result: Awaited<ReturnType<typeof exchangeCode>>;
  try {
    result = await exchangeCode(code, expected.nonce);
  } catch (error) {
    console.error('[google] token exchange failed', error instanceof Error ? error.message : error);
    return fail('google');
  }
  if (!result.ok) {
    console.warn('[google] sign-in refused:', result.error);
    return fail('google');
  }

  let resolution: Awaited<ReturnType<typeof resolveGoogleSignIn>>;
  try {
    resolution = await resolveGoogleSignIn(result.identity, request.headers.get('user-agent'));
  } catch (error) {
    console.error('[google] sign-in failed', error instanceof Error ? error.message : error);
    return fail('unavailable');
  }

  if (resolution.outcome === 'refused') {
    const reasons = {
      suspended: 'suspended',
      'unverified-email': 'google_unverified',
      'linked-elsewhere': 'google_linked_elsewhere',
      unavailable: 'unavailable',
    } as const;
    return fail(reasons[resolution.reason]);
  }

  if (resolution.outcome === 'needs-completion') {
    const sealed = await sealPendingIdentity(result.identity);
    if (!sealed) return fail('google');
    const headers = new Headers({
      Location: new URL(`/account/complete?return_to=${encodeURIComponent(expected.returnTo)}`, request.url).toString(),
      'Cache-Control': 'no-store',
    });
    headers.append('Set-Cookie', drop(OAUTH_COOKIE));
    headers.append('Set-Cookie', pendingCookie(sealed, secure));
    return new Response(null, { status: 303, headers });
  }

  const headers = new Headers({
    Location: new URL(expected.returnTo, request.url).toString(),
    'Cache-Control': 'no-store',
  });
  headers.append('Set-Cookie', drop(OAUTH_COOKIE));
  headers.append('Set-Cookie', drop(PENDING_COOKIE));
  headers.append('Set-Cookie', accountCookie(resolution.token, resolution.expiresAt, secure));
  return new Response(null, { status: 303, headers });
}
