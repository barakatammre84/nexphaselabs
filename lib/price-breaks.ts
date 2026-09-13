/**
 * Volume pricing.
 *
 * Every competitor in this category prices by quantity — buy four, pay less
 * each. We had one price per pack size and no way to express that, which is a
 * commercial gap rather than a compliance one: a price ladder says nothing
 * about what a compound is for.
 *
 * Two rules this module exists to enforce:
 *
 *  1. **No price is invented here.** There are no default tiers, no percentage
 *     the code applies on its own, and nothing is seeded. A break exists only
 *     because an owner typed it into the catalog manager, exactly like the list
 *     price it sits beneath. With none entered, every product behaves as it
 *     does today and the ladder does not render.
 *  2. **A break may only go down.** A row priced at or above the list price is
 *     rejected rather than silently ignored, because a "discount" that raises
 *     the price is the kind of error that reaches a customer.
 *
 * Stored as JSON on the variant, the same way the catalog stores its other
 * structured values, and re-derived server-side in the order guard so a cart
 * cannot present a price the catalog does not agree with.
 */

export type PriceBreak = {
  /** Units of this pack size at which the break applies. Always 2 or more. */
  minQuantity: number;
  listPriceCents: number | null;
  institutionalPriceCents: number | null;
};

export const MAX_PRICE_BREAKS = 8;

export type PriceBreakIssue = string;

/** Parse the catalog-manager cell: "4:52.65, 6:49.14, 10:43.88" or "4:52.65/48.00". */
export function parsePriceBreaks(input: string): {
  breaks: PriceBreak[];
  issues: PriceBreakIssue[];
} {
  const issues: PriceBreakIssue[] = [];
  const text = (input ?? '').trim();
  if (!text) return { breaks: [], issues };
  const breaks: PriceBreak[] = [];
  for (const part of text.split(',').map((piece) => piece.trim()).filter(Boolean)) {
    const [quantityText, priceText = ''] = part.split(':').map((piece) => piece.trim());
    const quantity = Number(quantityText);
    if (!Number.isInteger(quantity)) {
      issues.push(`"${part}" does not start with a whole number of units.`);
      continue;
    }
    const [listText, institutionalText] = priceText.split('/').map((piece) => piece.trim());
    const list = money(listText);
    const institutional = institutionalText === undefined ? null : money(institutionalText);
    if (list === 'bad' || institutional === 'bad') {
      issues.push(`"${part}" does not carry a price in dollars, for example 4:52.65.`);
      continue;
    }
    if (list === null && institutional === null) {
      issues.push(`"${part}" sets no price.`);
      continue;
    }
    breaks.push({
      minQuantity: quantity,
      listPriceCents: list,
      institutionalPriceCents: institutional,
    });
  }
  return { breaks: breaks.sort((a, b) => a.minQuantity - b.minQuantity), issues };
}

function money(text: string | undefined): number | null | 'bad' {
  const value = (text ?? '').trim().replace(/^\$/, '');
  if (!value) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return 'bad';
  return Math.round(Number(value) * 100);
}

/** The manager's editable form of what is stored. */
export function priceBreaksToCell(breaks: PriceBreak[]): string {
  return breaks
    .map((row) => {
      const dollars = (cents: number | null) => (cents === null ? '' : (cents / 100).toFixed(2));
      const prices = row.institutionalPriceCents === null
        ? dollars(row.listPriceCents)
        : `${dollars(row.listPriceCents)}/${dollars(row.institutionalPriceCents)}`;
      return `${row.minQuantity}:${prices}`;
    })
    .join(', ');
}

/**
 * Everything wrong with a ladder, said plainly. Called by the catalog rules, so
 * a bad ladder cannot reach the database from the form, the seed or an import.
 */
export function validatePriceBreaks(
  breaks: PriceBreak[],
  variant: { listPriceCents: number | null; institutionalPriceCents: number | null },
): PriceBreakIssue[] {
  const issues: PriceBreakIssue[] = [];
  if (breaks.length === 0) return issues;
  if (breaks.length > MAX_PRICE_BREAKS) {
    issues.push(`At most ${MAX_PRICE_BREAKS} volume prices per pack size; this has ${breaks.length}.`);
  }
  const seen = new Set<number>();
  let previousList: number | null = null;
  let previousInstitutional: number | null = null;
  for (const row of [...breaks].sort((a, b) => a.minQuantity - b.minQuantity)) {
    if (row.minQuantity < 2) {
      issues.push(`A volume price starts at 2 units or more; ${row.minQuantity} does not.`);
    }
    if (seen.has(row.minQuantity)) {
      issues.push(`Two volume prices both start at ${row.minQuantity} units.`);
    }
    seen.add(row.minQuantity);

    for (const [label, price, base, previous] of [
      ['list', row.listPriceCents, variant.listPriceCents, previousList],
      ['institutional', row.institutionalPriceCents, variant.institutionalPriceCents, previousInstitutional],
    ] as const) {
      if (price === null) continue;
      if (price <= 0) {
        issues.push(`The ${label} price at ${row.minQuantity} units must be more than zero.`);
        continue;
      }
      if (base === null) {
        issues.push(`There is a ${label} volume price at ${row.minQuantity} units but no ${label} price to discount.`);
        continue;
      }
      if (price >= base) {
        issues.push(
          `The ${label} price at ${row.minQuantity} units (${dollars(price)}) is not below the ${label} price of ${dollars(base)}.`,
        );
        continue;
      }
      if (previous !== null && price >= previous) {
        issues.push(
          `The ${label} price at ${row.minQuantity} units (${dollars(price)}) is not below the one for the smaller quantity (${dollars(previous)}).`,
        );
      }
    }
    if (row.listPriceCents !== null) previousList = row.listPriceCents;
    if (row.institutionalPriceCents !== null) previousInstitutional = row.institutionalPriceCents;
  }
  return issues;
}

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

