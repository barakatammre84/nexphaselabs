'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { STAFF_ROLES, canManageStaff, getStaff, type StaffRole } from '@/lib/staff-auth';
import { createStaffUser, getStaffDetail, resetStaffPassword, revokeStaffSessions, setStaffActive, setStaffRole } from '@/lib/staff-admin';
import { validateStaffInput } from '@/lib/staff-rules';

export type StaffFormState = {
  values: Record<string, string>;
  errors: string[];
  /** Shown once, never stored: the one-time password for a created or reset account. */
  oneTime?: { email: string; password: string; kind: 'created' | 'reset' };
  done?: string;
};

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

async function admin(): Promise<{ ok: true; staff: NonNullable<Awaited<ReturnType<typeof getStaff>>> } | { ok: false; error: string }> {
  if (!(await sameOriginAction())) return { ok: false, error: 'Request rejected: cross-origin.' };
  const staff = await getStaff();
  if (!staff) redirect('/staff/sign-in?return_to=%2Fmanage%2Fstaff');
  if (!canManageStaff(staff)) return { ok: false, error: 'Only an admin can manage staff accounts.' };
  return { ok: true, staff };
}

export async function createStaffAction(_prev: StaffFormState, data: FormData): Promise<StaffFormState> {
  const values = { email: String(data.get('email') ?? ''), name: String(data.get('name') ?? ''), role: String(data.get('role') ?? '') };
  const gate = await admin();
  if (!gate.ok) return { values, errors: [gate.error] };
  const validated = validateStaffInput(values);
  if (!validated.ok) return { values, errors: validated.errors };
  try {
    const outcome = await createStaffUser(validated.value, gate.staff);
    if (!outcome.ok) return { values, errors: [outcome.error] };
    revalidatePath('/manage/staff');
    return { values: {}, errors: [], oneTime: { email: validated.value.email, password: outcome.oneTimePassword ?? '', kind: 'created' }, done: outcome.id };
  } catch (error) {
    console.error('[staff] create failed', error instanceof Error ? error.message : error);
    return { values, errors: ['The account could not be created. Try again shortly.'] };
  }
}

/**
 * Role, activation, password reset and session revocation for one account.
 * The bound id is client-editable; the account is re-read and authorisation
 * is by the actor's role, never by the form.
 */
export async function staffAccountAction(targetId: string, _prev: StaffFormState, data: FormData): Promise<StaffFormState> {
  const op = String(data.get('op') ?? '');
  const values = { op, role: String(data.get('role') ?? ''), reason: String(data.get('reason') ?? '').trim().slice(0, 300) };
  const gate = await admin();
  if (!gate.ok) return { values, errors: [gate.error] };
  if (!/^stf_[a-f0-9]{8,32}$/.test(targetId)) return { values, errors: ['Unknown account.'] };
  let revoked: number | null = null;
  // The account is read inside the try, so a database error returns a form message instead of the framework's error page.
  try {
    const detail = await getStaffDetail(targetId);
    if (!detail) return { values, errors: ['Unknown account.'] };
    const target = detail.user;
    let outcome;
    switch (op) {
      case 'role':
        if (!(STAFF_ROLES as readonly string[]).includes(values.role)) return { values, errors: ['Choose a role.'] };
        outcome = await setStaffRole(target, values.role as StaffRole, gate.staff, values.reason || null);
        break;
      case 'deactivate':
        outcome = await setStaffActive(target, false, gate.staff, values.reason || null);
        break;
      case 'reactivate':
        outcome = await setStaffActive(target, true, gate.staff, values.reason || null);
        break;
      case 'reset':
        outcome = await resetStaffPassword(target, gate.staff);
        if (outcome.ok) {
          revalidatePath(`/manage/staff/${targetId}`);
          return { values: {}, errors: [], oneTime: { email: target.email, password: outcome.oneTimePassword ?? '', kind: 'reset' }, done: op };
        }
        break;
      case 'revoke':
        outcome = await revokeStaffSessions(target, gate.staff);
        if (outcome.ok) revoked = outcome.count ?? 0;
        break;
      default:
        return { values, errors: ['Unknown action.'] };
    }
    if (!outcome.ok) return { values, errors: [outcome.error] };
  } catch (error) {
    console.error('[staff] account action failed', error instanceof Error ? error.message : error);
    return { values, errors: ['The change could not be recorded. Try again shortly.'] };
  }
  // redirect() throws to signal navigation; it must sit outside the try so the catch cannot swallow it.
  if (revoked !== null) redirect(`/manage/staff/${targetId}?done=revoke&n=${revoked}`);
  redirect(`/manage/staff/${targetId}?done=${op}`);
}
