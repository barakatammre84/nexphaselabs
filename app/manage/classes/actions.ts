'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Violation } from '@/lib/catalog-rules';
import { validateClassInput } from '@/lib/class-rules';
import { createClass, getClass, updateClass } from '@/lib/classes';
import { canEditCatalog, getStaff } from '@/lib/staff-auth';

export type ClassFormState = {
  values: Record<string, string>;
  errors: string[];
  violations: Violation[];
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

const FIELDS = ['id', 'name', 'blurb', 'sortOrder', 'active', 'note'] as const;

/**
 * Create or update a chemical class. Admin or QC. The bound mode is
 * client-editable; authorisation is by role and the update path re-reads the
 * class and refuses to change its anchor.
 */
export async function saveClassAction(
  mode: { kind: 'create' } | { kind: 'update'; id: string },
  _prev: ClassFormState,
  data: FormData,
): Promise<ClassFormState> {
  const values: Record<string, string> = {};
  for (const f of FIELDS) {
    const raw = data.get(f);
    values[f] = typeof raw === 'string' ? raw : raw ? 'on' : '';
  }
  const fail = (message: string): ClassFormState => ({
    values,
    errors: [message],
    violations: [],
  });

  if (!(await sameOriginAction()))
    return fail('Request rejected: cross-origin.');
  const staff = await getStaff();
  if (!staff) redirect('/staff/sign-in?return_to=%2Fmanage%2Fclasses');
  if (!canEditCatalog(staff)) return fail('Your role cannot edit the catalog.');

  const validated = validateClassInput({
    id: values.id,
    name: values.name,
    blurb: values.blurb,
    sortOrder: values.sortOrder,
    active: values.active === 'on',
  });
  if (!validated.ok)
    return {
      values,
      errors: validated.errors,
      violations: validated.violations,
    };
  const note = values.note.trim() || null;

  let outcome;
  try {
    if (mode.kind === 'create') {
      outcome = await createClass(validated.value, staff, note);
    } else {
      if (!/^[a-z0-9-]{2,40}$/.test(mode.id)) return fail('Unknown class.');
      const current = await getClass(mode.id);
      if (!current) return fail('That class no longer exists.');
      outcome = await updateClass(
        current,
        { ...validated.value, id: current.id },
        staff,
        note,
      );
    }
  } catch (error) {
    console.error(
      '[classes] write failed',
      error instanceof Error ? error.message : error,
    );
    return fail('The class could not be saved. Try again shortly.');
  }
  if (!outcome.ok) return fail(outcome.error);
  redirect(`/manage/classes?saved=${encodeURIComponent(outcome.id)}`);
}
