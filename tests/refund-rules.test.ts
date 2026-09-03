import { describe, expect, it } from 'vitest';
import { refundAllowed, refundDue, returnAllowed, validateRefund, validateReturn } from '@/lib/order-rules';

describe('refund and return gates', () => {
  it('allows a refund while something is still owed', () => {
    expect(refundAllowed({ paymentStatus: 'refund_due', refundDueCents: 4500, refundCents: null, totalCents: 9000 })).toBe(true);
    expect(refundAllowed({ paymentStatus: 'refund_due', refundDueCents: 4500, refundCents: 2000, totalCents: 9000 })).toBe(true);
    expect(refundAllowed({ paymentStatus: 'refund_due', refundDueCents: 4500, refundCents: 4500, totalCents: 9000 })).toBe(false);
    expect(refundAllowed({ paymentStatus: 'refunded', refundDueCents: 4500, refundCents: 4500, totalCents: 9000 })).toBe(false);
    expect(refundAllowed({ paymentStatus: 'paid', refundDueCents: null, refundCents: null, totalCents: 9000 })).toBe(false);
    expect(refundDue({ refundDueCents: null, totalCents: 9000 })).toBe(9000);
  });
  it('allows a return only for a shipped order not yet returned', () => {
    expect(returnAllowed({ status: 'shipped', returnedAt: null })).toBe(true);
    expect(returnAllowed({ status: 'shipped', returnedAt: new Date() })).toBe(false);
    expect(returnAllowed({ status: 'paid', returnedAt: null })).toBe(false);
  });
});

describe('validateRefund', () => {
  it('parses dollars, requires a reference, caps at the total', () => {
    expect(validateRefund({ amount: '90.00', reference: 'RF-1' }, 9000)).toEqual({ ok: true, amountCents: 9000, reference: 'RF-1' });
    expect(validateRefund({ amount: '$45.5', reference: 'RF-1' }, 9000)).toEqual({ ok: true, amountCents: 4550, reference: 'RF-1' });
    expect(validateRefund({ amount: '90.01', reference: 'RF-1' }, 9000).ok).toBe(false);
    expect(validateRefund({ amount: '45.00', reference: 'RF-1' }, 4500).ok).toBe(true);
    expect(validateRefund({ amount: '45.01', reference: 'RF-1' }, 4500).ok).toBe(false);
    expect(validateRefund({ amount: '0', reference: 'RF-1' }, 9000).ok).toBe(false);
    expect(validateRefund({ amount: 'ninety', reference: 'RF-1' }, 9000).ok).toBe(false);
    expect(validateRefund({ amount: '90', reference: '  ' }, 9000).ok).toBe(false);
  });
});

describe('validateReturn', () => {
  const items = [
    { id: 'a', sku: 'NPL-001-5MG', quantity: 2, lotId: 'lot_x', unitPriceCents: 4500 },
    { id: 'b', sku: 'NPL-002-100MG', quantity: 1, lotId: 'lot_y', unitPriceCents: 6000 },
  ];
  const shipped = new Date('2026-09-01T00:00:00Z');
  const now = new Date('2026-09-03T12:00:00Z');
  it('accepts a partial return and prices what is owed', () => {
    const r = validateReturn(items, { packs: { a: 1 }, receivedOn: '2026-09-03', condition: 'Sealed', note: '' }, shipped, now);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.lines).toEqual([{ itemId: 'a', packs: 1 }]);
      expect(r.refundDueCents).toBe(4500);
      expect(r.receivedOn.toISOString().slice(0, 10)).toBe('2026-09-03');
    }
  });
  it('refuses a rolled-over calendar date, future dates and dates before shipment', () => {
    expect(validateReturn(items, { packs: { a: 1 }, receivedOn: '2026-02-30', condition: 'Sealed', note: '' }, shipped, now).ok).toBe(false);
    expect(validateReturn(items, { packs: { a: 1 }, receivedOn: '2026-09-10', condition: 'Sealed', note: '' }, shipped, now).ok).toBe(false);
    expect(validateReturn(items, { packs: { a: 1 }, receivedOn: '2026-08-20', condition: 'Sealed', note: '' }, shipped, now).ok).toBe(false);
  });
  it('refuses too many packs, fractions, missing lots and empty returns', () => {
    expect(validateReturn(items, { packs: { a: 3 }, receivedOn: '2026-09-03', condition: 'Sealed', note: '' }, shipped, now).ok).toBe(false);
    expect(validateReturn(items, { packs: { a: 1.5 }, receivedOn: '2026-09-03', condition: 'Sealed', note: '' }, shipped, now).ok).toBe(false);
    expect(validateReturn([{ ...items[0], lotId: null }], { packs: { a: 1 }, receivedOn: '2026-09-03', condition: 'Sealed', note: '' }, shipped, now).ok).toBe(false);
    expect(validateReturn(items, { packs: {}, receivedOn: '2026-09-03', condition: 'Sealed', note: '' }, shipped, now).ok).toBe(false);
    expect(validateReturn(items, { packs: { a: 1 }, receivedOn: '2026-09-03', condition: ' ', note: '' }, shipped, now).ok).toBe(false);
  });
});
