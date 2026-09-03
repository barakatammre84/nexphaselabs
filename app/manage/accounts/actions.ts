'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAccountDetail, reinstateAccount, revokeAccountSessions, staffResendVerification, staffSendPasswordReset, suspendAccount } from '@/lib/account-service';
import { canVerifyAccounts, getStaff } from '@/lib/staff-auth';

export type AccountServiceState = { values: Record<string, string>; errors: string[] };

async function sameOriginAction(): Promise<boolean> {
  const h = await headers();
  const host = h.get('host');
  const origin = h.get('origin') ?? h.get('referer');
  if (!host || !origin) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/**
 * Customer-service actions on one account. Admin only. The bound id is
 * client-editable; the account is re-read and authorisation is by role.
 */
export async function accountServiceAction(accountId: string, _prev: AccountServiceState, data: FormData): Promise<AccountServiceState> {
  const op = String(data.get('op') ?? '');
  const values = { op, reason: String(data.get('reason') ?? '').trim().slice(0, 300) };
  const fail = (message: string): AccountServiceState => ({ values, errors: [message] });
  if (!(await sameOriginAction())) return fail('Request rejected: cross-origin.');
  const staff = await getStaff();
  if (!staff) redirect('/staff/sign-in?return_to=%2Fmanage%2Faccounts');
  if (!canVerifyAccounts(staff)) return fail('Only an admin can service customer accounts.');
  if (!/^acc_[a-f0-9]{8,32}$/.test(accountId)) return fail('Unknown account.');
  const detail = await getAccountDetail(accountId);
  if (!detail) return fail('Unknown account.');
  let outcome;
  try {
    switch (op) {
      case 'reset':
        outcome = await staffSendPasswordReset(detail.account, staff);
        break;
      case 'verify':
        outcome = await staffResendVerification(detail.account, staff);
        break;
      case 'suspend':
        outcome = await suspendAccount(detail.account, values.reason, staff);
        break;
      case 'reinstate':
        outcome = await reinstateAccount(detail.account, values.reason || null, staff);
        break;
      case 'revoke':
        outcome = await revokeAccountSessions(detail.account, staff);
        break;
      default:
        return fail('Unknown action.');
    }
  } catch (error) {
    console.error('[accounts] service action failed', error instanceof Error ? error.message : error);
    return fail('The change could not be recorded. Try again shortly.');
  }
  if (!outcome.ok) return fail(outcome.error);
  redirect(`/manage/accounts/${accountId}?done=${encodeURIComponent(outcome.detail ?? op)}`);
}
