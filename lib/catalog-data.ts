import { and, asc, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db';
import { readPriceBreaks, type PriceBreak } from '@/lib/price-breaks';
import {
  productVariants,
  products,
  type ProductRow,
  type ProductVariantRow,
} from '@/db/schema';
import type { ChemicalClass, Product, ProductStatus } from '@/lib/catalog';
import type { Visibility } from '@/lib/catalog-rules';
import { reportServerFailure } from '@/lib/server-failure';

/**
 * Catalog reads. D1 is the source of truth once seeded; lib/catalog.ts is the
 * seed file and the type definitions, nothing more.
 *
 * Public pages call the `published*` functions, which only ever return rows
 * with visibility = 'published'. Draft and withdrawn products are reachable
 * only through `listAllProducts` / `getProductByCode`, used by the
 * authenticated catalog manager.
 */

export type CatalogVariant = {
  id: string;
  sku: string;
  quantity: string;
  presentation: string;
  listPriceCents: number | null;
  priceBreaks: PriceBreak[];
  institutionalPriceCents: number | null;
  active: boolean;
  sortOrder: number;
};

export type CatalogProduct = Product & {
  id: string;
  visibility: Visibility;
  withdrawnReason: string | null;
  sortOrder: number;
  variants: CatalogVariant[];
  createdAt: Date;
  updatedAt: Date;
  updatedBy: string | null;
};

function toVariant(v: ProductVariantRow): CatalogVariant {
  return {
    id: v.id,
    sku: v.sku,
    quantity: v.quantity,
    presentation: v.presentation,
    listPriceCents: v.listPriceCents,
    priceBreaks: readPriceBreaks(v.priceBreaks),
    institutionalPriceCents: v.institutionalPriceCents,
    active: v.active,
    sortOrder: v.sortOrder,
  };
}

export function rowToProduct(
  row: ProductRow,
  variants: ProductVariantRow[],
): CatalogProduct {
  const sorted = [...variants]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(toVariant);
  return {
    id: row.id,
    code: row.code,
    slug: row.slug,
    name: row.name,
    formalName: row.formalName,
    synonyms: row.synonyms,
    chemicalClass: row.chemicalClass as ChemicalClass,
    casNumber: row.casNumber,
    relatedCas: row.relatedCas.length ? row.relatedCas : undefined,
    sequenceOneLetter: row.sequenceOneLetter ?? undefined,
    sequenceThreeLetter: row.sequenceThreeLetter ?? undefined,
    molecularFormula: row.molecularFormula,
    molecularWeight: row.molecularWeight,
    exactMass: row.exactMass ?? undefined,
    smiles: row.smiles ?? undefined,
    inchiKey: row.inchiKey ?? undefined,
    pubchemCid: row.pubchemCid ?? undefined,
    purity: row.purity,
    form: row.form,
    saltForm: row.saltForm,
    solubility: row.solubility,
    storageSolid: row.storageSolid,
    storageStock: row.storageStock,
    stability: row.stability,
    shipping: row.shipping,
    packSizes: sorted
      .filter((v) => v.active)
      .map((v) => ({ quantity: v.quantity })),
    status: row.status as ProductStatus,
    description: row.description,
    sourceNotes: row.sourceNotes,
    hazard: row.hazard ?? undefined,
    hasSds: row.hasSds,
    image: row.image ?? undefined,
    featured: row.featured,
    visibility: row.visibility as Visibility,
    withdrawnReason: row.withdrawnReason,
    sortOrder: row.sortOrder,
    variants: sorted,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    updatedBy: row.updatedBy,
  };
}

async function attachVariants(rows: ProductRow[]): Promise<CatalogProduct[]> {
  if (rows.length === 0) return [];
  const db = getDb();
  const variantRows = await db
    .select()
    .from(productVariants)
    .where(
      inArray(
        productVariants.productId,
        rows.map((r) => r.id),
      ),
    );
  const byProduct = new Map<string, ProductVariantRow[]>();
  for (const v of variantRows) {
    const list = byProduct.get(v.productId) ?? [];
    list.push(v);
    byProduct.set(v.productId, list);
  }
  return rows.map((row) => rowToProduct(row, byProduct.get(row.id) ?? []));
}

/** Every published product, in catalog order. */
export async function listPublishedProducts(): Promise<CatalogProduct[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(products)
    .where(eq(products.visibility, 'published'))
    .orderBy(asc(products.sortOrder), asc(products.code));
  return attachVariants(rows);
}

/** Published products in one chemical class, in catalog order — the related-materials query. */
export async function listPublishedProductsInClass(
  chemicalClass: string,
): Promise<CatalogProduct[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(products)
    .where(
      and(
        eq(products.visibility, 'published'),
        eq(products.chemicalClass, chemicalClass),
      ),
    )
    .orderBy(asc(products.sortOrder), asc(products.code));
  return attachVariants(rows);
}

/** Minimal catalog index for the global finder; avoids loading chemical data and variants on every page. */
export async function listPublishedProductLinks(): Promise<
  { code: string; name: string; slug: string }[]
> {
  return getDb()
    .select({ code: products.code, name: products.name, slug: products.slug })
    .from(products)
    .where(eq(products.visibility, 'published'))
    .orderBy(asc(products.sortOrder), asc(products.code));
}

/** Published product slugs with their last change, for the sitemap. Draft, withdrawn and enquire-only products are excluded. */
export async function listPublishedProductsForSitemap(): Promise<
  { slug: string; updatedAt: Date | null }[]
> {
  return getDb()
    .select({ slug: products.slug, updatedAt: products.updatedAt })
    .from(products)
    .where(eq(products.visibility, 'published'))
    .orderBy(asc(products.sortOrder), asc(products.code));
}

export type CatalogLoad<T> =
  | { data: T; unavailable: false }
  | { data: null; unavailable: true };

/**
 * Public pages must render even when D1 is unreachable — with an explicit
 * "unavailable" state, never with stale or partial data. The error is logged
 * server-side and never shown to the visitor.
 */
export async function loadCatalog<T>(
  read: () => Promise<T>,
): Promise<CatalogLoad<T>> {
  try {
    return { data: await read(), unavailable: false };
  } catch {
    reportServerFailure('catalog-read');
    return { data: null, unavailable: true };
  }
}

/** One published product by slug, or null. Drafts and withdrawn items do not resolve here. */
export async function getPublishedProduct(
  slug: string,
): Promise<CatalogProduct | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(products)
    .where(and(eq(products.slug, slug), eq(products.visibility, 'published')))
    .limit(1);
  if (!row) return null;
  const [product] = await attachVariants([row]);
  return product ?? null;
}

