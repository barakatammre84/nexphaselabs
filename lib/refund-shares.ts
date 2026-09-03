/** Pure refund allocation (no database import) so it is unit-testable. */
export type ShareInput = { orderId: string; itemId: string; refundCents: number | null; returnedAt: Date | null; lineTotalCents: number; returnedPacks: number | null; unitPriceCents: number };

/**
 * Allocate each order's recorded refund over its lines. After a return the
 * refund belongs to the lines that came back, in proportion to their returned
 * value; otherwise (a cancelled paid order) pro rata by line total. Rounding
 * remainders go to the largest weighted line so the shares sum exactly to the
 * refund.
 */
export function refundShares(lines: ShareInput[]): Map<string, number> {
  const out = new Map<string, number>();
  const byOrder = new Map<string, ShareInput[]>();
  for (const l of lines) byOrder.set(l.orderId, [...(byOrder.get(l.orderId) ?? []), l]);
  for (const group of byOrder.values()) {
    const refund = group[0].refundCents ?? 0;
    if (refund <= 0) continue;
    // By returned value when the return recorded which lines came back; otherwise (a cancellation, or a
    // return recorded before returned_packs existed) pro rata by line total.
    const returnedValue = group.reduce((acc, l) => acc + (l.returnedPacks ?? 0) * l.unitPriceCents, 0);
    const returned = group[0].returnedAt !== null && returnedValue > 0;
    const weight = (l: ShareInput) => (returned ? (l.returnedPacks ?? 0) * l.unitPriceCents : l.lineTotalCents);
    const total = group.reduce((acc, l) => acc + weight(l), 0);
    if (total <= 0) continue;
    let allocated = 0;
    let largest: ShareInput | null = null;
    for (const l of group) {
      const share = Math.floor((refund * weight(l)) / total);
      out.set(l.itemId, share);
      allocated += share;
      if (!largest || weight(l) > weight(largest)) largest = l;
    }
    if (largest && allocated !== refund) out.set(largest.itemId, (out.get(largest.itemId) ?? 0) + (refund - allocated));
  }
  return out;
}
