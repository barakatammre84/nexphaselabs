import { describe, expect, it } from 'vitest';
import { adjustQuantity, compareQuantities, quantitiesComparable, quantityRatio, receiptCostCents } from '@/lib/procurement-quantities';

describe('procurement quantities', () => {
  it('compares mass and count quantities', () => {
    expect(compareQuantities('25 g', '25 g')).toBe(0);
    expect(compareQuantities('30 g', '25 g')).toBe(1);
    expect(compareQuantities('24 g', '25 g')).toBe(-1);
    expect(compareQuantities('25000 mg', '25 g')).toBe(0);
    expect(compareQuantities('40 vials', '40 vials')).toBe(0);
    expect(compareQuantities('40 vials', '25 g')).toBe(-1);
  });
  it('pro-rates by received share of ordered', () => {
    expect(quantityRatio('5 g', '10 g')).toBe(0.5);
    expect(quantityRatio('10 g', '10 g')).toBe(1);
    expect(quantityRatio('12 g', '10 g')).toBe(1);
    expect(quantityRatio('20 vials', '40 vials')).toBe(0.5);
    expect(quantityRatio('20 vials', '10 g')).toBe(1);
  });

  it('treats 1.005 g and 1005 mg as equal', () => {
    expect(compareQuantities('1.005 g', '1005 mg')).toBe(0);
    expect(quantitiesComparable('5 g', '10 mg')).toBe(true);
    expect(quantitiesComparable('5 vials', '10 g')).toBe(false);
    expect(quantitiesComparable('5 vials', '5 vials')).toBe(true);
  });
  it('conserves a line\'s landed cost across receipts', () => {
    // 25 g ordered at 129930; 20 g then 10 g (over-shipment)
    const first = receiptCostCents(129930, 0, 0.8, false);
    const second = receiptCostCents(129930, first, 1, true);
    expect(first + second).toBe(129930);
    // two half receipts with rounding
    const a = receiptCostCents(100001, 0, 0.5, false);
    const b = receiptCostCents(100001, a, 0.5, true);
    expect(a + b).toBe(100001);
    // an early receipt can never exceed what remains
    expect(receiptCostCents(1000, 900, 0.5, false)).toBe(100);
  });

  it('adjusts a line total when a receipt is corrected', () => {
    expect(adjustQuantity('10 g', '10 g', '5 g')).toBe('5 g');
    expect(adjustQuantity('25 g', '10 g', '10.5 g')).toBe('25.5 g');
    expect(adjustQuantity('1000.1 mg', '100 mg', '50 mg')).toBe('950.1 mg');
    expect(adjustQuantity(null, '5 g', '7 g')).toBe('7 g');
    expect(adjustQuantity('40 vials', '10 vials', '8 vials')).toBe('38 vials');
    expect(adjustQuantity('10 g', '10 g', '5 vials')).toBeNull();
    expect(adjustQuantity('5 g', '10 g', '1 g')).toBeNull();
  });
});
