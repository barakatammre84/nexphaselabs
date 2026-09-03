import { scanText, type Violation } from '@/lib/catalog-rules';

/**
 * Lot intake and disposition rules.
 *
 *  - A lot arrives in quarantine. Nothing here can set any other status.
 *  - Quantities carry a unit so the movement ledger can be summed.
 *  - Free text that can reach the public lot lookup (manufacturer, origin,
 *    storage condition, analytical summaries) is run through the same
 *    forbidden-language scanner as the catalog.
 */

export const LOT_NUMBER_PATTERN = /^[A-Z0-9-]{3,32}$/;
export const QUANTITY_UNITS = ['ug', 'mg', 'g', 'kg', 'vials', 'units'] as const;
export type QuantityUnit = (typeof QUANTITY_UNITS)[number];
const QUANTITY_PATTERN = /^(\d+(?:\.\d+)?)\s?(ug|mg|g|kg|vials|units)$/;

export type LotIntakeInput = {
  lotNumber: string;
  productCode: string;
  manufacturerName?: string | null;
  manufacturerAddress?: string | null;
  supplierName?: string | null;
  countryOfOrigin?: string | null;
  entryNumber?: string | null;
  manufactureDate?: string | null; // YYYY-MM-DD
  receivedAt: string; // YYYY-MM-DD
  quantityReceived: string;
  storageLocation?: string | null;
  storageCondition?: string | null;
  retestDate?: string | null; // YYYY-MM-DD
  note?: string | null;
  /** Landed cost in dollars as typed, optional. */
  cost?: string | null;
  costNote?: string | null;
};

export type LotIntakeValidation =
  | {
      ok: true;
      value: LotIntakeInput & {
        receivedAtDate: Date;
        manufactureDateValue: Date | null;
        retestDateValue: Date | null;
        costCents: number | null;
      };
    }
  | { ok: false; errors: string[]; violations: Violation[] };

/**
 * Normalise a lot number from a route segment. Returns null for anything
 * that is not a well-formed lot number, including malformed percent-encoding.
 */
export function lotNumberFromParam(value: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return null;
  }
  const normalised = decoded.trim().toUpperCase();
  return LOT_NUMBER_PATTERN.test(normalised) ? normalised : null;
}

/* ------------------------------------------------------------------------ */
/* Test results                                                              */
/* ------------------------------------------------------------------------ */

export const TEST_TYPES = ['identity', 'purity', 'water', 'endotoxin', 'heavy_metal', 'residual_solvent'] as const;
export type TestType = (typeof TEST_TYPES)[number];

export const TEST_TYPE_LABEL: Record<TestType, string> = {
  identity: 'Identity',
  purity: 'Purity',
  water: 'Water content',
  endotoxin: 'Bacterial endotoxin',
  heavy_metal: 'Heavy metal',
  residual_solvent: 'Residual solvent',
};

export type LotTestInput = {
  testType: string;
  analyte?: string | null;
  method: string;
  result: string;
  specification?: string | null;
  /** 'pass' | 'fail' | '' (not assessed) */
  passed: string;
  testedBy?: string | null;
  testedAt?: string | null; // YYYY-MM-DD
};

export type LotTestValidation =
  | {
      ok: true;
      value: {
        testType: TestType;
        analyte: string | null;
        method: string;
        result: string;
        specification: string | null;
        passed: boolean | null;
        testedBy: string | null;
        testedAtDate: Date | null;
      };
    }
  | { ok: false; errors: string[]; violations: Violation[] };

/**
 * One row per test. Every text field here can reach the public lot lookup,
 * so all of it is scanned. A result is a measurement, never a claim.
 */
export function validateLotTest(raw: LotTestInput, now = new Date()): LotTestValidation {
  const errors: string[] = [];
  const violations: Violation[] = [];
  const t = (s: string | null | undefined) => (s ?? '').trim();

  const testType = t(raw.testType);
  const analyte = t(raw.analyte) || null;
  const method = t(raw.method);
  const result = t(raw.result);
  const specification = t(raw.specification) || null;
  const passedRaw = t(raw.passed);
  const testedBy = t(raw.testedBy) || null;

  if (!(TEST_TYPES as readonly string[]).includes(testType)) {
    errors.push(`Test type must be one of: ${TEST_TYPES.join(', ')}.`);
  }
  if (!method) errors.push('Method is required (e.g. "RP-HPLC, 220 nm").');
  if (!result) errors.push('Result is required.');
  if (method.length > 200 || result.length > 200 || (specification ?? '').length > 200) {
    errors.push('Method, result and specification must each be 200 characters or fewer.');
  }
  if ((testType === 'heavy_metal' || testType === 'residual_solvent') && !analyte) {
    errors.push('Name the analyte for a heavy-metal or residual-solvent test.');
  }
  let passed: boolean | null = null;
  if (passedRaw === 'pass') passed = true;
  else if (passedRaw === 'fail') passed = false;
  else if (passedRaw !== '') errors.push('Outcome must be pass, fail, or left unassessed.');
  if (passed !== null && !specification) {
    errors.push('Give the specification the result was judged against.');
  }

  const testedAtDate = parseDate(raw.testedAt, 'Date tested', errors);
  if (testedAtDate && testedAtDate.getTime() > now.getTime() + 24 * 3600 * 1000) {
    errors.push('Date tested cannot be in the future.');
  }

  const scanned: [string, string | null][] = [
    ['analyte', analyte],
    ['method', method],
    ['result', result],
    ['specification', specification],
    ['testedBy', testedBy],
  ];
  for (const [field, text] of scanned) violations.push(...scanText(field, text));

  if (errors.length || violations.length) return { ok: false, errors, violations };
  return {
    ok: true,
    value: { testType: testType as TestType, analyte, method, result, specification, passed, testedBy, testedAtDate },
  };
}

