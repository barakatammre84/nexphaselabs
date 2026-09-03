'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createProduct, updateProduct } from '@/lib/catalog-admin';
import { getProductByCode } from '@/lib/catalog-data';
import { formValues, valuesToInput, type FormValues } from '@/lib/catalog-form';
import { validateProductInput, type Violation } from '@/lib/catalog-rules';
import { listActiveClasses } from '@/lib/classes';
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
 * Create or update a product. `mode` is bound by the page. Bound arguments
 * are serialised into the form for progressive enhancement and are therefore
 * client-editable; nothing here treats them as an authorisation decision.
 * Authorisation is per user (canEditCatalog), and the update path re-reads
 * the product by code and refuses to change the code.
 */
export async function saveProductAction(
  mode: { kind: 'create' } | { kind: 'update'; code: string },
  _prev: ProductFormState,
  data: FormData,
): Promise<ProductFormState> {
  const values = formValues(data);
  const fail = (message: string): ProductFormState => ({
    values,
    errors: [message],
    violations: [],
  });

  if (!(await sameOriginAction()))
    return fail('Request rejected: cross-origin.');
  const staff = await getStaff();
  if (!staff) redirect('/staff/sign-in?return_to=%2Fmanage%2Fproducts');
  if (!canEditCatalog(staff)) return fail('Your role cannot edit the catalog.');

  let classNames: string[];
  try {
    classNames = (await listActiveClasses()).map((c) => c.name);
  } catch (error) {
    console.error(
      '[catalog] classes unavailable',
      error instanceof Error ? error.message : error,
    );
    return fail('The catalog could not be saved. Try again shortly.');
  }
  const result = validateProductInput(valuesToInput(values), {
    classes: classNames,
  });
  if (!result.ok)
    return { values, errors: result.errors, violations: result.violations };

  const note = values.note?.trim() || null;
  let outcome;
  try {
    if (mode.kind === 'create') {
      outcome = await createProduct(result.value, staff, note);
    } else {
      const current = await getProductByCode(mode.code);
      if (!current) return fail('That product no longer exists.');
      outcome = await updateProduct(
        current,
        { ...result.value, code: current.code },
        staff,
        note,
      );
    }
  } catch (error) {
    console.error(
      '[catalog] write failed',
      error instanceof Error ? error.message : error,
    );
    return fail('The catalog could not be saved. Try again shortly.');
  }

  if (!outcome.ok) return fail(outcome.error);
  redirect(`/manage/products?saved=${encodeURIComponent(outcome.code)}`);
}
