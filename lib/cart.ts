import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { cartItems, productVariants, products, type ProductRow, type ProductVariantRow } from '@/db/schema';
import { MAX_CART_LINES, MAX_LINE_QUANTITY } from '@/lib/order-rules';
import { effectiveUnitPrice, readPriceBreaks } from '@/lib/price-breaks';
import { packAvailable } from '@/lib/storefront';
import { priceFor, type Visibility } from '@/lib/visibility-rules';

/**
 * Server-side cart. Every read re-derives price and eligibility from the
 * catalog and the viewer's visibility, so a stale or tampered line can never
 * carry a price of its own.
 */

function id(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
}

export type CartLine = {
  itemId: string;
  variant: ProductVariantRow;
  product: ProductRow;
  quantity: number;
  /** What this line is actually charged per unit — the volume price when one applies. */
  unitPriceCents: number | null;
  /** The one-unit price, present only when a volume price is bringing it down. */
  listUnitPriceCents: number | null;
  /** Why the line cannot be ordered right now, if it cannot. */
  problem: string | null;
};

export type Cart = { lines: CartLine[]; subtotalCents: number; orderable: boolean };

export async function getCart(accountId: string, visibility: Visibility): Promise<Cart> {
  const db = getDb();
  const rows = await db
    .select({ item: cartItems, variant: productVariants, product: products })
    .from(cartItems)
    .innerJoin(productVariants, eq(cartItems.variantId, productVariants.id))
    .innerJoin(products, eq(productVariants.productId, products.id))
    .where(eq(cartItems.accountId, accountId))
    .orderBy(cartItems.createdAt);

  const lines: CartLine[] = rows.map(({ item, variant, product }) => {
    const listUnit = priceFor(variant, visibility.pricing);
    // Volume pricing is applied here, on the server, from the catalog's own
    // ladder — the same computation the order guard repeats in SQL, so a cart
    // can never carry a price the catalog does not agree with.
    const unitPriceCents = effectiveUnitPrice(
      variant,
      readPriceBreaks(variant.priceBreaks),
      item.quantity,
      visibility.pricing,
    );
    let problem: string | null = null;
    if (product.visibility !== 'published') problem = 'This material is no longer listed.';
    else if (!variant.active) problem = 'This pack size has been retired.';
    else if (visibility.pricing === 'none') problem = 'Pricing is not available to your account.';
    else if (unitPriceCents === null) problem = 'This pack size is priced on request. Email research@nexphaselabs.net.';
    return {
      itemId: item.id,
      variant,
      product,
      quantity: item.quantity,
      unitPriceCents,
      listUnitPriceCents:
        listUnit !== null && unitPriceCents !== null && unitPriceCents < listUnit ? listUnit : null,
      problem,
    };
  });
  const subtotalCents = lines.reduce((s, l) => s + (l.problem ? 0 : (l.unitPriceCents ?? 0) * l.quantity), 0);
  return { lines, subtotalCents, orderable: lines.length > 0 && lines.every((l) => !l.problem) };
}

export type CartWriteResult = { ok: true } | { ok: false; error: string };

/** Add or increase a line. The variant must be active on a published product and priced for this viewer. */
export async function addToCart(accountId: string, sku: string, quantity: number, visibility: Visibility): Promise<CartWriteResult> {
  if (visibility.pricing === 'none') return { ok: false, error: 'Pricing is not available to your account yet.' };
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_LINE_QUANTITY) {
    return { ok: false, error: `Quantity must be between 1 and ${MAX_LINE_QUANTITY}.` };
  }
  const db = getDb();
  const [row] = await db
    .select({ variant: productVariants, product: products })
    .from(productVariants)
    .innerJoin(products, eq(productVariants.productId, products.id))
    .where(and(eq(productVariants.sku, sku.toUpperCase()), eq(productVariants.active, true), eq(products.visibility, 'published')))
    .limit(1);
  if (!row) return { ok: false, error: 'That pack size is not available.' };
  if (priceFor(row.variant, visibility.pricing) === null) {
    return { ok: false, error: 'That pack size is priced on request. Email research@nexphaselabs.net.' };
  }
  // The pack table marks a size no lot can supply as out of stock; the cart must agree.
  if (!(await packAvailable(row.product.code, row.variant.quantity))) {
    return { ok: false, error: 'That pack size is out of stock. Choose another size, or check back when the next lot is released.' };
  }

  const existing = await db
    .select({ id: cartItems.id, variantId: cartItems.variantId, quantity: cartItems.quantity })
    .from(cartItems)
    .where(eq(cartItems.accountId, accountId));
  const now = new Date();
  const current = existing.find((e) => e.variantId === row.variant.id);
  if (current) {
    const next = Math.min(MAX_LINE_QUANTITY, current.quantity + quantity);
    await db.update(cartItems).set({ quantity: next, updatedAt: now }).where(eq(cartItems.id, current.id));
    return { ok: true };
  }
  if (existing.length >= MAX_CART_LINES) return { ok: false, error: `A cart can hold up to ${MAX_CART_LINES} lines.` };
  await db.insert(cartItems).values({ id: id('cit'), accountId, variantId: row.variant.id, quantity, createdAt: now, updatedAt: now });
  return { ok: true };
}

/** Set a line's quantity; 0 removes it. Only the owner's lines are touched. */
export async function setCartQuantity(accountId: string, itemId: string, quantity: number): Promise<CartWriteResult> {
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > MAX_LINE_QUANTITY) {
    return { ok: false, error: `Quantity must be between 0 and ${MAX_LINE_QUANTITY}.` };
  }
  const db = getDb();
  if (quantity === 0) {
    await db.delete(cartItems).where(and(eq(cartItems.id, itemId), eq(cartItems.accountId, accountId)));
    return { ok: true };
  }
  await db
    .update(cartItems)
    .set({ quantity, updatedAt: new Date() })
    .where(and(eq(cartItems.id, itemId), eq(cartItems.accountId, accountId)));
  return { ok: true };
}

export async function clearCart(accountId: string): Promise<void> {
  const db = getDb();
  await db.delete(cartItems).where(eq(cartItems.accountId, accountId));
}

export async function cartCount(accountId: string): Promise<number> {
  const db = getDb();
  const rows = await db.select({ q: cartItems.quantity }).from(cartItems).where(eq(cartItems.accountId, accountId));
  return rows.reduce((s, r) => s + r.q, 0);
}
