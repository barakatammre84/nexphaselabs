import { and, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { lots } from '@/db/schema';
import {
  getPublishedProduct,
  listPublishedProducts,
  type CatalogProduct,
} from '@/lib/catalog-data';
import { lotSuppliesPack } from '@/lib/lot-quantities';
import { publishableLot } from '@/lib/lots-public';

/**
 * The storefront listing rule (Chapter 19 §19.2, 14 Sep 2026).
 *
 * A product is on the storefront when it is published AND has a photograph
 * AND at least one active pack with an approved public price AND at least one
 * publishable lot on record. Anything else is not listed: the record and its
 * URL stay, the public page answers 404 until the product is stocked, priced
 * and photographed. "Out of stock" is shown only for a listed product whose
 * lots cannot currently supply a pack — never as a substitute for a price or a
 * lot that was never there. The product's internal `status` field is not
 * consulted here; the storefront shows in stock, out of stock, or nothing.
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

/** Why a published product is off the storefront. Empty means it is listed. */
export function listingBlockers(product: CatalogProduct, stock: PublishableStock[]): string[] {
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
  if (listingBlockers(product, stock).length) return null;
  const skus = sellableSkus(product, stock, now);
  return { ...product, stock: skus.length ? 'in_stock' : 'out_of_stock', sellableSkus: skus };
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

/** One storefront product by slug, or null when it is not listed (the page answers 404). */
export async function getStorefrontProduct(slug: string, now = new Date()): Promise<ListedProduct | null> {
  const product = await getPublishedProduct(slug);
  if (!product) return null;
  return toListed(product, await publishableStock([product.code]), now);
}

/** Slug / name / code index of listed products, for the finder rail and the sitemap. */
export async function listStorefrontProductLinks(): Promise<
  { code: string; name: string; slug: string; updatedAt: Date | null }[]
> {
  return (await listStorefrontProducts()).map(({ code, name, slug, updatedAt }) => ({ code, name, slug, updatedAt }));
}

export type StorefrontSort = 'az' | 'za' | 'price' | 'newest';

export function normaliseSort(raw: string | undefined): StorefrontSort {
  return raw === 'za' || raw === 'price' || raw === 'newest' ? raw : 'az';
}

function lowestPrice(product: ListedProduct): number {
  const prices = product.variants
    .filter((v) => v.active && approvedPrice(v.listPriceCents))
    .map((v) => v.listPriceCents as number);
  return prices.length ? Math.min(...prices) : Number.MAX_SAFE_INTEGER;
}

export function sortStorefront(list: ListedProduct[], sort: StorefrontSort): ListedProduct[] {
  const copy = [...list];
  switch (sort) {
    case 'za':
      return copy.sort((a, b) => b.name.localeCompare(a.name));
    case 'price':
      return copy.sort((a, b) => lowestPrice(a) - lowestPrice(b) || a.name.localeCompare(b.name));
    case 'newest':
      return copy.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || a.name.localeCompare(b.name));
    default:
      return copy.sort((a, b) => a.name.localeCompare(b.name));
  }
}
