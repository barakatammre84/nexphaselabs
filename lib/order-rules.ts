/**
 * Pure order rules: quantities, totals, status transitions, order numbers.
 * No database, no framework.
 */

export const MAX_LINE_QUANTITY = 50;
export const MAX_CART_LINES = 20;

export const ORDER_STATUSES = ['submitted', 'awaiting_payment', 'paid', 'fulfilling', 'shipped', 'cancelled'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  submitted: 'Submitted',
  awaiting_payment: 'Awaiting payment',
  paid: 'Paid',
  fulfilling: 'Being prepared',
  shipped: 'Shipped',
  cancelled: 'Cancelled',
};

/** Which statuses an order can move to, and who may move it. */
export const ORDER_TRANSITIONS: Record<OrderStatus, { to: OrderStatus; by: 'staff' | 'customer' | 'system' }[]> = {
  submitted: [
    { to: 'awaiting_payment', by: 'system' },
    { to: 'cancelled', by: 'customer' },
    { to: 'cancelled', by: 'staff' },
  ],
  awaiting_payment: [
    { to: 'paid', by: 'staff' },
    { to: 'paid', by: 'system' },
    { to: 'cancelled', by: 'customer' },
    { to: 'cancelled', by: 'staff' },
  ],
  paid: [
    { to: 'fulfilling', by: 'staff' },
    { to: 'cancelled', by: 'staff' },
  ],
  fulfilling: [
    { to: 'shipped', by: 'staff' },
    { to: 'cancelled', by: 'staff' },
  ],
  shipped: [],
  cancelled: [],
};

export function canTransition(from: string, to: OrderStatus, by: 'staff' | 'customer' | 'system'): boolean {
  return (ORDER_TRANSITIONS[from as OrderStatus] ?? []).some((t) => t.to === to && t.by === by);
}

export function parseQuantityInput(value: string | null | undefined): number | null {
  const n = Number((value ?? '').trim());
  if (!Number.isInteger(n) || n < 0 || n > MAX_LINE_QUANTITY) return null;
  return n;
}

export type PricedLine = { unitPriceCents: number; quantity: number };

export function lineTotal(line: PricedLine): number {
  return line.unitPriceCents * line.quantity;
}

export function orderTotals(lines: PricedLine[], shippingCents = 0): { subtotalCents: number; shippingCents: number; totalCents: number } {
  const subtotalCents = lines.reduce((sum, l) => sum + lineTotal(l), 0);
  return { subtotalCents, shippingCents, totalCents: subtotalCents + shippingCents };
}

/** NX-YYMMDD-NNNN */
export function formatOrderNumber(date: Date, sequence: number): string {
  const yy = String(date.getUTCFullYear()).slice(-2);
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `NX-${yy}${mm}${dd}-${String(sequence).padStart(4, '0')}`;
}

export const ORDER_NUMBER_PATTERN = /^NX-\d{6}-\d{4}$/;

export function orderNumberFromParam(value: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return null;
  }
  const n = decoded.trim().toUpperCase();
  return ORDER_NUMBER_PATTERN.test(n) ? n : null;
}
