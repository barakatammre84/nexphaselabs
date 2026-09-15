import { resendVerification } from '@/lib/account-auth';
import { allow, clientAddress, rateLimitKey } from '@/lib/rate-limit';
import { sameOrigin } from '@/lib/staff-auth';

/**
 * Ask for a new email-confirmation link, the way out of an expired one. Answers the
 * same way whether or not the address has an account waiting to be confirmed, and
 * past its limits it answers the same way and sends nothing.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 });
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return new Response('Bad request', { status: 400 });
  }
  const email = String(form.get('email') ?? '').trim().toLowerCase();
  if (!email || email.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return Response.redirect(new URL('/account/sign-in?verify=resend_missing', request.url), 303);
  }
  try {
    const [byAddress, byIp] = await Promise.all([
      allow(rateLimitKey('verify-resend:email', email), 3, 3600),
      allow(rateLimitKey('verify-resend:ip', clientAddress(request)), 10, 3600),
    ]);
    if (byAddress && byIp) await resendVerification(email);
    else console.warn('[account] confirmation resend rate-limited');
  } catch (error) {
    console.error('[account] confirmation resend failed', error instanceof Error ? error.message : error);
    return Response.redirect(new URL('/account/sign-in?verify=unavailable', request.url), 303);
  }
  const done = new URL('/account/check-email', request.url);
  done.searchParams.set('email', email);
  done.searchParams.set('resent', '1');
  return Response.redirect(done, 303);
}
