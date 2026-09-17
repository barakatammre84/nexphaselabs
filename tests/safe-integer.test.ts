import { describe, expect, it } from 'vitest';
import { roundedRatio, safeAdd, safeMultiply } from '@/lib/safe-integer';

describe('safe count and cents arithmetic', () => {
  it('rejects unsafe inputs and results rather than clamping', () => {
    const max = Number.MAX_SAFE_INTEGER;
    expect(safeAdd(max - 1, 1)).toBe(max);
    expect(() => safeAdd(max, 1)).toThrow(RangeError);
    expect(() => safeMultiply(max, 2)).toThrow(RangeError);
    expect(() => safeMultiply(max + 1, 0)).toThrow(RangeError);
    expect(() => safeAdd(-1, 2)).toThrow(RangeError);
    expect(() => roundedRatio(1, 1, 0)).toThrow(RangeError);
    expect(() => roundedRatio(max, 2, 1)).toThrow(RangeError);
  });
  it('rounds ratios half-up even when the intermediate product exceeds safe integers', () => {
    const max = Number.MAX_SAFE_INTEGER;
    expect(roundedRatio(max, 100, 100)).toBe(max);
    expect(roundedRatio(101, 50, 100)).toBe(51);
    expect(roundedRatio(max, 825, 10_000)).toBe(Number((BigInt(max) * BigInt(825) + BigInt(5000)) / BigInt(10000)));
  });
});