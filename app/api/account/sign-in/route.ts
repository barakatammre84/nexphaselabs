import { accountCookie, accountSignIn, safeAccountReturnPath } from '@/lib/account-auth';
import { validateSignIn } from '@/lib/account-rules';
import { recordSignInFailure, signInThrottled } from '@/lib/sign-in-throttle';
import { sameOrigin, urlIsSecure } from '@/lib/staff-auth';

export async function POST(request: Request) {
  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return new Response('Bad request', { status: 400 });
  }
  const returnTo = safeAccountReturnPath(String(form.get('return_to') ?? ''));
  const back = (reason: string) =>
    Response.redirect(new URL(`/account/sign-in?error=${reason}&return_to=${encodeURIComponent(returnTo)}`, request.url), 303);

  const credentials = validateSignIn({ email: String(form.get('email') ?? ''), password: String(form.get('password') ?? '') });
  if (!credentials) return back('missing');

  let result: Awaited<ReturnType<typeof accountSignIn>>;
  try {
    if (await signInThrottled('account', request)) return back('throttled');
    result = await accountSignIn(credentials.email, credentials.password, request.headers.get('user-agent'));
    if (!result.ok && (result.reason === 'invalid' || result.reason === 'locked')) await recordSignInFailure('account', request);
  } catch (error) {
    console.error('[account] sign-in failed', error instanceof Error ? error.message : error);
    return back('unavailable');
  }
  if (!result.ok) return back(result.reason);

  const headers = new Headers({ Location: new URL(returnTo, request.url).toString() });
  headers.append('Set-Cookie', accountCookie(result.token, result.expiresAt, urlIsSecure(request)));
  headers.set('Cache-Control', 'no-store');
  return new Response(null, { status: 303, headers });
}