type Pricing = 'institutional' | 'researcher' | 'none';

function priceOn(row: { listPriceCents: number | null; institutionalPriceCents: number | null }, pricing: Pricing) {
  if (pricing === 'institutional') return row.institutionalPriceCents;
  if (pricing === 'researcher') return row.listPriceCents;
  return null;
}

/**
 * The unit price for this many units: the deepest break whose threshold the
 * quantity reaches, or the variant's own price when none applies.
 */
export function effectiveUnitPrice(
  variant: { listPriceCents: number | null; institutionalPriceCents: number | null },
  breaks: PriceBreak[],
  quantity: number,
  pricing: Pricing,
): number | null {
  const base = priceOn(variant, pricing);
  if (base === null) return null;
  const applicable = breaks
    .filter((row) => row.minQuantity <= quantity && priceOn(row, pricing) !== null)
    .sort((a, b) => a.minQuantity - b.minQuantity)
    .at(-1);
  const price = applicable ? priceOn(applicable, pricing) : null;
  // A break above the base price is a data error the rules should have caught;
  // never let one raise a price at the till.
  return price !== null && price < base ? price : base;
}

export type LadderRow = {
  minQuantity: number;
  unitPriceCents: number;
  savingPercent: number;
  applies: boolean;
};

/** The ladder as a customer reads it, including which row they are on. */
export function priceLadder(
  variant: { listPriceCents: number | null; institutionalPriceCents: number | null },
  breaks: PriceBreak[],
  pricing: Pricing,
  quantity = 1,
): LadderRow[] {
  const base = priceOn(variant, pricing);
  if (base === null) return [];
  const rows = breaks
    .map((row) => ({ minQuantity: row.minQuantity, unitPriceCents: priceOn(row, pricing) }))
    .filter((row): row is { minQuantity: number; unitPriceCents: number } =>
      row.unitPriceCents !== null && row.unitPriceCents < base,
    )
    .sort((a, b) => a.minQuantity - b.minQuantity);
  if (rows.length === 0) return [];
  const current = effectiveUnitPrice(variant, breaks, quantity, pricing);
  return [{ minQuantity: 1, unitPriceCents: base }, ...rows].map((row) => ({
    ...row,
    savingPercent: Math.round(((base - row.unitPriceCents) / base) * 100),
    applies: current === row.unitPriceCents,
  }));
}

/**
 * What the next break would be worth, for the nudge on the product page. Null
 * when there is nothing further to reach — never a fabricated encouragement.
 */
export function nextBreak(
  variant: { listPriceCents: number | null; institutionalPriceCents: number | null },
  breaks: PriceBreak[],
  quantity: number,
  pricing: Pricing,
): { unitsAway: number; minQuantity: number; unitPriceCents: number; savesCents: number } | null {
  const current = effectiveUnitPrice(variant, breaks, quantity, pricing);
  if (current === null) return null;
  const next = breaks
    .filter((row) => row.minQuantity > quantity && (priceOn(row, pricing) ?? current) < current)
    .sort((a, b) => a.minQuantity - b.minQuantity)[0];
  if (!next) return null;
  const price = priceOn(next, pricing)!;
  return {
    unitsAway: next.minQuantity - quantity,
    minQuantity: next.minQuantity,
    unitPriceCents: price,
    savesCents: (current - price) * next.minQuantity,
  };
}

/** Read the stored JSON defensively: a malformed value prices at list, never at zero. */
export function readPriceBreaks(stored: unknown): PriceBreak[] {
  if (typeof stored === 'string') {
    try {
      return readPriceBreaks(JSON.parse(stored));
    } catch {
      return [];
    }
  }
  if (!Array.isArray(stored)) return [];
  const rows: PriceBreak[] = [];
  for (const item of stored) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    // Strict: a value that is not the shape this module writes is ignored
    // rather than coerced. A price must never be guessed from a near-miss.
    const minQuantity = record.minQuantity;
    if (typeof minQuantity !== 'number' || !Number.isInteger(minQuantity) || minQuantity < 2) continue;
    const list = Number.isInteger(record.listPriceCents) ? (record.listPriceCents as number) : null;
    const institutional = Number.isInteger(record.institutionalPriceCents)
      ? (record.institutionalPriceCents as number)
      : null;
    if (list === null && institutional === null) continue;
    rows.push({ minQuantity, listPriceCents: list, institutionalPriceCents: institutional });
  }
  return rows.sort((a, b) => a.minQuantity - b.minQuantity);
}
