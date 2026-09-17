import { getAccountFromRequest } from '@/lib/account-auth';
import { wantsJson } from '@/lib/cart-summary';
import { redirectWithNotice } from '@/lib/notice';
import { allow, rateLimitKey } from '@/lib/rate-limit';
import { sameOrigin } from '@/lib/staff-auth';
import { joinWaitlist, leaveWaitlist, WAITLIST_COPY } from '@/lib/waitlist';

const NO_STORE = { 'Cache-Control': 'no-store' };

/** Only a same-site path may be returned to; anything else lands on the fallback. */
function safePath(value: FormDataEntryValue | null, fallback: string): string {
  const path = typeof value === 'string' ? value.trim() : '';
  return path.startsWith('/') && !path.startsWith('//') && !path.includes('\\') ? path : fallback;
}

function withFlag(path: string, key: string, value: string): string {
  const [base, hash] = path.split('#');
  const joiner = base.includes('?') ? '&' : '?';
  return `${base}${joiner}${key}=${encodeURIComponent(value)}${hash ? `#${hash}` : ''}`;
}

/**
 * Join or leave the back-in-stock list. Accounts only — there is no guest to email —
 * and the answer is JSON for the product panel's fetch or a 303 for the plain form.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const json = wantsJson(request);
  const form = await request.formData();
  const intent = form.get('intent') === 'leave' ? 'leave' : 'join';
  const returnTo = safePath(form.get('return_to'), intent === 'leave' ? '/account/waitlist' : '/catalog');

  const account = await getAccountFromRequest(request);
  if (!account) {
    const signIn = `/account/sign-in?return_to=${encodeURIComponent(returnTo)}`;
    return json
      ? Response.json({ ok: false, error: WAITLIST_COPY.signIn, signIn }, { status: 401, headers: NO_STORE })
      : Response.redirect(new URL(signIn, request.url), 303);
  }
  if (!(await allow(rateLimitKey('waitlist', account.id), 20, 3600)))
    return json
      ? Response.json({ ok: false, error: 'Please try again later.' }, { status: 429, headers: NO_STORE })
      : new Response('Please try again later.', { status: 429 });

  try {
    if (intent === 'leave') {
      const removed = await leaveWaitlist(account.id, String(form.get('id') ?? ''));
      return json
        ? Response.json({ ok: removed }, { status: removed ? 200 : 404, headers: NO_STORE })
        : Response.redirect(new URL(withFlag(returnTo, 'removed', removed ? '1' : '0'), request.url), 303);
    }
    const result = await joinWaitlist(account.id, String(form.get('sku') ?? ''));
    if (!result.ok)
      return json
        ? Response.json({ ok: false, error: result.error }, { status: 400, headers: NO_STORE })
        : redirectWithNotice(request, withFlag(returnTo, 'waitlist', 'error'), result.error);
    return json
      ? Response.json({ ok: true, already: result.already, sku: result.sku }, { headers: NO_STORE })
      : Response.redirect(new URL(withFlag(returnTo, 'waitlist', 'joined'), request.url), 303);
  } catch (error) {
    console.error('[waitlist] request failed', error instanceof Error ? error.message : error);
    return json
      ? Response.json({ ok: false, error: WAITLIST_COPY.unavailable }, { status: 503, headers: NO_STORE })
      : redirectWithNotice(request, withFlag(returnTo, 'waitlist', 'error'), WAITLIST_COPY.unavailable);
  }
}
