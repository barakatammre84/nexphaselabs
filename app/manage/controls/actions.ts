'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  assignControlOwners,
  updateOperationalControl,
  type ControlUpdateInput,
} from '@/lib/operational-controls';
import { getStaff } from '@/lib/staff-auth';

export type ControlFormState = {
  values: Record<string, string>;
  errors: string[];
  saved: boolean;
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

const FIELDS = ['status', 'ownerId', 'dueOn', 'evidenceUrl', 'note'] as const;

export async function updateOperationalControlAction(
  controlKey: string,
  _previous: ControlFormState,
  data: FormData,
): Promise<ControlFormState> {
  const values: Record<string, string> = {};
  for (const field of FIELDS) {
    const raw = data.get(field);
    values[field] = typeof raw === 'string' ? raw : '';
  }
  const fail = (error: string): ControlFormState => ({
    values,
    errors: [error],
    saved: false,
  });
  if (!(await sameOriginAction())) return fail('Request rejected: cross-origin.');
  const staff = await getStaff();
  if (!staff) redirect('/staff/sign-in?return_to=%2Fmanage%2Fcontrols');
  try {
    const result = await updateOperationalControl(
      controlKey,
      values as unknown as ControlUpdateInput,
      staff,
    );
    if (!result.ok) return fail(result.error);
    revalidatePath('/manage');
    revalidatePath('/manage/controls');
    return { values, errors: [], saved: true };
  } catch (error) {
    console.error(
      '[controls] update failed',
      error instanceof Error ? error.message : error,
    );
    return fail('The control could not be saved. Try again shortly.');
  }
}

export type ControlSeedState = {
  errors: string[];
  assigned: number;
  unchanged: number;
};

/**
 * Assign owners and a due date to many controls at once (16.5). Owner and date
 * only: each row still goes through the single-control rules, so every
 * assignment is attributed and recorded in the append-only history.
 */
export async function seedControlOwnersAction(
  _previous: ControlSeedState,
  data: FormData,
): Promise<ControlSeedState> {
  const fail = (error: string): ControlSeedState => ({
    errors: [error],
    assigned: 0,
    unchanged: 0,
  });
  if (!(await sameOriginAction())) return fail('Request rejected: cross-origin.');
  const staff = await getStaff();
  if (!staff) redirect('/staff/sign-in?return_to=%2Fmanage%2Fcontrols');
  if (staff.role !== 'admin') return fail('Only an administrator assigns control owners.');

  const dueOn = String(data.get('dueOn') ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueOn)) {
    return fail('Choose the date these controls are due, in YYYY-MM-DD format.');
  }
  const assignments: { key: string; ownerId: string; dueOn: string }[] = [];
  for (const [field, value] of data.entries()) {
    if (!field.startsWith('owner:') || typeof value !== 'string' || !value.trim()) continue;
    assignments.push({ key: field.slice(6), ownerId: value.trim(), dueOn });
  }
  if (assignments.length === 0) return fail('Choose an owner for at least one control.');

  try {
    const result = await assignControlOwners(assignments, staff);
    revalidatePath('/manage');
    revalidatePath('/manage/controls');
    return {
      errors: result.failures.map((failure) => `${failure.key}: ${failure.error}`),
      assigned: result.assigned.length,
      unchanged: result.unchanged.length,
    };
  } catch (error) {
    console.error(
      '[controls] assignment failed',
      error instanceof Error ? error.message : error,
    );
    return fail('The assignment could not be saved. Try again shortly.');
  }
}
