import { accountCookie, safeAccountReturnPath } from '@/lib/account-auth';
import { bindReferral } from '@/lib/affiliates';
import { completeGoogleSignUp } from '@/lib/google-accounts';
import { PENDING_COOKIE, clearedCookie, openPendingIdentity } from '@/lib/google-signin';
import { confirmConsentForAccount, requestConsent } from '@/lib/marketing-consent';
import { allow, clientAddress, rateLimitKey } from '@/lib/rate-limit';
import { readReferralCookie } from '@/lib/referral-cookie';
import { researcherTierEnabled } from '@/lib/site-config';
import { sameOrigin, urlIsSecure } from '@/lib/staff-auth';

/**
 * Creates the account a Google sign-in was heading towards. The identity comes from the sealed
 * cookie rather than the form, so none of it is the submitter's to choose; the form supplies only
 * the things Google could not (lib/google-accounts.ts).
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const secure = urlIsSecure(request);
  const pending = await openPendingIdentity(readPending(request));
  if (!pending) return Response.redirect(new URL('/account/sign-in?error=google_expired', request.url), 303);
  if (!(await allow(rateLimitKey('google-complete', clientAddress(request)), 10, 3600)))
    return new Response('Please try again later.', { status: 429 });

  const form = await request.formData();
  const field = (name: string) => String(form.get(name) ?? '');
  const returnTo = safeAccountReturnPath(field('return_to'));

  let result: Awaited<ReturnType<typeof completeGoogleSignUp>>;
  try {
    result = await completeGoogleSignUp(
      pending,
      {
        tier: field('tier') || 'institutional',
        researchSetting: field('research_setting'),
        dateOfBirth: field('date_of_birth'),
        acceptTerms: form.get('accept_terms') === 'on',
        acceptRuo: form.get('accept_ruo') === 'on',
        acceptAge: form.get('accept_age') === 'on',
      },
      request.headers.get('user-agent'),
      researcherTierEnabled(),
    );
  } catch (error) {
    console.error('[google] completion failed', error instanceof Error ? error.message : error);
    return back(request, ['Your account could not be created just now. Try again shortly.'], returnTo);
  }
  if (!result.ok) return back(request, result.errors, returnTo);

  // The same two side effects the password sign-up has, so a Google account is not a second-class one.
  const referral = readReferralCookie(request.headers.get('cookie'));
  if (referral)
    try {
      await bindReferral(referral, result.accountId, {
        clientAddress: clientAddress(request),
        userAgent: request.headers.get('user-agent'),
      });
    } catch (error) {
      console.error('[account] referral not bound', error instanceof Error ? error.message : error);
    }
  if (form.get('product_news') === 'on')
    try {
      // The address is already verified by Google, so this consent is confirmed rather than pending.
      await requestConsent({
        email: pending.email,
        accountId: result.accountId,
        source: 'sign_up',
        clientAddress: clientAddress(request),
        userAgent: request.headers.get('user-agent'),
        sendConfirmation: false,
      });
      await confirmConsentForAccount(result.accountId);
    } catch (error) {
      console.error('[account] product-news opt-in failed', error instanceof Error ? error.message : error);
    }

  const headers = new Headers({ Location: new URL(returnTo, request.url).toString(), 'Cache-Control': 'no-store' });
  headers.append('Set-Cookie', clearedCookie(PENDING_COOKIE, secure));
  headers.append('Set-Cookie', accountCookie(result.token, result.expiresAt, secure));
  return new Response(null, { status: 303, headers });
}

function readPending(request: Request): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === PENDING_COOKIE) return rest.join('=') || null;
  }
  return null;
}

function back(request: Request, errors: string[], returnTo: string): Response {
  const url = new URL('/account/complete', request.url);
  url.searchParams.set('error', 'validation');
  url.searchParams.set('codes', errors.join('|'));
  url.searchParams.set('return_to', returnTo);
  return Response.redirect(url, 303);
}
