import { and, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { lots } from '@/db/schema';
import {
  getPublishedProduct,
  listPublishedProducts, listPublishedProductsInClass,
  type CatalogProduct,
} from '@/lib/catalog-data';
import { lotSuppliesPack } from '@/lib/lot-quantities';
import { publishableLot } from '@/lib/lots-public';
import { priceFor, type Visibility } from '@/lib/visibility-rules';

/**
 * The storefront listing rule.
 *
 * As adopted 14 Sep 2026 (Chapter 19 §19.2): a product was on the storefront
 * only when published AND photographed AND priced AND backed by a publishable
 * lot; anything else answered 404.
 *
 * Reversed 19 Sep 2026 by Ammre: every PUBLISHED product is listed. A product
 * with no sellable pack — no approved price, no publishable lot, or a lot that
 * cannot supply the pack — is shown as "Out of stock" and cannot be added to
 * the cart. Where no photograph exists the page says so (ProductImage
 * placeholder); where no price exists none is shown. Nothing about what can be
 * BOUGHT changed: `sellableSkus` still requires an approved price and a lot
 * that supplies the pack, and the internal `status` field is still not
 * consulted. `listingBlockers` is kept for the manager screens and now only
 * reports why a listed product has nothing to sell.
 */

export type PublishableStock = {
  productCode: string;
  quantityRemaining: string | null;
  retestDate: Date | null;
  containerSize: string | null;
};

export type StockState = 'in_stock' | 'out_of_stock';

export type ListedProduct = CatalogProduct & {
  stock: StockState;
  /** SKUs a buyer can actually order today: priced, and a lot can supply the pack. */
  sellableSkus: string[];
};

function approvedPrice(cents: number | null): boolean {
  return cents !== null && Number.isSafeInteger(cents) && cents > 0;
}

function lotUsable(lot: PublishableStock, now: Date): boolean {
  return !lot.retestDate || lot.retestDate.getTime() > now.getTime();
}

/** Why a listed product has nothing to sell today. Empty means at least a price and a lot exist. */
export function listingBlockers(product: Pick<CatalogProduct, 'image' | 'variants'>, stock: PublishableStock[]): string[] {
  const blockers: string[] = [];
  if (!product.image) blockers.push('No photograph');
  if (!product.variants.some((v) => v.active && approvedPrice(v.listPriceCents))) blockers.push('No approved public price');
  if (!stock.length) blockers.push('No released, publishable lot');
  return blockers;
}

export function sellableSkus(product: CatalogProduct, stock: PublishableStock[], now = new Date()): string[] {
  return product.variants
    .filter(
      (v) =>
        v.active &&
        approvedPrice(v.listPriceCents) &&
        stock.some((lot) => lotUsable(lot, now) && lotSuppliesPack(lot, v.quantity)),
    )
    .map((v) => v.sku);
}

export function toListed(product: CatalogProduct, stock: PublishableStock[], now = new Date()): ListedProduct | null {
  // 19 Sep 2026: publication alone lists a product; blockers only decide stock state.
  const skus = sellableSkus(product, stock, now);
  return { ...product, stock: skus.length ? 'in_stock' : 'out_of_stock', sellableSkus: skus };
}

/**
 * The stock state a viewer may see, or null. Whether a pack can be supplied
 * today is lot availability, which lib/visibility-rules.ts shows only with
 * `availability`; a viewer without it sees neither "in stock" nor "out of stock".
 */
export function visibleStock(product: ListedProduct, visibility: Pick<Visibility, 'availability'>): StockState | null {
  return visibility.availability ? product.stock : null;
}

async function publishableStock(codes: string[]): Promise<PublishableStock[]> {
  if (!codes.length) return [];
  return getDb()
    .select({
      productCode: lots.productCode,
      quantityRemaining: lots.quantityRemaining,
      retestDate: lots.retestDate,
      containerSize: lots.containerSize,
    })
    .from(lots)
    .where(and(publishableLot(), sql`${lots.productCode} IN (SELECT value FROM json_each(${JSON.stringify(codes)}))`))
    .limit(5000);
}

/** Whether a publishable lot can supply this pack size today: the add-to-cart stock check. */
export async function packAvailable(productCode: string, packSize: string, now = new Date()): Promise<boolean> {
  const stock = await publishableStock([productCode]);
  return stock.some((lot) => lotUsable(lot, now) && lotSuppliesPack(lot, packSize));
}

/**
 * Other listed materials of the same chemical class, for the product page. Classification
 * by chemical class is the only axis (CLAUDE.md), so "related" can only ever mean that.
 */
export async function listRelatedProducts(
  product: Pick<CatalogProduct, 'code' | 'chemicalClass'>,
  limit = 3,
  now = new Date(),
): Promise<ListedProduct[]> {
  const siblings = (await listPublishedProductsInClass(product.chemicalClass)).filter((p) => p.code !== product.code);
  if (siblings.length === 0) return [];
  const stock = await publishableStock([...new Set(siblings.map((p) => p.code))]);
  return siblings
    .map((p) => toListed(p, stock.filter((lot) => lot.productCode === p.code), now))
    .filter((p): p is ListedProduct => p !== null)
    .slice(0, limit);
}

/** Every product on the storefront, in catalog order, with its stock state. */
export async function listStorefrontProducts(now = new Date()): Promise<ListedProduct[]> {
  const published = await listPublishedProducts();
  const stock = await publishableStock([...new Set(published.map((p) => p.code))]);
  return published
    .map((product) => toListed(product, stock.filter((lot) => lot.productCode === product.code), now))
    .filter((product): product is ListedProduct => product !== null);
}

/**
 * Is this already-loaded published product on the storefront today?
 *
 * The legacy /product/<slug> redirect needs this: a published product that is
 * not listed has no page to send anyone to, and a 301 into a 404 is worse than
 * the 404 it replaced.
 */
export async function isListed(product: CatalogProduct, now = new Date()): Promise<boolean> {
  return toListed(product, await publishableStock([product.code]), now) !== null;
}

/** One storefront product by slug, or null when no published product has that slug. */
export async function getStorefrontProduct(slug: string, now = new Date()): Promise<ListedProduct | null> {
  const product = await getPublishedProduct(slug);
  if (!product) return null;
  return toListed(product, await publishableStock([product.code]), now);
}

export type HiddenProduct = { code: string; name: string; slug: string; blockers: string[] };

export type PublishedProductVisibility = {
  publishedCount: number;
  hidden: HiddenProduct[];
};

function staffListingBlockers(
  product: Pick<CatalogProduct, 'image' | 'variants'>,
  stock: PublishableStock[],
): string[] {
  return listingBlockers(product, stock).map((blocker) =>
    blocker === 'No approved public price'
      ? 'No active pack with an approved public price'
      : blocker,
  );
}

/**
 * Published materials that no shopper can see, with the reason for each.
 *
 * Staff-facing, and the answer to the question the manager could not previously
 * answer: a product can be published, saved and apparently finished while the
 * catalog shows nothing, because listing also needs a photograph, an active
 * pack with an approved price and a publishable lot. Every requirement is
 * enforced somewhere else, so the symptom is the same whichever one is
 * missing; this names it.
 */
export async function publishedProductVisibility(): Promise<PublishedProductVisibility> {
  const published = await listPublishedProducts();
  const stock = await publishableStock([...new Set(published.map((p) => p.code))]);
  const hidden = published
    .map((product) => ({
      code: product.code,
      name: product.name,
      slug: product.slug,
      blockers: staffListingBlockers(
        product,
        stock.filter((lot) => lot.productCode === product.code),
      ),
    }))
    .filter((product) => product.blockers.length > 0);
  return { publishedCount: published.length, hidden };
}

export async function hiddenPublishedProducts(): Promise<HiddenProduct[]> {
  return (await publishedProductVisibility()).hidden;
}

/** Why this one published product is off the storefront; empty when shoppers can see it. */
export async function productListingBlockers(product: CatalogProduct): Promise<string[]> {
  return staffListingBlockers(product, await publishableStock([product.code]));
}

/** Slug / name / code index of listed products, for the finder rail and the sitemap. */
export async function listStorefrontProductLinks(): Promise<
  { code: string; name: string; slug: string; updatedAt: Date | null }[]
> {
  return (await listStorefrontProducts()).map(({ code, name, slug, updatedAt }) => ({ code, name, slug, updatedAt }));
}

export type StorefrontSort = 'az' | 'za' | 'price' | 'newest';

/**
 * The sort a viewer asked for, if they may have it. An order by price reveals
 * price, so a viewer shown no prices gets the default order instead.
 */
export function normaliseSort(raw: string | undefined, pricing: Visibility['pricing']): StorefrontSort {
  if (raw === 'price') return pricing === 'none' ? 'az' : 'price';
  return raw === 'za' || raw === 'newest' ? raw : 'az';
}

/** The lowest price shown to this viewer's tier; a product with none sorts last. */
function lowestPrice(product: ListedProduct, pricing: Visibility['pricing']): number {
  const prices = product.variants
    .filter((v) => v.active)
    .map((v) => priceFor(v, pricing))
    .filter((cents): cents is number => approvedPrice(cents));
  return prices.length ? Math.min(...prices) : Number.MAX_SAFE_INTEGER;
}

export function sortStorefront(list: ListedProduct[], sort: StorefrontSort, pricing: Visibility['pricing']): ListedProduct[] {
  const copy = [...list];
  switch (sort) {
    case 'za':
      return copy.sort((a, b) => b.name.localeCompare(a.name));
    case 'price':
      // Never a price order for a viewer shown no prices, whatever the caller passed.
      if (pricing === 'none') return copy.sort((a, b) => a.name.localeCompare(b.name));
      return copy.sort((a, b) => lowestPrice(a, pricing) - lowestPrice(b, pricing) || a.name.localeCompare(b.name));
    case 'newest':
      return copy.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || a.name.localeCompare(b.name));
    default:
      return copy.sort((a, b) => a.name.localeCompare(b.name));
  }
}
