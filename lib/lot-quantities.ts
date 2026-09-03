import { formatQuantity, parseQuantity, type QuantityUnit } from '@/lib/lot-rules';

/**
 * Quantity arithmetic for picking. Lots are tracked either by mass (mg, g,
 * kg) or by count (vials, units). A pack size is always a mass ("5 mg").
 *
 *  - mass-tracked lot:  shipped = packs × pack mass, expressed in the lot's unit
 *  - count-tracked lot: shipped = packs (one container per pack)
 */

const TO_MG: Record<string, number> = { ug: 0.001, mg: 1, g: 1000, kg: 1_000_000 };

export function isMassUnit(unit: QuantityUnit): boolean {
  return unit in TO_MG;
}

function toMg(amount: number, unit: string): number {
  return amount * (TO_MG[unit] ?? Number.NaN);
}

export type PickResult =
  | { ok: true; shipped: string; remaining: string }
  | { ok: false; error: string };

/** Compute what a shipment of `packs` packs of `packSize` takes from a lot with `remaining` on hand. */
export function pickFromLot(remaining: string | null, packSize: string, packs: number): PickResult {
  const have = remaining ? parseQuantity(remaining) : null;
  if (!have) return { ok: false, error: 'The lot has no usable quantity on hand.' };
  if (!Number.isInteger(packs) || packs < 1) return { ok: false, error: 'Packs must be a whole number of at least 1.' };

  if (isMassUnit(have.unit)) {
    const pack = parseQuantity(packSize.replace('µg', 'ug'));
    if (!pack || !isMassUnit(pack.unit)) return { ok: false, error: `Pack size "${packSize}" is not a mass.` };
    const neededMg = toMg(pack.amount, pack.unit) * packs;
    const haveMg = toMg(have.amount, have.unit);
    if (neededMg > haveMg + 1e-9) {
      return { ok: false, error: `Lot has ${formatQuantity(have.amount, have.unit)}; ${packs} × ${packSize} needs more than that.` };
    }
    const remainingMg = haveMg - neededMg;
    const factor = TO_MG[have.unit];
    return {
      ok: true,
      shipped: formatQuantity(round(neededMg / factor), have.unit),
      remaining: formatQuantity(round(remainingMg / factor), have.unit),
    };
  }
  // Count-tracked lot: one container per pack.
  if (packs > have.amount) return { ok: false, error: `Lot has ${formatQuantity(have.amount, have.unit)}; ${packs} packs needed.` };
  return { ok: true, shipped: formatQuantity(packs, have.unit), remaining: formatQuantity(have.amount - packs, have.unit) };
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
