import { getAccountFromRequest } from '@/lib/account-auth';
import { requestConsent, revokeConsent } from '@/lib/marketing-consent';
import { redirectWithNotice } from '@/lib/notice';
import { allow, clientAddress, rateLimitKey } from '@/lib/rate-limit';
import { sameOrigin } from '@/lib/staff-auth';

function safePath(value: FormDataEntryValue | null, fallback: string): string {
  const path = typeof value === 'string' ? value.trim() : '';
  return path.startsWith('/') && !path.startsWith('//') && !path.includes('\\') ? path : fallback;
}

/**
 * Product-news opt-in and opt-out from the site's own forms (footer, account details, sign-up
 * is handled in its route). Every subscribe answers the same way whatever the address's state,
 * and nothing is sent until the confirmation link is opened (lib/marketing-consent.ts).
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const form = await request.formData();
  const intent = form.get('intent') === 'unsubscribe' ? 'unsubscribe' : 'subscribe';
  const returnTo = safePath(form.get('return_to'), '/');
  const onDetails = returnTo.startsWith('/account/details');
  const account = await getAccountFromRequest(request);

  if (intent === 'unsubscribe') {
    if (!account) return Response.redirect(new URL('/account/sign-in?return_to=%2Faccount%2Fdetails', request.url), 303);
    await revokeConsent({ accountId: account.id, email: account.email }, 'account page');
    return Response.redirect(new URL('/account/details?saved=newsletter_off', request.url), 303);
  }

  const email = account && onDetails ? account.email : String(form.get('email') ?? '').trim().slice(0, 254);
  if (!email) return redirectWithNotice(request, returnTo, 'Enter an email address.');
  const [byIp, byEmail] = await Promise.all([
    allow(rateLimitKey('newsletter:ip', clientAddress(request)), 10, 3600),
    allow(rateLimitKey('newsletter:email', email.toLowerCase()), 3, 3600),
  ]);
  if (!byIp || !byEmail) return new Response('Please try again later.', { status: 429 });
  try {
    await requestConsent({
      email,
      accountId: account?.id ?? null,
      source: onDetails ? 'account' : 'footer',
      clientAddress: clientAddress(request),
      userAgent: request.headers.get('user-agent'),
    });
  } catch (error) {
    console.error('[newsletter] request failed', error instanceof Error ? error.message : error);
    return redirectWithNotice(request, returnTo, 'That could not be saved. Try again shortly.');
  }
  return Response.redirect(
    new URL(onDetails ? '/account/details?saved=newsletter_on' : '/newsletter/requested', request.url),
    303,
  );
}
