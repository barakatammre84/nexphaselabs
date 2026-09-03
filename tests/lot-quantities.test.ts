import { describe, expect, it } from 'vitest';
import { pickFromLot } from '@/lib/lot-quantities';

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

describe('micrograms', () => {
  it('handles µg pack sizes and lots', () => {
    expect(pickFromLot('10 mg', '500 ug', 4)).toEqual({ ok: true, shipped: '2 mg', remaining: '8 mg' });
    expect(pickFromLot('1 mg', '500 µg', 2)).toEqual({ ok: true, shipped: '1 mg', remaining: '0 mg' });
    expect(pickFromLot('2000 ug', '1 mg', 1)).toEqual({ ok: true, shipped: '1000 ug', remaining: '1000 ug' });
  });
});
