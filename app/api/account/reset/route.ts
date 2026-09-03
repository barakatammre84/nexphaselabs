import { resetPasswordWithToken } from '@/lib/account-service';
import { sameOrigin } from '@/lib/staff-auth';

/** Customer sets a new password from a reset link. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 });
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return new Response('Bad request', { status: 400 });
  }
  const token = String(form.get('token') ?? '');
  const next = String(form.get('next') ?? '');
  const confirm = String(form.get('confirm') ?? '');
  if (!/^[a-f0-9]{64}$/.test(token)) return Response.redirect(new URL('/account/reset?error=invalid', request.url), 303);
  const back = (reason: string) => Response.redirect(new URL(`/account/reset?token=${token}&error=${reason}`, request.url), 303);
  if (!next || !confirm) return back('missing');
  let outcome: Awaited<ReturnType<typeof resetPasswordWithToken>>;
  try {
    outcome = await resetPasswordWithToken(token, next, confirm);
  } catch (error) {
    console.error('[account] reset failed', error instanceof Error ? error.message : error);
    return back('unavailable');
  }
  if (!outcome.ok) return outcome.reason === 'invalid' || outcome.reason === 'expired' ? Response.redirect(new URL(`/account/reset?error=${outcome.reason}`, request.url), 303) : back(outcome.reason);
  return Response.redirect(new URL('/account/sign-in?reset=done', request.url), 303);
}
