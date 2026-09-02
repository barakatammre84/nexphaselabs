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
export const QUANTITY_UNITS = ['mg', 'g', 'kg', 'vials', 'units'] as const;
export type QuantityUnit = (typeof QUANTITY_UNITS)[number];
const QUANTITY_PATTERN = /^(\d+(?:\.\d+)?)\s?(mg|g|kg|vials|units)$/;

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
};

export type LotIntakeValidation =
  | { ok: true; value: LotIntakeInput & { receivedAtDate: Date; manufactureDateValue: Date | null; retestDateValue: Date | null } }
  | { ok: false; errors: string[]; violations: Violation[] };

export function parseQuantity(value: string): { amount: number; unit: QuantityUnit } | null {
  const m = value.trim().match(QUANTITY_PATTERN);
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
  };

  if (!LOT_NUMBER_PATTERN.test(value.lotNumber)) {
    errors.push('Lot number must be 3–32 characters: letters, digits and hyphens.');
  }
  if (!/^NPL-\d{3,4}$/.test(value.productCode)) errors.push('Choose a catalog product.');

  const quantity = parseQuantity(value.quantityReceived);
  if (!quantity) {
    errors.push(`Quantity received must be a number with unit (${QUANTITY_UNITS.join(', ')}), e.g. "25 g" or "40 vials".`);
  } else if (quantity.amount <= 0) {
    errors.push('Quantity received must be greater than zero.');
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
  return { ok: true, value: { ...value, receivedAtDate: receivedAtDate!, manufactureDateValue, retestDateValue } };
}
