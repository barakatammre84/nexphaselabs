'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { LotFormState } from '@/app/manage/lots/actions';
import { validateVerificationDecision } from '@/lib/organization-rules';
import { decideVerification, getOrganizationDetail } from '@/lib/organizations';
import { canVerifyAccounts, getStaff } from '@/lib/staff-auth';

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
 * Approve, decline or ask for more information. Admin only. The bound
 * organisation id is client-editable and is re-read here; authorisation is
 * by role.
 */
export async function decideVerificationAction(organizationId: string, _prev: LotFormState, data: FormData): Promise<LotFormState> {
  const values = { decision: String(data.get('decision') ?? ''), note: String(data.get('note') ?? '') };
  const fail = (message: string): LotFormState => ({ values, errors: [message], violations: [] });

  if (!(await sameOriginAction())) return fail('Request rejected: cross-origin.');
  const staff = await getStaff();
  if (!staff) redirect('/staff/sign-in?return_to=%2Fmanage%2Fverification');
  if (!canVerifyAccounts(staff)) return fail('Only an admin can decide verification.');

  if (!/^org_[a-z0-9]{8,32}$/.test(organizationId)) return fail('Unknown organisation.');

  // The organisation is read inside the try, so a database error returns a form message instead of the framework's error page.
  let outcome;
  try {
    const detail = await getOrganizationDetail(organizationId);
    if (!detail) return fail('Unknown organisation.');

    const validated = validateVerificationDecision(values);
    if (!validated.ok) return { values, errors: validated.errors, violations: [] };

    outcome = await decideVerification(detail, validated.value.decision, validated.value.note, staff);
  } catch (error) {
    console.error('[verification] decision failed', error instanceof Error ? error.message : error);
    return fail('The decision could not be recorded. Try again shortly.');
  }
  if (!outcome.ok) return fail(outcome.error);
  // Whether the applicant was emailed travels with the redirect, so the page never claims a message the site could not send.
  redirect(`/manage/verification/${organizationId}?decided=${outcome.status}${outcome.emailed ? '' : '&emailed=0'}`);
}
