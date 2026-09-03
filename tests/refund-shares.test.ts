import { describe, expect, it } from 'vitest';
import { refundShares } from '@/lib/refund-shares';

const base = { orderId: 'o1', refundCents: 4500, returnedAt: new Date('2026-09-03T00:00:00Z') };
describe('refundShares', () => {
  it('charges a return only to the lines that came back', () => {
    const m = refundShares([
      { ...base, itemId: 'a', lineTotalCents: 4500, returnedPacks: 1, unitPriceCents: 4500 },
      { ...base, itemId: 'b', lineTotalCents: 4500, returnedPacks: null, unitPriceCents: 4500 },
    ]);
    expect(m.get('a')).toBe(4500);
    expect(m.get('b')).toBe(0);
  });
  it('splits pro rata on a cancellation and sums exactly', () => {
    const m = refundShares([
      { orderId: 'o2', refundCents: 10001, returnedAt: null, itemId: 'a', lineTotalCents: 3000, returnedPacks: null, unitPriceCents: 3000 },
      { orderId: 'o2', refundCents: 10001, returnedAt: null, itemId: 'b', lineTotalCents: 3000, returnedPacks: null, unitPriceCents: 3000 },
      { orderId: 'o2', refundCents: 10001, returnedAt: null, itemId: 'c', lineTotalCents: 4001, returnedPacks: null, unitPriceCents: 4001 },
    ]);
    expect((m.get('a') ?? 0) + (m.get('b') ?? 0) + (m.get('c') ?? 0)).toBe(10001);
    expect(m.get('c')).toBeGreaterThan(m.get('a') ?? 0);
  });
  it('falls back to pro rata when a return predates per-line records', () => {
    const m = refundShares([
      { ...base, itemId: 'a', lineTotalCents: 4500, returnedPacks: null, unitPriceCents: 4500 },
      { ...base, itemId: 'b', lineTotalCents: 4500, returnedPacks: null, unitPriceCents: 4500 },
    ]);
    expect((m.get('a') ?? 0) + (m.get('b') ?? 0)).toBe(4500);
  });
  it('ignores orders without a refund', () => {
    expect(refundShares([{ orderId: 'o3', refundCents: null, returnedAt: null, itemId: 'a', lineTotalCents: 100, returnedPacks: null, unitPriceCents: 100 }]).size).toBe(0);
  });
});
