import { safeAccountReturnPath } from '@/lib/account-auth';
import {
  authorizationUrl,
  googleSignInEnabled,
  oauthCookie,
  randomUrlToken,
} from '@/lib/google-signin';
import { allow, clientAddress, rateLimitKey } from '@/lib/rate-limit';
import { urlIsSecure } from '@/lib/staff-auth';

/**
 * Sends the visitor to Google. The state and nonce are minted here and kept in an HttpOnly
 * cookie, so the callback can prove that the response belongs to a request this browser started
 * and to this attempt rather than a replayed earlier one.
 */
export async function GET(request: Request) {
  if (!googleSignInEnabled()) return Response.redirect(new URL('/account/sign-in?error=google', request.url), 303);
  if (!(await allow(rateLimitKey('google-start', clientAddress(request)), 20, 3600)))
    return new Response('Please try again later.', { status: 429 });

  const returnTo = safeAccountReturnPath(new URL(request.url).searchParams.get('return_to'));
  const state = randomUrlToken(16);
  const nonce = randomUrlToken(16);
  const destination = authorizationUrl(state, nonce);
  if (!destination) return Response.redirect(new URL('/account/sign-in?error=google', request.url), 303);

  const headers = new Headers({ Location: destination, 'Cache-Control': 'no-store' });
  headers.append('Set-Cookie', oauthCookie(state, nonce, returnTo, urlIsSecure(request)));
  return new Response(null, { status: 302, headers });
}
