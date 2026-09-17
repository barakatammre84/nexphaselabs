import { getAccountFromRequest } from '@/lib/account-auth';
import { AFFILIATE_COPY } from '@/lib/affiliate-rules';
import { applyForAffiliate } from '@/lib/affiliates';
import { redirectWithNotice } from '@/lib/notice';
import { allow, rateLimitKey } from '@/lib/rate-limit';
import { affiliateProgramEnabled } from '@/lib/site-config';
import { sameOrigin } from '@/lib/staff-auth';

/** A customer applies to the partner programme. Approval is a person's decision, never this route's. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const account = await getAccountFromRequest(request);
  if (!account)
    return Response.redirect(new URL('/account/sign-in?return_to=%2Faccount%2Faffiliate', request.url), 303);
  if (!affiliateProgramEnabled())
    return redirectWithNotice(request, '/account/affiliate?error=1', AFFILIATE_COPY.closed);
  if (!(await allow(rateLimitKey('affiliate-apply', account.id), 5, 3600)))
    return new Response('Please try again later.', { status: 429 });

  const form = await request.formData();
  const value = (name: string, max = 1000) => String(form.get(name) ?? '').slice(0, max);
  try {
    const result = await applyForAffiliate(account, {
      audience: value('audience'),
      channels: value('channels'),
      payoutEmail: value('payout_email', 254),
      acceptAgreement: form.get('accept_agreement') === 'on',
    });
    if (!result.ok) return redirectWithNotice(request, '/account/affiliate?error=1', result.errors.join(' '));
    return Response.redirect(new URL('/account/affiliate?applied=1', request.url), 303);
  } catch (error) {
    console.error('[affiliate] application failed', error instanceof Error ? error.message : error);
    return redirectWithNotice(request, '/account/affiliate?error=1', AFFILIATE_COPY.unavailable);
  }
}
