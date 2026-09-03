import { scanText, type Violation } from '@/lib/catalog-rules';
import { finerThanMicrogram, normalizeQuantity, parseCostCents, parseQuantity } from '@/lib/lot-rules';

/**
 * Pure procurement rules: supplier records, purchase orders and the landed
 * cost that flows from a purchase order line to the lot received against it.
 */

export const SUPPLIER_STATUSES = ['unqualified', 'qualified', 'suspended'] as const;
export type SupplierStatus = (typeof SUPPLIER_STATUSES)[number];

export const PO_STATUSES = ['draft', 'sent', 'partially_received', 'received', 'cancelled'] as const;
export type PoStatus = (typeof PO_STATUSES)[number];
export const PO_STATUS_LABEL: Record<PoStatus, string> = {
  draft: 'Draft',
  sent: 'Sent to supplier',
  partially_received: 'Partly received',
  received: 'Received',
  cancelled: 'Cancelled',
};

/**
 * Staff-driven transitions. Receipt-driven ones (→ partially_received / received) happen in lot
 * intake; a partly received order can also be closed short by a person (→ received with a reason).
 */
export const PO_TRANSITIONS: Record<PoStatus, PoStatus[]> = {
  draft: ['sent', 'cancelled'],
  sent: ['cancelled'],
  partially_received: ['received', 'cancelled'],
  received: [],
  cancelled: [],
};

