'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import {
  createOperationalCase,
  getOperationalCase,
  updateOperationalCase,
  type CaseInput,
} from '@/lib/operational-cases';
import { requireStaff } from '@/lib/staff-auth';

export type CaseFormState = {
  values: Record<string, string>;
  errors: string[];
  saved: boolean;
  caseNumber?: string;
};

const FIELDS = [
  'type',
  'severity',
  'status',
  'title',
  'summary',
  'ownerId',
  'dueOn',
  'linkedLotNumber',
  'linkedOrderNumber',
  'linkedSupplierId',
  'containment',
  'rootCause',
  'correctiveAction',
  'preventiveAction',
  'evidenceUrl',
  'effectivenessCheck',
  'closureSummary',
  'note',
] as const;

async function sameOriginAction() {
  const h = await headers();
  const host = h.get('host');
  const source = h.get('origin') ?? h.get('referer');
  if (!host || !source) return false;
  try {
    return new URL(source).host === host;
  } catch {
    return false;
  }
}

function valuesFrom(data: FormData) {
  return Object.fromEntries(
    FIELDS.map((field) => {
      const raw = data.get(field);
      return [field, typeof raw === 'string' ? raw : ''];
    }),
  );
}

const failed = (values: Record<string, string>, error: string): CaseFormState => ({
  values,
  errors: [error],
  saved: false,
});

export async function createCaseAction(
  _previous: CaseFormState,
  data: FormData,
): Promise<CaseFormState> {
  const values = valuesFrom(data);
  if (!(await sameOriginAction())) return failed(values, 'Request rejected: cross-origin.');
  const staff = await requireStaff('/manage/cases');
  try {
    const result = await createOperationalCase(values as unknown as CaseInput, staff);
    if (!result.ok) return failed(values, result.error);
    revalidatePath('/manage');
    revalidatePath('/manage/cases');
    return { values: {}, errors: [], saved: true, caseNumber: result.caseNumber };
  } catch (error) {
    console.error('[cases] create failed', error instanceof Error ? error.message : error);
    return failed(values, 'The case could not be created. Try again shortly.');
  }
}

export async function updateCaseAction(
  caseNumber: string,
  _previous: CaseFormState,
  data: FormData,
): Promise<CaseFormState> {
  const values = valuesFrom(data);
  if (!(await sameOriginAction())) return failed(values, 'Request rejected: cross-origin.');
  const staff = await requireStaff(`/manage/cases/${encodeURIComponent(caseNumber)}`);
  try {
    const detail = await getOperationalCase(caseNumber);
    if (!detail) return failed(values, 'The case no longer exists.');
    const result = await updateOperationalCase(
      detail.record,
      values as unknown as CaseInput,
      staff,
    );
    if (!result.ok) return failed(values, result.error);
    revalidatePath('/manage');
    revalidatePath('/manage/cases');
    revalidatePath(`/manage/cases/${caseNumber}`);
    return { values, errors: [], saved: true, caseNumber };
  } catch (error) {
    console.error('[cases] update failed', error instanceof Error ? error.message : error);
    return failed(values, 'The case could not be saved. Try again shortly.');
  }
}
