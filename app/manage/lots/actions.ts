'use server';

import { headers } from 'next/headers';
import { notifyWaitlist } from '@/lib/waitlist';
import { redirect } from 'next/navigation';
import {
  CORRECTABLE_FIELDS,
  lotNumberFromParam,
  validateDisposition,
  validateLotCorrection,
  validateLotIntake,
  validateLotTest,
  type LotIntakeInput,
  type LotTestInput,
} from '@/lib/lot-rules';
import { addLotTest, correctLot, createLot, getLot, lotToIntakeInput, setLotDisposition } from '@/lib/lots-admin';
import { getExpectedReceipt } from '@/lib/procurement';
import type { Violation } from '@/lib/catalog-rules';
import { canFulfil, canManageFinance, canRecordResults, canVerifyAccounts, getStaff } from '@/lib/staff-auth';
import {
  recordInventoryMovement,
  validateInventoryMovement,
  type InventoryMovementInput,
} from '@/lib/inventory-movements';

export type LotFormState = {
  values: Record<string, string>;
  errors: string[];
  violations: Violation[];
};

const FIELDS = [
  'lotNumber',
  'productCode',
  'manufacturerName',
  'manufacturerAddress',
  'supplierName',
  'countryOfOrigin',
  'entryNumber',
  'manufactureDate',
  'receivedAt',
  'quantityReceived',
  'storageLocation',
  'storageCondition',
  'containerSize',
  'retestDate',
  'note',
  'cost',
  'costNote',
  'purchaseOrderLineId',
] as const;

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

export async function receiveLotAction(_prev: LotFormState, data: FormData): Promise<LotFormState> {
  const values: Record<string, string> = {};
  for (const f of FIELDS) {
    const raw = data.get(f);
    values[f] = typeof raw === 'string' ? raw : '';
  }
  const fail = (message: string): LotFormState => ({ values, errors: [message], violations: [] });

  if (!(await sameOriginAction())) return fail('Request rejected: cross-origin.');
  const staff = await getStaff();
  if (!staff) redirect('/staff/sign-in?return_to=%2Fmanage%2Flots%2Fnew');

  const result = validateLotIntake(values as unknown as LotIntakeInput);
  if (!result.ok) return { values, errors: result.errors, violations: result.violations };
  if ((result.value.costCents !== null || result.value.costNote) && !canManageFinance(staff)) {
    return fail('Only an admin can record landed cost. Leave the cost fields blank; an admin can set it from the lot page.');
  }

  let outcome;
  try {
    const lineId = values.purchaseOrderLineId?.trim() ?? '';
    let expected = null;
    if (lineId) {
      if (!canFulfil(staff)) return fail('Only ops and admin roles can receive against a purchase order. Clear the expected receipt to record the lot without one.');
      if (!/^pol_[a-f0-9]{8,32}$/.test(lineId)) return fail('Unknown expected receipt.');
      expected = await getExpectedReceipt(lineId);
      if (!expected) return fail('That expected receipt is no longer open. Reload and choose again, or receive without one.');
    }
    outcome = await createLot(result.value, staff, expected);
  } catch (error) {
    console.error('[lots] intake failed', error instanceof Error ? error.message : error);
    return fail('The lot could not be recorded. Try again shortly.');
  }
  if (!outcome.ok) return fail(outcome.error);
  redirect(`/manage/lots/${encodeURIComponent(outcome.lotNumber)}?received=1`);
}

const TEST_FIELDS = ['testType', 'analyte', 'method', 'result', 'specification', 'passed', 'testedBy', 'testedAt'] as const;

/**
 * Record a test result. The lot number is bound by the page. Bound arguments
 * are client-editable (they travel in the form for progressive enhancement),
 * so the lot is re-validated and re-read here, and authorisation is by role,
 * not by which lot the form names.
 */
export async function addLotTestAction(lotNumber: string, _prev: LotFormState, data: FormData): Promise<LotFormState> {
  const values: Record<string, string> = {};
  for (const f of TEST_FIELDS) {
    const raw = data.get(f);
    values[f] = typeof raw === 'string' ? raw : '';
  }
  const fail = (message: string): LotFormState => ({ values, errors: [message], violations: [] });

  if (!(await sameOriginAction())) return fail('Request rejected: cross-origin.');
  const staff = await getStaff();
  if (!staff) redirect('/staff/sign-in?return_to=%2Fmanage%2Flots');
  if (!canRecordResults(staff)) return fail('Only QC and admin roles can record test results.');

  const normalised = lotNumberFromParam(lotNumber);
  if (!normalised) return fail('Unknown lot.');

  // The lot is read inside the try, so a database error returns a form message instead of the framework's error page.
  let lot;
  try {
    lot = await getLot(normalised);
    if (!lot) return fail('Unknown lot.');

    const result = validateLotTest(values as unknown as LotTestInput);
    if (!result.ok) return { values, errors: result.errors, violations: result.violations };
    if (lot.status === 'released') return fail('Put this lot on hold before recording new analytical results, then review it for release again.');

    await addLotTest(lot, result.value, staff);
  } catch (error) {
    console.error('[lots] test record failed', error instanceof Error ? error.message : error);
    return fail('The result could not be recorded. Try again shortly.');
  }
  redirect(`/manage/lots/${encodeURIComponent(lot.lotNumber)}?tested=1`);
}

/**
 * Release, hold, reject or withdraw a lot. QC and admin only. The decision
 * is validated against the lot's current status, and release re-checks every
 * blocker server-side. The person deciding is recorded by name on the lot
 * and in lot_status_events.
 */
