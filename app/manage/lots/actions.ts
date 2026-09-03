'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  lotNumberFromParam,
  validateDisposition,
  validateLotIntake,
  validateLotTest,
  type LotIntakeInput,
  type LotTestInput,
} from '@/lib/lot-rules';
import { addLotTest, createLot, getLot, setLotDisposition } from '@/lib/lots-admin';
import type { Violation } from '@/lib/catalog-rules';
import { canRecordResults, getStaff } from '@/lib/staff-auth';

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
  'retestDate',
  'note',
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

  let outcome;
  try {
    outcome = await createLot(result.value, staff);
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
  const lot = await getLot(normalised);
  if (!lot) return fail('Unknown lot.');

  const result = validateLotTest(values as unknown as LotTestInput);
  if (!result.ok) return { values, errors: result.errors, violations: result.violations };

  try {
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
  const lot = await getLot(normalised);
  if (!lot) return fail('Unknown lot.');

  const result = validateDisposition({ decision: values.decision, reason: values.reason }, lot.status);
  if (!result.ok) return { values, errors: result.errors, violations: result.violations };

  let outcome;
  try {
    outcome = await setLotDisposition(lot, result.value.decision, result.value.reason, staff);
  } catch (error) {
    console.error('[lots] disposition failed', error instanceof Error ? error.message : error);
    return fail('The decision could not be recorded. Try again shortly.');
  }
  if (!outcome.ok) return fail(outcome.error);
  redirect(`/manage/lots/${encodeURIComponent(lot.lotNumber)}?decided=${outcome.status}`);
}
