'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Violation } from '@/lib/catalog-rules';
import { PO_STATUSES, poNumberFromParam, validatePurchaseOrder, validateSupplier, type PoStatus } from '@/lib/procurement-rules';
import { createPurchaseOrder, createSupplier, getPurchaseOrder, getSupplier, setSupplierQualification, transitionPurchaseOrder, updateSupplier } from '@/lib/procurement';
import { canFulfil, canVerifyAccounts, getStaff } from '@/lib/staff-auth';

export type ProcurementFormState = { values: Record<string, string>; errors: string[]; violations: Violation[] };

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

const SUPPLIER_FIELDS = ['name', 'address', 'country', 'contactName', 'contactEmail', 'phone', 'website', 'notes'] as const;

function read(data: FormData, fields: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) {
    const raw = data.get(f);
    out[f] = typeof raw === 'string' ? raw : '';
  }
  return out;
}

/** Suppliers: ops and admin create and edit; the bound id is re-read and never trusted for authorisation. */
export async function saveSupplierAction(mode: { kind: 'create' } | { kind: 'update'; id: string }, _prev: ProcurementFormState, data: FormData): Promise<ProcurementFormState> {
  const values = read(data, SUPPLIER_FIELDS);
  const fail = (message: string): ProcurementFormState => ({ values, errors: [message], violations: [] });
  if (!(await sameOriginAction())) return fail('Request rejected: cross-origin.');
  const staff = await getStaff();
  if (!staff) redirect('/staff/sign-in?return_to=%2Fmanage%2Fprocurement');
  if (!canFulfil(staff)) return fail('Only ops and admin roles can manage suppliers.');
  const validated = validateSupplier({ name: values.name, address: values.address, country: values.country, contactName: values.contactName, contactEmail: values.contactEmail, phone: values.phone, website: values.website, notes: values.notes });
  if (!validated.ok) return { values, errors: validated.errors, violations: validated.violations };
  let outcome;
  try {
    if (mode.kind === 'create') outcome = await createSupplier(validated.value, staff);
    else {
      if (!/^sup_[a-f0-9]{8,32}$/.test(mode.id)) return fail('Unknown supplier.');
      const current = await getSupplier(mode.id);
      if (!current) return fail('Unknown supplier.');
      outcome = await updateSupplier(current.supplier, validated.value, staff);
    }
  } catch (error) {
    console.error('[procurement] supplier save failed', error instanceof Error ? error.message : error);
    return fail('The supplier could not be saved. Try again shortly.');
  }
  if (!outcome.ok) return fail(outcome.error);
  redirect(`/manage/procurement/suppliers/${outcome.id}?saved=1`);
}

/** Qualification decisions are admin only. */
export async function supplierQualificationAction(supplierId: string, _prev: ProcurementFormState, data: FormData): Promise<ProcurementFormState> {
  const values = read(data, [
    'to',
    'reason',
    'scope',
    'evidenceUrl',
    'reviewDueOn',
  ]);
  const fail = (message: string): ProcurementFormState => ({ values, errors: [message], violations: [] });
  if (!(await sameOriginAction())) return fail('Request rejected: cross-origin.');
  const staff = await getStaff();
  if (!staff) redirect('/staff/sign-in?return_to=%2Fmanage%2Fprocurement');
  if (!canVerifyAccounts(staff)) return fail('Only an admin can qualify or suspend a supplier.');
  if (!/^sup_[a-f0-9]{8,32}$/.test(supplierId)) return fail('Unknown supplier.');
  if (values.to !== 'qualified' && values.to !== 'suspended') return fail('Unknown decision.');
  let outcome;
  // The supplier is read inside the try, so a database error returns a form message instead of the framework's error page.
  try {
    const current = await getSupplier(supplierId);
    if (!current) return fail('Unknown supplier.');
    outcome = await setSupplierQualification(
      current.supplier,
      values.to,
      {
        reason: values.reason,
        scope: values.scope,
        evidenceUrl: values.evidenceUrl,
        reviewDueOn: values.reviewDueOn,
      },
      staff,
    );
  } catch (error) {
    console.error('[procurement] qualification failed', error instanceof Error ? error.message : error);
    return fail('The decision could not be recorded. Try again shortly.');
  }
  if (!outcome.ok) return fail(outcome.error);
  redirect(`/manage/procurement/suppliers/${supplierId}?decided=${values.to}`);
}

const PO_LINES = 6;

export async function createPurchaseOrderAction(_prev: ProcurementFormState, data: FormData): Promise<ProcurementFormState> {
  const fields = ['supplierId', 'orderedOn', 'expectedOn', 'freight', 'duty', 'supplierReference', 'note'];
  for (let i = 0; i < PO_LINES; i++) fields.push(`line_${i}_product`, `line_${i}_quantity`, `line_${i}_cost`);
  const values = read(data, fields);
  const fail = (message: string): ProcurementFormState => ({ values, errors: [message], violations: [] });
  if (!(await sameOriginAction())) return fail('Request rejected: cross-origin.');
  const staff = await getStaff();
  if (!staff) redirect('/staff/sign-in?return_to=%2Fmanage%2Fprocurement');
  if (!canFulfil(staff)) return fail('Only ops and admin roles can raise purchase orders.');
  const lines = Array.from({ length: PO_LINES }, (_, i) => ({ productCode: values[`line_${i}_product`], quantity: values[`line_${i}_quantity`], lineCost: values[`line_${i}_cost`] }));
  const validated = validatePurchaseOrder({ supplierId: values.supplierId, orderedOn: values.orderedOn, expectedOn: values.expectedOn, freight: values.freight, duty: values.duty, supplierReference: values.supplierReference, note: values.note, lines });
  if (!validated.ok) return { values, errors: validated.errors, violations: validated.violations };
  let outcome;
  try {
    outcome = await createPurchaseOrder(validated.value, staff);
  } catch (error) {
    console.error('[procurement] purchase order failed', error instanceof Error ? error.message : error);
    return fail('The purchase order could not be saved. Try again shortly.');
  }
  if (!outcome.ok) return fail(outcome.error);
  redirect(`/manage/procurement/orders/${outcome.poNumber}?saved=1`);
}

export async function purchaseOrderTransitionAction(poNumber: string, _prev: ProcurementFormState, data: FormData): Promise<ProcurementFormState> {
  const values = read(data, ['to', 'note']);
  const fail = (message: string): ProcurementFormState => ({ values, errors: [message], violations: [] });
  if (!(await sameOriginAction())) return fail('Request rejected: cross-origin.');
  const staff = await getStaff();
  if (!staff) redirect('/staff/sign-in?return_to=%2Fmanage%2Fprocurement');
  if (!canFulfil(staff)) return fail('Only ops and admin roles can change a purchase order.');
  const number = poNumberFromParam(poNumber);
  if (!number) return fail('Unknown purchase order.');
  if (!(PO_STATUSES as readonly string[]).includes(values.to)) return fail('Unknown status.');
  let outcome;
  try {
    const detail = await getPurchaseOrder(number);
    if (!detail) return fail('Unknown purchase order.');
    outcome = await transitionPurchaseOrder(detail.order, values.to as PoStatus, staff, values.note.trim().slice(0, 300) || null);
  } catch (error) {
    console.error('[procurement] transition failed', error instanceof Error ? error.message : error);
    return fail('The change could not be recorded. Try again shortly.');
  }
  if (!outcome.ok) return fail(outcome.error);
  redirect(`/manage/procurement/orders/${number}?moved=${values.to}`);
}