export async function setLotDispositionAction(lotNumber: string, _prev: LotFormState, data: FormData): Promise<LotFormState> {
  const values: Record<string, string> = {
    decision: String(data.get('decision') ?? ''),
    reason: String(data.get('reason') ?? ''),
  };
  const fail = (message: string): LotFormState => ({ values, errors: [message], violations: [] });

  if (!(await sameOriginAction())) return fail('Request rejected: cross-origin.');
  const staff = await getStaff();
  if (!staff) redirect('/staff/sign-in?return_to=%2Fmanage%2Flots');
  if (!canRecordResults(staff)) return fail('Only QC and admin roles can decide lot disposition.');

  const normalised = lotNumberFromParam(lotNumber);
  if (!normalised) return fail('Unknown lot.');

  let lot;
  let outcome;
  try {
    lot = await getLot(normalised);
    if (!lot) return fail('Unknown lot.');

    const result = validateDisposition({ decision: values.decision, reason: values.reason }, lot.status);
    if (!result.ok) return { values, errors: result.errors, violations: result.violations };

    outcome = await setLotDisposition(lot, result.value.decision, result.value.reason, staff);
  } catch (error) {
    console.error('[lots] disposition failed', error instanceof Error ? error.message : error);
    return fail('The decision could not be recorded. Try again shortly.');
  }
  if (!outcome.ok) return fail(outcome.error);
  if (outcome.status === 'released') {
    // Customers who asked to hear about this material get their one notice now rather
    // than on the next cron tick; a failure here never undoes the release (lib/waitlist.ts).
    try {
      await notifyWaitlist(lot.productCode);
    } catch (error) {
      console.error('[waitlist] notify after release failed', error instanceof Error ? error.message : error);
    }
  }
  redirect(`/manage/lots/${encodeURIComponent(lot.lotNumber)}?decided=${outcome.status}`);
}

/**
 * Correct a lot record by supersession. QC and admin. The bound lot number is
 * client-editable; the current record is re-read and the correction is
 * validated against the same rules as a receipt.
 */
export async function correctLotAction(lotNumber: string, _prev: LotFormState, data: FormData): Promise<LotFormState> {
  const values: Record<string, string> = {};
  for (const f of [...CORRECTABLE_FIELDS, 'reason'] as const) {
    const raw = data.get(f);
    values[f] = typeof raw === 'string' ? raw : '';
  }
  const fail = (message: string): LotFormState => ({ values, errors: [message], violations: [] });
  if (!(await sameOriginAction())) return fail('Request rejected: cross-origin.');
  const staff = await getStaff();
  if (!staff) redirect('/staff/sign-in?return_to=%2Fmanage%2Flots');
  if (!canRecordResults(staff)) return fail('Only QC and admin roles can correct a lot record.');
  const number = lotNumberFromParam(lotNumber);
  if (!number) return fail('Unknown lot.');
  let outcome;
  try {
    const current = await getLot(number);
    if (!current) return fail('Unknown lot.');
    const proposed = Object.fromEntries(CORRECTABLE_FIELDS.map((f) => [f, values[f]])) as Partial<Record<(typeof CORRECTABLE_FIELDS)[number], string>>;
    const validated = validateLotCorrection(lotToIntakeInput(current), proposed, values.reason);
    if (!validated.ok) return { values, errors: validated.errors, violations: validated.violations };
    if (validated.changes.some((c) => c.field === 'quantityReceived') && current.purchaseOrderLineId && !canFulfil(staff)) {
      return fail('This lot was received against a purchase order; correcting its quantity changes that order, which only ops and admin roles may do.');
    }
    outcome = await correctLot(current, validated, staff);
  } catch (error) {
    console.error('[lots] correction failed', error instanceof Error ? error.message : error);
    return fail('The correction could not be recorded. Try again shortly.');
  }
  if (!outcome.ok) return fail(outcome.error);
  redirect(`/manage/lots/${encodeURIComponent(number)}?corrected=1`);
}

const MOVEMENT_FIELDS = [
  'movementType',
  'direction',
  'quantity',
  'occurredOn',
  'reason',
  'witnessOne',
  'witnessTwo',
] as const;

/** Record sample use, witnessed destruction, or a reconciled stock adjustment. */
export async function recordInventoryMovementAction(
  lotNumber: string,
  _previous: LotFormState,
  data: FormData,
): Promise<LotFormState> {
  const values: Record<string, string> = {};
  for (const field of MOVEMENT_FIELDS) {
    const raw = data.get(field);
    values[field] = typeof raw === 'string' ? raw : '';
  }
  const fail = (message: string): LotFormState => ({
    values,
    errors: [message],
    violations: [],
  });
  if (!(await sameOriginAction())) return fail('Request rejected: cross-origin.');
  const staff = await getStaff();
  if (!staff) redirect('/staff/sign-in?return_to=%2Fmanage%2Flots');
  if (!canFulfil(staff)) {
    return fail('Only operations and admin roles can record inventory movements.');
  }
  if (
    values.movementType === 'adjustment' &&
    values.direction === 'increase' &&
    !canVerifyAccounts(staff)
  ) {
    return fail('Only an administrator can approve an increase to recorded stock.');
  }
  const number = lotNumberFromParam(lotNumber);
  if (!number) return fail('Unknown lot.');
  try {
    const lot = await getLot(number);
    if (!lot) return fail('Unknown lot.');
    const validated = validateInventoryMovement(
      values as unknown as InventoryMovementInput,
      lot,
    );
    if (!validated.ok) {
      return { values, errors: validated.errors, violations: [] };
    }
    const result = await recordInventoryMovement(lot, validated.value, staff);
    if (!result.ok) return fail(result.error);
  } catch (error) {
    console.error(
      '[lots] inventory movement failed',
      error instanceof Error ? error.message : error,
    );
    return fail('The inventory movement could not be recorded. Try again shortly.');
  }
  redirect(`/manage/lots/${encodeURIComponent(number)}?movement=1`);
}