/* ------------------------------------------------------------------------ */
/* Disposition                                                               */
/* ------------------------------------------------------------------------ */

export const DISPOSITIONS = ['release', 'hold', 'reject', 'withdraw'] as const;
export type Disposition = (typeof DISPOSITIONS)[number];

export const DISPOSITION_TARGET: Record<Disposition, string> = {
  release: 'released',
  hold: 'on_hold',
  reject: 'rejected',
  withdraw: 'withdrawn',
};

/** Which decisions are allowed from which current status. */
export const ALLOWED_TRANSITIONS: Record<string, Disposition[]> = {
  quarantine: ['release', 'hold', 'reject'],
  on_hold: ['release', 'reject', 'withdraw'],
  released: ['hold', 'withdraw'],
  rejected: [],
  withdrawn: [],
  exhausted: [],
};

export type ReleaseSubject = {
  status: string;
  manufacturerName: string | null;
  manufacturerAddress: string | null;
  coaKey: string | null;
  identityConfirmed: boolean;
  purityResult: string | null;
  quantityRemaining: string | null;
};

export type ReleaseTest = { testType: string; passed: boolean | null };

/**
 * Everything that must be true before a named person may release a lot.
 * Recomputed server-side at the moment of release; the UI shows the same list.
 */
export function releaseBlockers(lot: ReleaseSubject, tests: ReleaseTest[]): string[] {
  const blockers: string[] = [];
  if (!lot.manufacturerName || !lot.manufacturerAddress) {
    blockers.push('Manufacturer name and address are not recorded (16 CCR 1736.9(d)).');
  }
  if (!lot.coaKey) blockers.push('No certificate of analysis on file.');
  if (!tests.some((t) => t.testType === 'identity' && t.passed === true) || !lot.identityConfirmed) {
    blockers.push('Identity has not been confirmed by a passing identity test.');
  }
  if (!tests.some((t) => t.testType === 'purity') || !lot.purityResult) {
    blockers.push('No purity result recorded.');
  }
  const failed = tests.filter((t) => t.passed === false);
  if (failed.length) blockers.push(`${failed.length} test${failed.length === 1 ? '' : 's'} failed specification.`);
  const remaining = lot.quantityRemaining ? parseQuantity(lot.quantityRemaining) : null;
  if (!remaining || remaining.amount <= 0) blockers.push('No quantity remaining.');
  return blockers;
}

export type DispositionValidation =
  | { ok: true; value: { decision: Disposition; reason: string | null } }
  | { ok: false; errors: string[]; violations: Violation[] };

export function validateDisposition(
  raw: { decision: string; reason?: string | null },
  currentStatus: string,
): DispositionValidation {
  const errors: string[] = [];
  const violations: Violation[] = [];
  const decision = (raw.decision ?? '').trim();
  const reason = (raw.reason ?? '').trim() || null;

  if (!(DISPOSITIONS as readonly string[]).includes(decision)) {
    errors.push('Choose a decision.');
    return { ok: false, errors, violations };
  }
  const allowed = ALLOWED_TRANSITIONS[currentStatus] ?? [];
  if (!allowed.includes(decision as Disposition)) {
    errors.push(`A lot in status "${currentStatus}" cannot be ${decision === 'release' ? 'released' : decision === 'hold' ? 'put on hold' : decision + 'ed'}.`);
  }
  if (decision !== 'release' && !reason) errors.push('A reason is required for a hold, rejection or withdrawal.');
  if (reason && reason.length > 500) errors.push('Reason must be 500 characters or fewer.');
  violations.push(...scanText('reason', reason));

  if (errors.length || violations.length) return { ok: false, errors, violations };
  return { ok: true, value: { decision: decision as Disposition, reason } };
}

export function parseQuantity(value: string): { amount: number; unit: QuantityUnit } | null {
  const m = value.trim().replace(/µg|μg/g, 'ug').match(QUANTITY_PATTERN);
  if (!m) return null;
  return { amount: Number(m[1]), unit: m[2] as QuantityUnit };
}

export function formatQuantity(amount: number, unit: QuantityUnit): string {
  return `${Number.isInteger(amount) ? amount : amount.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')} ${unit}`;
}

