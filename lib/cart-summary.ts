import type { Cart } from '@/lib/cart';
import { freeShippingProgress, type FreeShippingProgress } from '@/lib/free-shipping-rules';

/**
 * The cart as the side drawer sees it (owner, 16 Sep 2026: a cart that opens
 * beside the page, like the reference store's). One serialiser so the drawer,
 * the add-to-cart answer and the tests all read the same shape. Prices are the
 * cents already decided by lib/cart — nothing is recomputed here.
 */
export type CartSummaryLine = {
  itemId: string;
  sku: string;
  productName: string;
  productSlug: string;
  /** The pack size, e.g. "5 mg". */
  pack: string;
  quantity: number;
  unitPriceCents: number | null;
  lineTotalCents: number | null;
  problem: string | null;
};

export type CartSummary = {
  count: number;
  subtotalCents: number;
  orderable: boolean;
  lines: CartSummaryLine[];
  /** Distance to free delivery, when staff have switched it on (lib/free-shipping-rules.ts). */
  freeShipping: FreeShippingProgress | null;
};

export function cartSummary(cart: Cart, freeShippingThresholdCents: number | null = null): CartSummary {
  const lines = cart.lines.map((line) => ({
    itemId: line.itemId,
    sku: line.variant.sku,
    productName: line.product.name,
    productSlug: line.product.slug,
    pack: line.variant.quantity,
    quantity: line.quantity,
    unitPriceCents: line.unitPriceCents,
    lineTotalCents: line.unitPriceCents === null ? null : line.unitPriceCents * line.quantity,
    problem: line.problem,
  }));
  return {
    count: lines.reduce((sum, line) => sum + line.quantity, 0),
    subtotalCents: cart.subtotalCents,
    orderable: cart.orderable,
    lines,
    freeShipping: freeShippingProgress(cart.subtotalCents, freeShippingThresholdCents),
  };
}

/** A fetch() caller that wants JSON instead of the form redirect. */
export function wantsJson(request: Request): boolean {
  return (request.headers.get('accept') ?? '').includes('application/json');
}
