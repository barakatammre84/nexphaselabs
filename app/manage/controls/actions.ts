'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
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
