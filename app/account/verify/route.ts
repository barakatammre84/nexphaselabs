import { verifyEmailToken } from '@/lib/account-auth';

/** Email verification link target. Consumes the token and sends the person to sign in. */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token') ?? '';
  let outcome: Awaited<ReturnType<typeof verifyEmailToken>>;
  try {
    outcome = await verifyEmailToken(token);
  } catch (error) {
    console.error('[account] verify failed', error instanceof Error ? error.message : error);
    return Response.redirect(new URL('/account/sign-in?verify=unavailable', request.url), 303);
  }
  return Response.redirect(new URL(`/account/sign-in?verify=${outcome}`, request.url), 303);
}