function parseDate(value: string | null | undefined, field: string, errors: string[], required = false): Date | null {
  const t = (value ?? '').trim();
  if (!t) {
    if (required) errors.push(`${field} is required.`);
    return null;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    errors.push(`${field} must be a date in YYYY-MM-DD form.`);
    return null;
  }
  const d = new Date(`${t}T00:00:00Z`);
  // JS rolls "2026-02-30" into March; a round trip catches that.
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== t) {
    errors.push(`${field} is not a real date.`);
    return null;
  }
  return d;
}

export function validateLotIntake(raw: LotIntakeInput, now = new Date()): LotIntakeValidation {
  const errors: string[] = [];
  const violations: Violation[] = [];
  const t = (s: string | null | undefined) => (s ?? '').trim();

  const value: LotIntakeInput = {
    lotNumber: t(raw.lotNumber).toUpperCase(),
    productCode: t(raw.productCode).toUpperCase(),
    manufacturerName: t(raw.manufacturerName) || null,
    manufacturerAddress: t(raw.manufacturerAddress) || null,
    supplierName: t(raw.supplierName) || null,
    countryOfOrigin: t(raw.countryOfOrigin) || null,
    entryNumber: t(raw.entryNumber) || null,
    manufactureDate: t(raw.manufactureDate) || null,
    receivedAt: t(raw.receivedAt),
    quantityReceived: t(raw.quantityReceived),
    storageLocation: t(raw.storageLocation) || null,
    storageCondition: t(raw.storageCondition) || null,
    retestDate: t(raw.retestDate) || null,
    note: t(raw.note) || null,
    cost: t(raw.cost) || null,
    costNote: t(raw.costNote) || null,
  };

  const costCents = parseCostCents(value.cost);
  if (costCents !== null && Number.isNaN(costCents)) errors.push('Landed cost must be a dollar amount such as 1250 or 1250.00.');

  if (!LOT_NUMBER_PATTERN.test(value.lotNumber)) {
    errors.push('Lot number must be 3–32 characters: letters, digits and hyphens.');
  }
  if (!/^NPL-\d{3,4}$/.test(value.productCode)) errors.push('Choose a catalog product.');

  const quantity = parseQuantity(value.quantityReceived);
  if (!quantity) {
    errors.push(`Quantity received must be a number with unit (${QUANTITY_UNITS.join(', ')}), e.g. "25 g" or "40 vials".`);
  } else if (quantity.amount <= 0) {
    errors.push('Quantity received must be greater than zero.');
  } else if (Math.round(quantity.amount * 1_000_000) % (quantity.unit === 'ug' ? 1_000_000 : quantity.unit === 'mg' ? 1_000 : 1) !== 0 && ['ug', 'mg', 'g', 'kg'].includes(quantity.unit)) {
    errors.push('Quantity received cannot be finer than one microgram (the ledger resolution).');
  } else {
    value.quantityReceived = formatQuantity(quantity.amount, quantity.unit);
  }

  const receivedAtDate = parseDate(value.receivedAt, 'Date received', errors, true);
  if (receivedAtDate && receivedAtDate.getTime() > now.getTime() + 24 * 3600 * 1000) {
    errors.push('Date received cannot be in the future.');
  }
  const manufactureDateValue = parseDate(value.manufactureDate, 'Date of manufacture', errors);
  if (manufactureDateValue && receivedAtDate && manufactureDateValue > receivedAtDate) {
    errors.push('Date of manufacture cannot be after the date received.');
  }
  const retestDateValue = parseDate(value.retestDate, 'Retest date', errors);
  if (retestDateValue && receivedAtDate && retestDateValue <= receivedAtDate) {
    errors.push('Retest date must be after the date received.');
  }

  // Manufacturer is optional at intake and mandatory at release (16 CCR 1736.9(d)).
  if ((value.manufacturerName && !value.manufacturerAddress) || (!value.manufacturerName && value.manufacturerAddress)) {
    errors.push('Give both the manufacturer name and address, or leave both blank until the COA arrives.');
  }
  if (value.countryOfOrigin && !/^[A-Za-z .'-]{2,60}$/.test(value.countryOfOrigin)) {
    errors.push('Country of origin must be a country name.');
  }

  const scanned: [string, string | null | undefined][] = [
    ['manufacturerName', value.manufacturerName],
    ['manufacturerAddress', value.manufacturerAddress],
    ['supplierName', value.supplierName],
    ['countryOfOrigin', value.countryOfOrigin],
    ['storageLocation', value.storageLocation],
    ['storageCondition', value.storageCondition],
    ['note', value.note],
  ];
  for (const [field, text] of scanned) violations.push(...scanText(field, text));

  if (errors.length || violations.length) return { ok: false, errors, violations };
  return { ok: true, value: { ...value, receivedAtDate: receivedAtDate!, manufactureDateValue, retestDateValue, costCents } };
}

/** "1250" | "$1,250.50" → cents; null for blank; NaN for malformed. */
export function parseCostCents(value: string | null | undefined): number | null {
  const t = (value ?? '').trim().replace(/^\$/, '').replace(/,/g, '');
  if (!t) return null;
  if (!/^\d{1,9}(?:\.\d{1,2})?$/.test(t)) return Number.NaN;
  return Math.round(Number(t) * 100);
}
