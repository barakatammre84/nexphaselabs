import { requestPasswordReset } from '@/lib/account-service';
import { allow, clientAddress, rateLimitKey } from '@/lib/rate-limit';
import { sameOrigin } from '@/lib/staff-auth';

/** Customer asks for a password reset link. The response never reveals whether the address exists. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 });
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return new Response('Bad request', { status: 400 });
  }
  const email = String(form.get('email') ?? '').trim();
  // Syntax only; whether the address exists is never revealed. Garbage never reaches the mail provider.
  if (!email || email.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return Response.redirect(new URL('/account/forgot?error=missing', request.url), 303);
  }
  try {
    // Limits are checked after the generic response is decided, so they reveal nothing; when
    // exceeded the endpoint answers exactly as usual and simply sends nothing. In local dev every
    // caller shares the 'unknown' IP bucket.
    const [byAddress, byIp] = await Promise.all([
      allow(rateLimitKey('forgot:email', email), 3, 3600),
      allow(rateLimitKey('forgot:ip', clientAddress(request)), 10, 3600),
    ]);
    if (byAddress && byIp) await requestPasswordReset(email);
    else console.warn('[account] reset request rate-limited');
  } catch (error) {
    console.error('[account] reset request failed', error instanceof Error ? error.message : error);
    return Response.redirect(new URL('/account/forgot?error=unavailable', request.url), 303);
  }
  return Response.redirect(new URL('/account/forgot?sent=1', request.url), 303);
}