/** All products regardless of visibility. Catalog manager only. */
export async function listAllProducts(): Promise<CatalogProduct[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(products)
    .orderBy(asc(products.sortOrder), asc(products.code));
  return attachVariants(rows);
}

/** One PUBLISHED product by code, for public routes keyed by code. */
export async function getPublishedProductByCode(
  code: string,
): Promise<CatalogProduct | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(products)
    .where(
      and(
        eq(products.code, code.toUpperCase()),
        eq(products.visibility, 'published'),
      ),
    )
    .limit(1);
  if (!row) return null;
  const [product] = await attachVariants([row]);
  return product ?? null;
}

/** One product by code regardless of visibility. Catalog manager only. */
export async function getProductByCode(
  code: string,
): Promise<CatalogProduct | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(products)
    .where(eq(products.code, code.toUpperCase()))
    .limit(1);
  if (!row) return null;
  const [product] = await attachVariants([row]);
  return product ?? null;
}

export function groupByClass(
  list: CatalogProduct[],
): Map<ChemicalClass, CatalogProduct[]> {
  const map = new Map<ChemicalClass, CatalogProduct[]>();
  for (const p of list) {
    const group = map.get(p.chemicalClass) ?? [];
    group.push(p);
    map.set(p.chemicalClass, group);
  }
  return map;
}
