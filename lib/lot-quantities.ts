import { formatQuantity, parseQuantity, type QuantityUnit } from '@/lib/lot-rules';

/**
 * Whether one pack of `packSize` can be picked from this lot: a mass-tracked lot
 * needs enough weight; a count-tracked lot needs a container and a labeled
 * container size equal to the pack. A count-tracked lot with no recorded
 * container size supplies nothing — it is unknown what is in the vial.
 */
export function lotSuppliesPack(lot: { quantityRemaining: string | null; containerSize?: string | null }, packSize: string): boolean {
  const have = lot.quantityRemaining ? parseQuantity(lot.quantityRemaining) : null;
  const pack = parseQuantity(packSize);
  if (!have || !pack || have.amount <= 0) return false;
  if (isMassUnit(have.unit)) return pickFromLot(lot.quantityRemaining, packSize, 1).ok;
  const container = lot.containerSize ? parseQuantity(lot.containerSize) : null;
  return Boolean(container && isMassUnit(container.unit) && isMassUnit(pack.unit) && toUg(container.amount, container.unit) === toUg(pack.amount, pack.unit));
}

/**
 * Quantity arithmetic for picking. Lots are tracked either by mass (µg, mg,
 * g, kg) or by count (vials, units). A pack size is always a mass ("5 mg").
 *
 *  - mass-tracked lot:  shipped = packs × pack mass
 *  - count-tracked lot: shipped = packs (one container per pack)
 *
 * Mass is computed in whole micrograms so nothing is lost to floating point,
 * and the result is expressed in the largest unit — no larger than the lot's
 * own — that states BOTH the shipped and the remaining quantity exactly to
 * three decimals. A 1 kg lot that ships 10 × 5 mg therefore reads
 * "0.05 g shipped, 999.95 g remaining", never "0 kg shipped, 1 kg remaining".
 */

const TO_UG: Record<string, number> = { ug: 1, mg: 1_000, g: 1_000_000, kg: 1_000_000_000 };
const MASS_UNITS_DESC: QuantityUnit[] = ['kg', 'g', 'mg', 'ug'];

export function isMassUnit(unit: QuantityUnit): boolean {
  return unit in TO_UG;
}

function toUg(amount: number, unit: string): number {
  return Math.round(amount * (TO_UG[unit] ?? Number.NaN));
}

/** Whether `ug` can be written in `unit` with at most three decimals. */
function exactIn(ug: number, unit: QuantityUnit): boolean {
  if (unit === 'ug') return true;
  return ug % (TO_UG[unit] / 1000) === 0;
}

/** Largest unit no larger than `preferred` in which every value is exact. */
function unitFor(values: number[], preferred: QuantityUnit): QuantityUnit {
  const start = MASS_UNITS_DESC.indexOf(preferred);
  for (let i = start; i < MASS_UNITS_DESC.length; i++) {
    const unit = MASS_UNITS_DESC[i];
    if (values.every((v) => exactIn(v, unit))) return unit;
  }
  return 'ug';
}

function express(ug: number, unit: QuantityUnit): string {
  return formatQuantity(ug / TO_UG[unit], unit);
}

/**
 * Sum quantities that all come from one lot. Mass parts are summed in whole
 * micrograms and expressed in the largest unit that states the total exactly;
 * count parts must share a unit. Returns null when the parts cannot be
 * reconciled — the caller must treat that as an error, never as "keep the
 * first one".
 */
export function sumQuantities(parts: string[]): string | null {
  const parsed = parts.map((p) => parseQuantity(p));
  if (parsed.length === 0 || parsed.some((q) => q === null)) return null;
  const qs = parsed as { amount: number; unit: QuantityUnit }[];
  if (qs.every((q) => isMassUnit(q.unit))) {
    const totalUg = qs.reduce((acc, q) => acc + toUg(q.amount, q.unit), 0);
    const largest = qs.reduce((best, q) => (TO_UG[q.unit] > TO_UG[best] ? q.unit : best), qs[0].unit);
    return express(totalUg, unitFor([totalUg], largest));
  }
  if (qs.every((q) => q.unit === qs[0].unit)) {
    return formatQuantity(qs.reduce((acc, q) => acc + q.amount, 0), qs[0].unit);
  }
  return null;
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
    const neededUg = toUg(pack.amount, pack.unit) * packs;
    if (neededUg < 1) return { ok: false, error: `Pack size "${packSize}" is below the microgram resolution of the ledger.` };
    const haveUg = toUg(have.amount, have.unit);
    if (neededUg > haveUg) {
      return { ok: false, error: `Lot has ${formatQuantity(have.amount, have.unit)}; ${packs} × ${packSize} needs more than that.` };
    }
    const remainingUg = haveUg - neededUg;
    const unit = unitFor([neededUg, remainingUg], have.unit);
    return { ok: true, shipped: express(neededUg, unit), remaining: express(remainingUg, unit) };
  }
  // Count-tracked lot: one container per pack.
  if (packs > have.amount) return { ok: false, error: `Lot has ${formatQuantity(have.amount, have.unit)}; ${packs} packs needed.` };
  return { ok: true, shipped: formatQuantity(packs, have.unit), remaining: formatQuantity(have.amount - packs, have.unit) };
}
