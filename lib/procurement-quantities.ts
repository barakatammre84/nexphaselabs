import { isMassUnit } from '@/lib/lot-quantities';
import { parseQuantity } from '@/lib/lot-rules';

/** Pure quantity comparisons for purchase-order lines (no database import). */

const TO_UG: Record<string, number> = { ug: 1, mg: 1e3, g: 1e6, kg: 1e9 };

/** Sign of a − b for comparable quantities; −1 when they cannot be compared (never treated as complete). */
export function compareQuantities(a: string, b: string): number {
  const pa = parseQuantity(a);
  const pb = parseQuantity(b);
  if (!pa || !pb) return -1;
  // Whole micrograms, as lot-quantities does, so 1.005 g equals 1005 mg.
  if (isMassUnit(pa.unit) && isMassUnit(pb.unit)) return Math.sign(Math.round(pa.amount * TO_UG[pa.unit]) - Math.round(pb.amount * TO_UG[pb.unit]));
  if (pa.unit === pb.unit) return Math.sign(pa.amount - pb.amount);
  return -1;
}

/** Whether two quantities can be compared at all (both mass, or the same count unit). */
export function quantitiesComparable(a: string, b: string): boolean {
  const pa = parseQuantity(a);
  const pb = parseQuantity(b);
  if (!pa || !pb) return false;
  return (isMassUnit(pa.unit) && isMassUnit(pb.unit)) || pa.unit === pb.unit;
}

/**
 * Landed cost carried by one receipt against a purchase-order line. The
 * line's landed cost is conserved: the closing receipt takes whatever is
 * still unallocated, an earlier receipt takes its share but never more than
 * what remains, so the sum over the line's lots equals the line's cost.
 */
export function receiptCostCents(landedCents: number, allocatedCents: number, share: number, closesLine: boolean): number {
  const remaining = Math.max(0, landedCents - allocatedCents);
  if (closesLine) return remaining;
  return Math.min(Math.round(landedCents * share), remaining);
}

/** received ÷ ordered as a fraction capped at 1 (1 when they cannot be compared), for pro-rating a line's landed cost over several lots. */
export function quantityRatio(received: string, ordered: string): number {
  const pa = parseQuantity(received);
  const pb = parseQuantity(ordered);
  if (!pa || !pb || pb.amount <= 0) return 1;
  if (isMassUnit(pa.unit) && isMassUnit(pb.unit)) return Math.min(1, Math.round(pa.amount * TO_UG[pa.unit]) / Math.round(pb.amount * TO_UG[pb.unit]));
  if (pa.unit === pb.unit) return Math.min(1, pa.amount / pb.amount);
  return 1;
}
