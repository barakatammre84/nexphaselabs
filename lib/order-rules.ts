/**
 * Pure order rules: quantities, totals, status transitions, order numbers.
 * No database, no framework.
 */

export const MAX_LINE_QUANTITY = 50;
export const MAX_CART_LINES = 20;

export const ORDER_STATUSES = [
  'submitted',
  'awaiting_payment',
  'paid',
  'fulfilling',
  'shipped',
  'cancelled',
] as const;
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
export const ORDER_TRANSITIONS: Record<
  OrderStatus,
  { to: OrderStatus; by: 'staff' | 'customer' | 'system' }[]
> = {
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

export function canTransition(
  from: string,
  to: OrderStatus,
  by: 'staff' | 'customer' | 'system',
): boolean {
  return (ORDER_TRANSITIONS[from as OrderStatus] ?? []).some(
    (t) => t.to === to && t.by === by,
  );
}

export function parseQuantityInput(
  value: string | null | undefined,
): number | null {
  const n = Number((value ?? '').trim());
  if (!Number.isInteger(n) || n < 0 || n > MAX_LINE_QUANTITY) return null;
  return n;
}

export type PricedLine = { unitPriceCents: number; quantity: number };

export function lineTotal(line: PricedLine): number {
  return line.unitPriceCents * line.quantity;
}

export function orderTotals(
  lines: PricedLine[],
  shippingCents = 0,
  taxCents = 0,
  discountCents = 0,
): {
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
} {
  const subtotalCents = lines.reduce((sum, l) => sum + lineTotal(l), 0);
  // A promo code comes off the materials subtotal before shipping and tax are added.
  const discount = Math.min(Math.max(0, discountCents), subtotalCents);
  return {
    subtotalCents,
    discountCents: discount,
    shippingCents,
    taxCents,
    totalCents: subtotalCents - discount + shippingCents + taxCents,
  };
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

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  unpaid: 'Unpaid',
  pending: 'Payment pending',
  paid: 'Paid',
  failed: 'Payment failed',
  refund_due: 'Refund due',
  refunded: 'Refunded',
};

/** Whether a refund can be recorded: money is owed back and not all of it has been sent yet. */
export function refundAllowed(order: {
  paymentStatus: string;
  refundDueCents: number | null;
  refundCents: number | null;
  totalCents: number;
}): boolean {
  return (
    order.paymentStatus === 'refund_due' &&
    (order.refundCents ?? 0) < refundDue(order)
  );
}

/** Amount owed back; falls back to the order total for orders that predate the column. */
export function refundDue(order: {
  refundDueCents: number | null;
  totalCents: number;
}): number {
  return order.refundDueCents ?? order.totalCents;
}

/** Whether a return can be received: the order shipped and nothing has been received back yet. */
export function returnAllowed(order: {
  status: string;
  returnedAt: Date | null;
}): boolean {
  return order.status === 'shipped' && !order.returnedAt;
}

export type RefundInput = { amount: string; reference: string };
export type RefundValidation =
  | { ok: true; amountCents: number; reference: string }
  | { ok: false; error: string };

/** Amount in dollars as typed, up to what is still owed; a reference is required because money moved outside this system. */
export function validateRefund(
  raw: RefundInput,
  remainingDueCents: number,
): RefundValidation {
  const totalCents = remainingDueCents;
  const reference = (raw.reference ?? '').trim().slice(0, 120);
  if (!reference)
    return {
      ok: false,
      error: 'Enter the bank or provider reference for the refund.',
    };
  const text = (raw.amount ?? '').trim().replace(/^\$/, '');
  if (!/^\d+(?:\.\d{1,2})?$/.test(text))
    return {
      ok: false,
      error: 'Enter the refunded amount in dollars, e.g. 90.00.',
    };
  const amountCents = Math.round(Number(text) * 100);
  if (amountCents <= 0)
    return { ok: false, error: 'The refunded amount must be more than zero.' };
  if (amountCents > totalCents)
    return {
      ok: false,
      error: `The refund cannot exceed the $${(totalCents / 100).toFixed(2)} still owed.`,
    };
  return { ok: true, amountCents, reference };
}

/* ------------------------------------------------------------------------ */
/* Returns                                                                   */
/* ------------------------------------------------------------------------ */

export type ReturnLine = {
  id: string;
  sku: string;
  quantity: number;
  lotId: string | null;
  unitPriceCents: number;
};
export type ReturnRaw = {
  packs: Record<string, number>;
  receivedOn: string;
  condition: string;
  note: string;
};
export type ReturnValidation =
  | {
      ok: true;
      lines: { itemId: string; packs: number }[];
      receivedOn: Date;
      condition: string;
      note: string;
      refundDueCents: number;
    }
  | { ok: false; error: string };

/** Pure validation of a return: a real calendar date not before the shipment, packs within what shipped, a condition. */
export function validateReturn(
  items: ReturnLine[],
  raw: ReturnRaw,
  shippedAt: Date | null,
  now = new Date(),
): ReturnValidation {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw.receivedOn))
    return { ok: false, error: 'Received date must be YYYY-MM-DD.' };
  const receivedOn = new Date(`${raw.receivedOn}T00:00:00Z`);
  // JS rolls 2026-02-30 into March; the round trip catches it.
  if (
    Number.isNaN(receivedOn.getTime()) ||
    receivedOn.toISOString().slice(0, 10) !== raw.receivedOn
  )
    return { ok: false, error: 'Received date is not a real date.' };
  if (raw.receivedOn > now.toISOString().slice(0, 10))
    return { ok: false, error: 'Received date cannot be in the future.' };
  if (shippedAt && raw.receivedOn < shippedAt.toISOString().slice(0, 10))
    return { ok: false, error: 'Received date is before the shipment.' };
  const condition = (raw.condition ?? '').trim().slice(0, 200);
  if (!condition)
    return {
      ok: false,
      error:
        'Describe the condition of the returned material (seal, label, storage).',
    };
  const lines: { itemId: string; packs: number }[] = [];
  let refundDueCents = 0;
  for (const it of items) {
    const packs = Number(raw.packs[it.id] ?? 0);
    if (packs === 0) continue;
    if (!Number.isInteger(packs) || packs < 0)
      return {
        ok: false,
        error: `${it.sku}: packs returned must be a whole number.`,
      };
    if (packs > it.quantity)
      return {
        ok: false,
        error: `${it.sku}: returned packs cannot exceed the ${it.quantity} shipped.`,
      };
    if (!it.lotId)
      return {
        ok: false,
        error: `${it.sku} has no lot recorded; the shipment record is incomplete.`,
      };
    lines.push({ itemId: it.id, packs });
    refundDueCents += packs * it.unitPriceCents;
  }
  if (lines.length === 0)
    return {
      ok: false,
      error: 'Enter how many packs came back on at least one line.',
    };
  return {
    ok: true,
    lines,
    receivedOn,
    condition,
    note: (raw.note ?? '').trim().slice(0, 300),
    refundDueCents,
  };
}
