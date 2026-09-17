/**
 * Free delivery above a materials subtotal (owner, 16 Sep 2026; the free-shipping
 * progress bar on ionpeptide.com as the reference). Pure arithmetic, safe in client
 * components; the threshold itself is a staff setting read in lib/free-shipping.ts.
 *
 * It is deliberately not a promo-code kind: the invoice records discounts as taken
 * off materials, and a zero delivery line is the honest way to show free shipping.
 */
export type FreeShippingProgress = {
  thresholdCents: number;
  /** Cents still to add before the cheapest delivery is free; 0 once it qualifies. */
  remainingCents: number;
  qualifies: boolean;
};

export function freeShippingProgress(subtotalCents: number, thresholdCents: number | null): FreeShippingProgress | null {
  if (thresholdCents === null || !Number.isInteger(thresholdCents) || thresholdCents <= 0) return null;
  const remainingCents = Math.max(0, thresholdCents - Math.max(0, Math.round(subtotalCents)));
  return { thresholdCents, remainingCents, qualifies: remainingCents === 0 };
}

const money = (cents: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

/** One line for the cart: how far to free delivery, or that it applies. Nothing when the rule is off. */
export function freeShippingLine(progress: FreeShippingProgress | null): string | null {
  if (!progress) return null;
  return progress.qualifies
    ? 'Free standard delivery applies to this order.'
    : `Add ${money(progress.remainingCents)} in materials for free standard delivery.`;
}
