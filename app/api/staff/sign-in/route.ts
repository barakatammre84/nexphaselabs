import { recordSignInFailure, signInThrottled } from '@/lib/sign-in-throttle';
import { safeReturnPath, sameOrigin, sessionCookie, signIn, urlIsSecure } from '@/lib/staff-auth';

/**
 * Staff sign-in. Plain HTML form POST from /staff/sign-in.
 *
 * Failure responses never say whether the email exists or whether the
 * account is active. A locked account is told it is locked, because that is
 * useful to the legitimate owner and reveals nothing an attacker could not
 * infer from ten failures. A network with repeated failures is throttled before any
 * password is checked (lib/sign-in-throttle.ts), which says nothing about any account.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return new Response('Forbidden', { status: 403 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return new Response('Bad request', { status: 400 });
  }
  const email = String(form.get('email') ?? '');
  const password = String(form.get('password') ?? '');
  const returnTo = safeReturnPath(String(form.get('return_to') ?? ''));

  const back = (reason: string) =>
    Response.redirect(
      new URL(`/staff/sign-in?error=${reason}&return_to=${encodeURIComponent(returnTo)}`, request.url),
      303,
    );

  if (!email || !password) return back('missing');

  let result: Awaited<ReturnType<typeof signIn>>;
  try {
    if (await signInThrottled('staff', request)) return back('throttled');
    result = await signIn(email, password, request.headers.get('user-agent'));
    if (!result.ok && (result.reason === 'invalid' || result.reason === 'locked')) await recordSignInFailure('staff', request);
  } catch (error) {
    console.error('[staff] sign-in failed', error instanceof Error ? error.message : error);
    return back('unavailable');
  }

  if (!result.ok) return back(result.reason);

  const headers = new Headers({ Location: new URL(returnTo, request.url).toString() });
  headers.append('Set-Cookie', sessionCookie(result.token, result.expiresAt, urlIsSecure(request)));
  headers.set('Cache-Control', 'no-store');
  return new Response(null, { status: 303, headers });
}
