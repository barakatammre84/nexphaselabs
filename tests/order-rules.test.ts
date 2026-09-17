import { describe, expect, it } from 'vitest';
import {
  canTransition,
  formatOrderNumber,
  lineTotal,
  orderNumberFromParam,
  orderTotals,
  parseQuantityInput,
} from '@/lib/order-rules';

describe('order rules', () => {
  it('parses safe whole quantities without an arbitrary unit cap', () => {
    expect(parseQuantityInput('3')).toBe(3);
    expect(parseQuantityInput('0')).toBe(0);
    expect(parseQuantityInput('51')).toBe(51);
    expect(parseQuantityInput('1000')).toBe(1000);
    expect(parseQuantityInput(String(Number.MAX_SAFE_INTEGER))).toBe(Number.MAX_SAFE_INTEGER);
    expect(parseQuantityInput('9007199254740992')).toBeNull();
    expect(parseQuantityInput('')).toBeNull();
    expect(parseQuantityInput(undefined)).toBeNull();
    expect(parseQuantityInput('-1')).toBeNull();
    expect(parseQuantityInput('2.5')).toBeNull();
    expect(parseQuantityInput('x')).toBeNull();
  });
  it('rejects unsafe quantities, prices, line products and aggregate amounts', () => {
    const max = Number.MAX_SAFE_INTEGER;
    for (const quantity of [0, -1, 1.5, Infinity, NaN, max + 1])
      expect(() => lineTotal({ unitPriceCents: 1, quantity })).toThrow(RangeError);
    for (const unitPriceCents of [-1, 1.5, Infinity, NaN, max + 1])
      expect(() => lineTotal({ unitPriceCents, quantity: 1 })).toThrow(RangeError);
    expect(lineTotal({ unitPriceCents: 100, quantity: 51 })).toBe(5100);
    expect(() => lineTotal({ unitPriceCents: max, quantity: 2 })).toThrow(RangeError);
    const lines = [{ unitPriceCents: max, quantity: 1 }];
    expect(() => orderTotals([...lines, { unitPriceCents: 1, quantity: 1 }])).toThrow(RangeError);
    expect(() => orderTotals(lines, 1)).toThrow(RangeError);
    expect(() => orderTotals(lines, 0, 1)).toThrow(RangeError);
    for (const bad of [-1, 0.1, NaN, Infinity, max + 1]) {
      expect(() => orderTotals(lines, bad)).toThrow(RangeError);
      expect(() => orderTotals(lines, 0, bad)).toThrow(RangeError);
      expect(() => orderTotals(lines, 0, 0, bad)).toThrow(RangeError);
    }
    expect(orderTotals(lines, 1, 0, 1).totalCents).toBe(max);
    expect(() => orderTotals([{ unitPriceCents: 1, quantity: 1 }], 0, 0, 2)).toThrow(RangeError);
  });
  it('totals lines in cents', () => {
    expect(
      orderTotals(
        [
          { unitPriceCents: 4500, quantity: 2 },
          { unitPriceCents: 8000, quantity: 1 },
        ],
        500,
        100,
      ),
    ).toEqual({
      subtotalCents: 17000,
      discountCents: 0, shippingCents: 500,
      taxCents: 100,
      totalCents: 17600,
    });
  });
  it('formats and parses order numbers', () => {
    expect(formatOrderNumber(new Date('2026-09-02T23:59:00Z'), 7)).toBe(
      'NX-260902-0007',
    );
    expect(orderNumberFromParam('nx-260902-0007')).toBe('NX-260902-0007');
    expect(orderNumberFromParam('NX-1')).toBeNull();
    expect(orderNumberFromParam('%E0%A4%A')).toBeNull();
  });
  it('enforces who can move an order where', () => {
    expect(canTransition('submitted', 'awaiting_payment', 'system')).toBe(true);
    expect(canTransition('submitted', 'paid', 'customer')).toBe(false);
    expect(canTransition('awaiting_payment', 'cancelled', 'customer')).toBe(
      true,
    );
    expect(canTransition('paid', 'cancelled', 'customer')).toBe(false);
    expect(canTransition('paid', 'fulfilling', 'staff')).toBe(true);
    expect(canTransition('shipped', 'cancelled', 'staff')).toBe(false);
    expect(canTransition('nonsense', 'paid', 'staff')).toBe(false);
  });
});
