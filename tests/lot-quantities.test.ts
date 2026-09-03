import { describe, expect, it } from 'vitest';
import { pickFromLot, sumQuantities } from '@/lib/lot-quantities';

describe('pickFromLot', () => {
  it('takes packs × pack mass from a mass-tracked lot in the lot unit', () => {
    expect(pickFromLot('10 g', '5 mg', 3)).toEqual({ ok: true, shipped: '0.015 g', remaining: '9.985 g' });
    expect(pickFromLot('100 mg', '25 mg', 4)).toEqual({ ok: true, shipped: '100 mg', remaining: '0 mg' });
    expect(pickFromLot('1 kg', '1 g', 2)).toEqual({ ok: true, shipped: '0.002 kg', remaining: '0.998 kg' });
  });
  it('refuses more than is on hand', () => {
    expect(pickFromLot('100 mg', '25 mg', 5).ok).toBe(false);
    expect(pickFromLot('0 mg', '5 mg', 1).ok).toBe(false);
    expect(pickFromLot(null, '5 mg', 1).ok).toBe(false);
  });
  it('treats count-tracked lots as one container per pack', () => {
    expect(pickFromLot('40 vials', '5 mg', 3)).toEqual({ ok: true, shipped: '3 vials', remaining: '37 vials' });
    expect(pickFromLot('2 vials', '5 mg', 3).ok).toBe(false);
  });
  it('rejects bad pack counts and non-mass pack sizes', () => {
    expect(pickFromLot('10 g', '5 mg', 0).ok).toBe(false);
    expect(pickFromLot('10 g', '5 mL', 1).ok).toBe(false);
  });
});

describe('resolution', () => {
  it('steps the unit down instead of rounding a small pick to zero', () => {
    expect(pickFromLot('1 kg', '5 mg', 10)).toEqual({ ok: true, shipped: '0.05 g', remaining: '999.95 g' });
    expect(pickFromLot('25 g', '100 ug', 1)).toEqual({ ok: true, shipped: '0.1 mg', remaining: '24999.9 mg' });
    expect(pickFromLot('1 kg', '1 ug', 1)).toEqual({ ok: true, shipped: '0.001 mg', remaining: '999999.999 mg' });
    expect(pickFromLot('5 ug', '1 ug', 2)).toEqual({ ok: true, shipped: '2 ug', remaining: '3 ug' });
  });
  it('never reports a zero shipment for a positive pick', () => {
    for (const [lot, pack] of [['1 kg', '5 mg'], ['10 g', '250 ug'], ['500 mg', '1 ug']] as const) {
      const r = pickFromLot(lot, pack, 1);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.shipped.startsWith('0 ')).toBe(false);
    }
  });
  it('drains a lot exactly to zero after repeated picks', () => {
    let remaining: string | null = '1 g';
    for (let i = 0; i < 200; i++) {
      const r = pickFromLot(remaining, '5 mg', 1);
      expect(r.ok).toBe(true);
      if (r.ok) remaining = r.remaining;
    }
    expect(remaining).toBe('0 g');
    expect(pickFromLot(remaining, '5 mg', 1).ok).toBe(false);
  });
});

describe('micrograms', () => {
  it('handles µg pack sizes and lots', () => {
    expect(pickFromLot('10 mg', '500 ug', 4)).toEqual({ ok: true, shipped: '2 mg', remaining: '8 mg' });
    expect(pickFromLot('1 mg', '500 µg', 2)).toEqual({ ok: true, shipped: '1 mg', remaining: '0 mg' });
    expect(pickFromLot('2000 ug', '1 mg', 1)).toEqual({ ok: true, shipped: '1000 ug', remaining: '1000 ug' });
  });
});

describe('sumQuantities', () => {
  it('sums picks from one lot across units exactly', () => {
    expect(sumQuantities(['0.001 kg', '0.025 g'])).toBe('1.025 g');
    expect(sumQuantities(['5 mg', '5 mg'])).toBe('10 mg');
    expect(sumQuantities(['500 ug', '500 ug'])).toBe('1000 ug');
    expect(sumQuantities(['3 vials', '2 vials'])).toBe('5 vials');
  });
  it('records the whole shipment when two lines draw on one kg-tracked lot', () => {
    const a = pickFromLot('1 kg', '100 mg', 10);
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    const b = pickFromLot(a.remaining, '25 mg', 1);
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    expect(sumQuantities([a.shipped, b.shipped])).toBe('1.025 g');
    expect(b.remaining).toBe('998.975 g');
  });
  it('refuses to reconcile mixed count units or garbage', () => {
    expect(sumQuantities(['3 vials', '2 units'])).toBeNull();
    expect(sumQuantities(['3 vials', '5 mg'])).toBeNull();
    expect(sumQuantities(['abc'])).toBeNull();
    expect(sumQuantities([])).toBeNull();
  });
});