export type SupplierInput = {
  name: string;
  address?: string | null;
  country?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  phone?: string | null;
  website?: string | null;
  notes?: string | null;
};
export type SupplierValidation =
  | { ok: true; value: Required<{ [K in keyof SupplierInput]: SupplierInput[K] extends string ? string : string | null }>; violations: Violation[] }
  | { ok: false; errors: string[]; violations: Violation[] };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateSupplier(raw: SupplierInput): SupplierValidation {
  const errors: string[] = [];
  const violations: Violation[] = [];
  const t = (v: string | null | undefined) => (v ?? '').trim().replace(/\s+/g, ' ') || null;
  const name = t(raw.name) ?? '';
  if (name.length < 2 || name.length > 120) errors.push('Supplier name must be 2–120 characters.');
  const contactEmail = t(raw.contactEmail);
  if (contactEmail && (!EMAIL.test(contactEmail) || contactEmail.length > 200)) errors.push('Contact email is not a valid address.');
  let website = t(raw.website);
  if (website) {
    if (!/^https?:\/\//i.test(website)) website = `https://${website}`;
    try {
      const u = new URL(website);
      if (!/^https?:$/.test(u.protocol) || !u.hostname.includes('.')) throw new Error('bad');
      website = u.toString().replace(/\/$/, '');
    } catch {
      errors.push('Website is not a valid URL.');
    }
  }
  // Notes are internal qualification evidence ("reviewed", "results", audit findings) and are never
  // published, so they are not run through the public-copy scanner; the name can reach documents and is.
  const notes = (raw.notes ?? '').trim().slice(0, 1000) || null;
  violations.push(...scanText('name', name));
  if (errors.length || violations.length) return { ok: false, errors, violations };
  return {
    ok: true,
    value: { name, address: t(raw.address), country: t(raw.country), contactName: t(raw.contactName), contactEmail, phone: t(raw.phone), website, notes },
    violations: [],
  };
}

export type PoLineInput = { productCode: string; quantity: string; lineCost: string };
export type PoInput = {
  supplierId: string;
  orderedOn?: string | null;
  expectedOn?: string | null;
  freight?: string | null;
  duty?: string | null;
  supplierReference?: string | null;
  note?: string | null;
  lines: PoLineInput[];
};
export type PoValidation =
  | {
      ok: true;
      value: {
        supplierId: string;
        orderedOn: Date | null;
        expectedOn: Date | null;
        freightCents: number;
        dutyCents: number;
        supplierReference: string | null;
        note: string | null;
        lines: { productCode: string; quantity: string; lineCostCents: number }[];
      };
    }
  | { ok: false; errors: string[]; violations: Violation[] };

function parseDay(value: string | null | undefined): Date | null | 'bad' {
  const v = (value ?? '').trim();
  if (!v) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return 'bad';
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? 'bad' : d;
}

export function validatePurchaseOrder(raw: PoInput): PoValidation {
  const errors: string[] = [];
  const violations: Violation[] = [];
  const supplierId = (raw.supplierId ?? '').trim();
  if (!/^sup_[a-f0-9]{8,32}$/.test(supplierId)) errors.push('Choose a supplier.');
  const orderedOn = parseDay(raw.orderedOn);
  const expectedOn = parseDay(raw.expectedOn);
  if (orderedOn === 'bad') errors.push('Order date is not a real date.');
  if (expectedOn === 'bad') errors.push('Expected date is not a real date.');
  if (orderedOn instanceof Date && expectedOn instanceof Date && expectedOn < orderedOn) errors.push('Expected date is before the order date.');
  const money = (v: string | null | undefined): number | null => {
    if (!v?.trim()) return 0;
    const c = parseCostCents(v);
    return c === null || Number.isNaN(c) ? null : c;
  };
  const freightCents = money(raw.freight);
  const dutyCents = money(raw.duty);
  if (freightCents === null) errors.push('Freight must be a dollar amount, e.g. 120.00.');
  if (dutyCents === null) errors.push('Duty must be a dollar amount, e.g. 45.00.');
  const supplierReference = (raw.supplierReference ?? '').trim().slice(0, 120) || null;
  const note = (raw.note ?? '').trim().slice(0, 1000) || null;
  violations.push(...scanText('note', note ?? ''));
  const lines: { productCode: string; quantity: string; lineCostCents: number }[] = [];
  raw.lines.forEach((l, i) => {
    const productCode = (l.productCode ?? '').trim().toUpperCase();
    const quantityText = (l.quantity ?? '').trim();
    const costText = (l.lineCost ?? '').trim();
    if (!productCode && !quantityText && !costText) return; // blank row
    if (!/^NPL-\d{3,4}$/.test(productCode)) errors.push(`Line ${i + 1}: choose a catalog product.`);
    const q = parseQuantity(quantityText);
    if (!q || q.amount <= 0) errors.push(`Line ${i + 1}: quantity must be a number with a unit, e.g. "25 g" or "40 vials".`);
    else if (finerThanMicrogram(q.amount, q.unit)) errors.push(`Line ${i + 1}: quantity is finer than a microgram.`);
    const parsedCost = parseCostCents(costText);
    const lineCostCents = parsedCost === null || Number.isNaN(parsedCost) ? null : parsedCost;
    if (lineCostCents === null) errors.push(`Line ${i + 1}: line cost must be a dollar amount.`);
    if (q && lineCostCents !== null) lines.push({ productCode, quantity: normalizeQuantity(q.amount, q.unit), lineCostCents });
  });
  if (lines.length === 0) errors.push('Add at least one line.');
  if (errors.length || violations.length) return { ok: false, errors, violations };
  return {
    ok: true,
    value: {
      supplierId,
      orderedOn: orderedOn instanceof Date ? orderedOn : null,
      expectedOn: expectedOn instanceof Date ? expectedOn : null,
      freightCents: freightCents ?? 0,
      dutyCents: dutyCents ?? 0,
      supplierReference,
      note,
      lines,
    },
  };
}

/**
 * Landed cost of a purchase-order line: its material cost plus its share of
 * the order's freight and duty, allocated by line cost. Exact-sum: rounding
 * remainders go to the largest line.
 */
export function landedCostByLine(lines: { id: string; lineCostCents: number }[], freightCents: number, dutyCents: number): Map<string, number> {
  const out = new Map<string, number>();
  const extra = freightCents + dutyCents;
  const total = lines.reduce((acc, l) => acc + l.lineCostCents, 0);
  let allocated = 0;
  let largest: { id: string; lineCostCents: number } | null = null;
  for (const l of lines) {
    const share = total > 0 ? Math.floor((extra * l.lineCostCents) / total) : Math.floor(extra / Math.max(lines.length, 1));
    out.set(l.id, l.lineCostCents + share);
    allocated += share;
    if (!largest || l.lineCostCents > largest.lineCostCents) largest = l;
  }
  if (largest && allocated !== extra) out.set(largest.id, (out.get(largest.id) ?? 0) + (extra - allocated));
  return out;
}

/** PO-YYMMDD-NNNN, mirroring order numbers. */
export function formatPoNumber(day: Date, sequence: number): string {
  const yymmdd = day.toISOString().slice(2, 10).replace(/-/g, '');
  return `PO-${yymmdd}-${String(sequence).padStart(4, '0')}`;
}

export function poNumberFromParam(value: string): string | null {
  const v = value.trim().toUpperCase();
  return /^PO-\d{6}-\d{4}$/.test(v) ? v : null;
}
