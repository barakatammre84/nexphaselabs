import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { cartItems, productVariants, products, type ProductRow, type ProductVariantRow } from '@/db/schema';
import { MAX_CART_LINES } from '@/lib/order-rules';
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

const INVALID_CART_QUANTITY =
  'This cart line has an invalid quantity. Remove it and add the pack size again.';
const INVALID_CART_PRICE =
  'This cart line has an invalid price. Contact support before ordering.';
const UNSAFE_CART_TOTAL =
  'This cart total is too large to calculate safely. Remove an item or reduce a quantity.';

function safePrice(value: number | null): value is number {
  return value !== null && Number.isSafeInteger(value) && value >= 0;
}

function pricedQuantityError(
  variant: ProductVariantRow,
  quantity: number,
  visibility: Visibility,
): string | null {
  const unitPrice = effectiveUnitPrice(
    variant,
    readPriceBreaks(variant.priceBreaks),
    quantity,
    visibility.pricing,
  );
  if (!safePrice(unitPrice)) return INVALID_CART_PRICE;
  if (!Number.isSafeInteger(unitPrice * quantity)) return UNSAFE_CART_TOTAL;
  return null;
}

export async function getCart(accountId: string, visibility: Visibility): Promise<Cart> {
  const db = getDb();
  const rows = await db
    .select({ item: cartItems, variant: productVariants, product: products })
    .from(cartItems)
    .innerJoin(productVariants, eq(cartItems.variantId, productVariants.id))
    .innerJoin(products, eq(productVariants.productId, products.id))
    .where(eq(cartItems.accountId, accountId))
    .orderBy(cartItems.createdAt);

  let itemCount = 0;
  for (const { item } of rows) {
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1)
      throw new RangeError(INVALID_CART_QUANTITY);
    itemCount += item.quantity;
    if (!Number.isSafeInteger(itemCount))
      throw new RangeError('The cart item count is too large to calculate safely.');
  }

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
    else if (!safePrice(unitPriceCents) || (listUnit !== null && !safePrice(listUnit)))
      problem = INVALID_CART_PRICE;
    else if (!Number.isSafeInteger(unitPriceCents * item.quantity))
      problem = UNSAFE_CART_TOTAL;
    return {
      itemId: item.id,
      variant,
      product,
      quantity: item.quantity,
      unitPriceCents: problem === INVALID_CART_PRICE || problem === UNSAFE_CART_TOTAL ? null : unitPriceCents,
      listUnitPriceCents:
        problem === null && listUnit !== null && unitPriceCents !== null && unitPriceCents < listUnit ? listUnit : null,
      problem,
    };
  });
  let subtotalCents = 0;
  for (const line of lines) {
    if (line.problem || line.unitPriceCents === null) continue;
    const next = subtotalCents + line.unitPriceCents * line.quantity;
    if (!Number.isSafeInteger(next)) {
      line.problem = UNSAFE_CART_TOTAL;
      line.unitPriceCents = null;
      line.listUnitPriceCents = null;
      subtotalCents = 0;
      break;
    }
    subtotalCents = next;
  }
  return { lines, subtotalCents, orderable: lines.length > 0 && lines.every((l) => !l.problem) };
}

export type CartWriteResult = { ok: true } | { ok: false; error: string };

/** Add or increase a line. The variant must be active on a published product and priced for this viewer. */
export async function addToCart(accountId: string, sku: string, quantity: number, visibility: Visibility): Promise<CartWriteResult> {
  if (visibility.pricing === 'none') return { ok: false, error: 'Pricing is not available to your account yet.' };
  if (!Number.isSafeInteger(quantity) || quantity < 1) {
    return { ok: false, error: 'Quantity must be a positive safe whole number.' };
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
    if (!Number.isSafeInteger(current.quantity) || current.quantity < 1) {
      return { ok: false, error: INVALID_CART_QUANTITY };
    }
    const next = current.quantity + quantity;
    if (!Number.isSafeInteger(next)) {
      return { ok: false, error: 'The combined quantity is too large.' };
    }
    let cartCount = next;
    for (const item of existing) {
      if (item.id === current.id) continue;
      if (!Number.isSafeInteger(item.quantity) || item.quantity < 1)
        return { ok: false, error: INVALID_CART_QUANTITY };
      cartCount += item.quantity;
      if (!Number.isSafeInteger(cartCount))
        return { ok: false, error: 'The cart item count is too large.' };
    }
    const priceError = pricedQuantityError(row.variant, next, visibility);
    if (priceError) return { ok: false, error: priceError };
    await db.update(cartItems).set({ quantity: next, updatedAt: now }).where(eq(cartItems.id, current.id));
    return { ok: true };
  }
  if (existing.length >= MAX_CART_LINES) return { ok: false, error: `A cart can hold up to ${MAX_CART_LINES} lines.` };
  let cartCount = quantity;
  for (const item of existing) {
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1)
      return { ok: false, error: INVALID_CART_QUANTITY };
    cartCount += item.quantity;
    if (!Number.isSafeInteger(cartCount))
      return { ok: false, error: 'The cart item count is too large.' };
  }
  const priceError = pricedQuantityError(row.variant, quantity, visibility);
  if (priceError) return { ok: false, error: priceError };
  await db.insert(cartItems).values({ id: id('cit'), accountId, variantId: row.variant.id, quantity, createdAt: now, updatedAt: now });
  return { ok: true };
}

/** Set a line's quantity; 0 removes it. Only the owner's lines are touched. */
export async function setCartQuantity(
  accountId: string,
  itemId: string,
  quantity: number,
  visibility?: Visibility,
): Promise<CartWriteResult> {
  if (!Number.isSafeInteger(quantity) || quantity < 0) {
    return { ok: false, error: 'Quantity must be a nonnegative safe whole number.' };
  }
  const db = getDb();
  if (quantity === 0) {
    await db.delete(cartItems).where(and(eq(cartItems.id, itemId), eq(cartItems.accountId, accountId)));
    return { ok: true };
  }
  const existing = await db
    .select({ id: cartItems.id, quantity: cartItems.quantity })
    .from(cartItems)
    .where(eq(cartItems.accountId, accountId));
  if (existing.some((item) => item.id === itemId)) {
    let count = quantity;
    for (const item of existing) {
      if (item.id === itemId) continue;
      if (!Number.isSafeInteger(item.quantity) || item.quantity < 1)
        return { ok: false, error: INVALID_CART_QUANTITY };
      count += item.quantity;
      if (!Number.isSafeInteger(count))
        return { ok: false, error: 'The cart item count is too large.' };
    }
  }
  if (visibility) {
    const [owned] = await db
      .select({ variant: productVariants })
      .from(cartItems)
      .innerJoin(productVariants, eq(cartItems.variantId, productVariants.id))
      .where(and(eq(cartItems.id, itemId), eq(cartItems.accountId, accountId)))
      .limit(1);
    if (owned) {
      const priceError = pricedQuantityError(owned.variant, quantity, visibility);
      if (priceError) return { ok: false, error: priceError };
    }
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
  let count = 0;
  for (const row of rows) {
    if (!Number.isSafeInteger(row.q) || row.q < 1)
      throw new RangeError(INVALID_CART_QUANTITY);
    const next = count + row.q;
    if (!Number.isSafeInteger(next))
      throw new RangeError('The cart item count is too large to calculate safely.');
    count = next;
  }
  return count;
}
