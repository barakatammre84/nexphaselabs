import { describe, expect, it } from 'vitest';
import { canTransition, formatOrderNumber, orderNumberFromParam, orderTotals, parseQuantityInput } from '@/lib/order-rules';

describe('order rules', () => {
  it('parses quantities within bounds', () => {
    expect(parseQuantityInput('3')).toBe(3);
    expect(parseQuantityInput('0')).toBe(0);
    expect(parseQuantityInput('51')).toBeNull();
    expect(parseQuantityInput('-1')).toBeNull();
    expect(parseQuantityInput('2.5')).toBeNull();
    expect(parseQuantityInput('x')).toBeNull();
  });
  it('totals lines in cents', () => {
    expect(orderTotals([{ unitPriceCents: 4500, quantity: 2 }, { unitPriceCents: 8000, quantity: 1 }], 0)).toEqual({ subtotalCents: 17000, shippingCents: 0, totalCents: 17000 });
  });
  it('formats and parses order numbers', () => {
    expect(formatOrderNumber(new Date('2026-09-02T23:59:00Z'), 7)).toBe('NX-260902-0007');
    expect(orderNumberFromParam('nx-260902-0007')).toBe('NX-260902-0007');
    expect(orderNumberFromParam('NX-1')).toBeNull();
    expect(orderNumberFromParam('%E0%A4%A')).toBeNull();
  });
  it('enforces who can move an order where', () => {
    expect(canTransition('submitted', 'awaiting_payment', 'system')).toBe(true);
    expect(canTransition('submitted', 'paid', 'customer')).toBe(false);
    expect(canTransition('awaiting_payment', 'cancelled', 'customer')).toBe(true);
    expect(canTransition('paid', 'cancelled', 'customer')).toBe(false);
    expect(canTransition('paid', 'fulfilling', 'staff')).toBe(true);
    expect(canTransition('shipped', 'cancelled', 'staff')).toBe(false);
    expect(canTransition('nonsense', 'paid', 'staff')).toBe(false);
  });
});
