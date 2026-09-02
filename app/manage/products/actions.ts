'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createProduct, updateProduct } from '@/lib/catalog-admin';
import { getProductByCode } from '@/lib/catalog-data';
import { formValues, valuesToInput, type FormValues } from '@/lib/catalog-form';
import { validateProductInput, type Violation } from '@/lib/catalog-rules';
import { canEditCatalog, getStaff } from '@/lib/staff-auth';

export type ProductFormState = {
  values: FormValues;
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

/**
 * Create or update a product. `mode` is bound by the page; the code for an
 * update comes from the bound argument, never from the form, so a form
 * cannot be pointed at a different product.
 */
export async function saveProductAction(
  mode: { kind: 'create' } | { kind: 'update'; code: string },
  _prev: ProductFormState,
  data: FormData,
): Promise<ProductFormState> {
  const values = formValues(data);
  const fail = (message: string): ProductFormState => ({ values, errors: [message], violations: [] });

  if (!(await sameOriginAction())) return fail('Request rejected: cross-origin.');
  const staff = await getStaff();
  if (!staff) redirect('/staff/sign-in?return_to=%2Fmanage');
  if (!canEditCatalog(staff)) return fail('Your role cannot edit the catalog.');

  const result = validateProductInput(valuesToInput(values));
  if (!result.ok) return { values, errors: result.errors, violations: result.violations };

  const note = values.note?.trim() || null;
  let outcome;
  try {
    if (mode.kind === 'create') {
      outcome = await createProduct(result.value, staff, note);
    } else {
      const current = await getProductByCode(mode.code);
      if (!current) return fail('That product no longer exists.');
      outcome = await updateProduct(current, { ...result.value, code: current.code }, staff, note);
    }
  } catch (error) {
    console.error('[catalog] write failed', error instanceof Error ? error.message : error);
    return fail('The catalog could not be saved. Try again shortly.');
  }

  if (!outcome.ok) return fail(outcome.error);
  redirect(`/manage?saved=${encodeURIComponent(outcome.code)}`);
}
