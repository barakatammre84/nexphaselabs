import {
  cancelPayout,
  createPayout,
  decideAffiliate,
  markPayoutSent,
  recordTaxForm,
  saveAffiliateSettings,
  setCommissionRate,
} from '@/lib/affiliates';
import { redirectWithNotice } from '@/lib/notice';
import { canManageStaff, getStaffFromRequest, sameOrigin } from '@/lib/staff-auth';

/**
 * The partner desk's write side. Administrators only: every intent here either lets a third party
 * speak about the material in exchange for money, or moves money to them.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const staff = await getStaffFromRequest(request);
  if (!staff) return new Response('Unauthorized', { status: 401 });
  if (!canManageStaff(staff)) return new Response('Forbidden', { status: 403 });

  const form = await request.formData();
  const value = (name: string, max = 120) => String(form.get(name) ?? '').slice(0, max).trim();
  const done = (message: string) => redirectWithNotice(request, '/manage/affiliates?saved=1', message);
  const failed = (message: string) => redirectWithNotice(request, '/manage/affiliates?error=1', message);
  const intent = value('intent', 16);
  const id = value('id', 60);

  try {
    if (intent === 'approve' || intent === 'decline' || intent === 'suspend') {
      const decision = intent === 'approve' ? 'approved' : intent === 'decline' ? 'declined' : 'suspended';
      const result = await decideAffiliate(id, decision, staff, value('note', 500) || null);
      return result.ok ? done(`Partner ${decision}.`) : failed(result.error);
    }
    if (intent === 'settings') {
      const percent = Number(value('commission_percent', 10));
      const minimum = Number(value('payout_minimum_dollars', 12));
      const hold = Number(value('hold_days', 6));
      if (![percent, minimum, hold].every(Number.isFinite))
        return failed('Enter a number in each of the three programme fields.');
      const result = await saveAffiliateSettings(
        {
          commissionBps: Math.round(percent * 100),
          payoutThresholdCents: Math.round(minimum * 100),
          holdDays: Math.round(hold),
        },
        staff,
      );
      return result.ok
        ? done(`Programme set to ${percent}% commission, $${minimum} minimum, ${Math.round(hold)}-day hold. Existing partners keep their own rate.`)
        : failed(result.error);
    }
    if (intent === 'rate') {
      const percent = Number(value('rate_percent', 10));
      if (!Number.isFinite(percent)) return failed('Enter the commission as a percentage.');
      const result = await setCommissionRate(id, Math.round(percent * 100));
      return result.ok ? done(`Commission set to ${percent}%.`) : failed(result.error);
    }
    if (intent === 'tax_form') {
      const result = await recordTaxForm(id, value('reference'));
      return result.ok ? done('Tax form recorded as on file.') : failed(result.error);
    }
    if (intent === 'payout') {
      const result = await createPayout(id, staff);
      return result.ok
        ? done(`Payout of $${(result.amountCents / 100).toFixed(2)} prepared. Send it, then record the reference.`)
        : failed(result.error);
    }
    if (intent === 'payout_sent') {
      const result = await markPayoutSent(id, value('reference'), staff);
      return result.ok ? done('Payout recorded as sent.') : failed(result.error);
    }
    if (intent === 'payout_cancel') {
      const result = await cancelPayout(id);
      return result.ok ? done('Payout cancelled; its commissions are available again.') : failed(result.error);
    }
    return failed('Unknown request.');
  } catch (error) {
    console.error('[affiliate] staff action failed', error instanceof Error ? error.message : error);
    return failed('That could not be saved. Try again shortly.');
  }
}
