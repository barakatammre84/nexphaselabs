import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { operationalControls, productRevisions, productVariants, products } from '@/db/schema';
import { getProductByCode, type CatalogProduct } from '@/lib/catalog-data';
import { counselHold, skuFor, type ProductInput } from '@/lib/catalog-rules';
import type { StaffPrincipal } from '@/lib/staff-auth';

/**
 * Catalog writes. Only reachable from the staff-gated server action; every
 * call takes a validated ProductInput (lib/catalog-rules.ts) and the staff
 * member making the change. Each write lands as one D1 batch so a product
 * and its variants and its revision row cannot be half-applied.
 *
 * Nothing is deleted: a product is withdrawn by visibility, a pack size is
 * retired by `active = false`, and the previous state survives in
 * product_revisions.
 */

export type WriteResult =
  | { ok: true; code: string }
  | { ok: false; error: string };

function productId(code: string): string {
  return `prd_${code.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
}

function variantId(sku: string): string {
  return `var_${sku.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
}

function revisionId(): string {
  return `rev_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
}

function productColumns(v: ProductInput, staff: StaffPrincipal, now: Date) {
  return {
    code: v.code,
    slug: v.slug,
    name: v.name,
    formalName: v.formalName,
    synonyms: v.synonyms,
    chemicalClass: v.chemicalClass,
    casNumber: v.casNumber,
    relatedCas: v.relatedCas,
    sequenceOneLetter: v.sequenceOneLetter ?? null,
    sequenceThreeLetter: v.sequenceThreeLetter ?? null,
    molecularFormula: v.molecularFormula,
    molecularWeight: v.molecularWeight,
    exactMass: v.exactMass ?? null,
    smiles: v.smiles ?? null,
    inchiKey: v.inchiKey ?? null,
    pubchemCid: v.pubchemCid ?? null,
    purity: v.purity,
    form: v.form,
    saltForm: v.saltForm,
    solubility: v.solubility,
    storageSolid: v.storageSolid,
    storageStock: v.storageStock,
    stability: v.stability,
    shipping: v.shipping,
    status: v.status,
    description: v.description,
    sourceNotes: v.sourceNotes,
    hazard: v.hazard,
    hasSds: v.hasSds,
    image: v.image ?? null,
    featured: v.featured,
    ...(v.sortOrder === null || v.sortOrder === undefined
      ? {}
      : { sortOrder: v.sortOrder }),
    visibility: v.visibility,
    withdrawnReason:
      v.visibility === 'withdrawn' ? (v.withdrawnReason ?? null) : null,
    updatedAt: now,
    updatedBy: staff.id,
  };
}

function snapshotOf(v: ProductInput): Record<string, unknown> {
  return {
    ...v,
    variants: v.variants.map((x) => ({
      ...x,
      sku: x.sku ?? skuFor(v.code, x.quantity),
    })),
  };
}

function isUniqueViolation(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /UNIQUE constraint failed/i.test(message);
}


/**
 * Publication of a counsel-hold compound requires the legal.counsel operating
 * control to be Ready — a recorded counsel disposition, not a checkbox on the
 * product form. Drafts are always allowed: the record must exist so the lot,
 * COA and inventory can be managed while the decision is made.
 */
async function publicationHold(v: ProductInput): Promise<string | null> {
  if (v.visibility !== 'published') return null;
  const reason = counselHold(v);
  if (!reason) return null;
  const [control] = await getDb()
    .select({ status: operationalControls.status })
    .from(operationalControls)
    .where(eq(operationalControls.key, 'legal.counsel'))
    .limit(1);
  if (control?.status === 'ready') return null;
  return `${v.name} is on counsel hold (${reason}). It can be saved as a draft, but publishing requires the "Regulatory counsel review recorded" control to be Ready.`;
}

export async function createProduct(
  v: ProductInput,
  staff: StaffPrincipal,
  note: string | null,
): Promise<WriteResult> {
  const db = getDb();
  const now = new Date();
  const id = productId(v.code);

  const existing = await getProductByCode(v.code);
  if (existing)
    return { ok: false, error: `Code ${v.code} is already in the catalog.` };
  const hold = await publicationHold(v);
  if (hold) return { ok: false, error: hold };

  try {
    await db.batch([
      db
        .insert(products)
        .values({
          id,
          sortOrder: 0,
          ...productColumns(v, staff, now),
          createdAt: now,
        }),
      ...v.variants.map((x, i) =>
        db.insert(productVariants).values({
          id: variantId(x.sku!),
          productId: id,
          sku: x.sku!,
          quantity: x.quantity,
          presentation: x.presentation,
          listPriceCents: x.listPriceCents ?? null,
          institutionalPriceCents: x.institutionalPriceCents ?? null,
          active: x.active ?? true,
          sortOrder: (x.sortOrder ?? i) * 10,
          createdAt: now,
          updatedAt: now,
        }),
      ),
      db.insert(productRevisions).values({
        id: revisionId(),
        productId: id,
        productCode: v.code,
        action: 'create',
        snapshot: snapshotOf(v),
        changedBy: staff.id,
        changedByName: staff.name,
        note,
        createdAt: now,
      }),
    ]);
  } catch (error) {
    if (isUniqueViolation(error))
      return { ok: false, error: 'Code, slug or SKU is already in use.' };
    throw error;
  }
  return { ok: true, code: v.code };
}

export async function updateProduct(
  current: CatalogProduct,
  v: ProductInput,
  staff: StaffPrincipal,
  note: string | null,
): Promise<WriteResult> {
  if (v.code !== current.code)
    return {
      ok: false,
      error: 'The product code cannot change; lot records reference it.',
    };

  const hold = await publicationHold(v);
  if (hold) return { ok: false, error: hold };

  const db = getDb();
  const now = new Date();
  const bySku = new Map(current.variants.map((x) => [x.sku, x]));
  const incoming = new Map(v.variants.map((x) => [x.sku!, x]));

  const statements = [
    db
      .update(products)
      .set(productColumns(v, staff, now))
      .where(eq(products.id, current.id)),
  ] as unknown[];

  for (const [sku, x] of incoming) {
    const existing = bySku.get(sku);
    if (existing) {
      statements.push(
        db
          .update(productVariants)
          .set({
            quantity: x.quantity,
            presentation: x.presentation,
            listPriceCents: x.listPriceCents ?? null,
            institutionalPriceCents: x.institutionalPriceCents ?? null,
            active: true,
            sortOrder: (x.sortOrder ?? 0) * 10,
            updatedAt: now,
          })
          .where(eq(productVariants.id, existing.id)),
      );
    } else {
      statements.push(
        db.insert(productVariants).values({
          id: variantId(sku),
          productId: current.id,
          sku,
          quantity: x.quantity,
          presentation: x.presentation,
          listPriceCents: x.listPriceCents ?? null,
          institutionalPriceCents: x.institutionalPriceCents ?? null,
          active: true,
          sortOrder: (x.sortOrder ?? 0) * 10,
          createdAt: now,
          updatedAt: now,
        }),
      );
    }
  }
  // Pack sizes removed from the form are retired, never deleted.
  for (const [sku, existing] of bySku) {
    if (!incoming.has(sku) && existing.active) {
      statements.push(
        db
          .update(productVariants)
          .set({ active: false, updatedAt: now })
          .where(eq(productVariants.id, existing.id)),
      );
    }
  }

  const action =
    v.visibility === 'withdrawn' && current.visibility !== 'withdrawn'
      ? 'withdraw'
      : v.visibility !== 'withdrawn' && current.visibility === 'withdrawn'
        ? 'restore'
        : 'update';

  statements.push(
    db.insert(productRevisions).values({
      id: revisionId(),
      productId: current.id,
      productCode: current.code,
      action,
      snapshot: snapshotOf(v),
      changedBy: staff.id,
      changedByName: staff.name,
      note,
      createdAt: now,
    }),
  );

  try {
    // drizzle's batch type wants a non-empty tuple; we always have ≥2 statements.
    await db.batch(statements as unknown as Parameters<typeof db.batch>[0]);
  } catch (error) {
    if (isUniqueViolation(error))
      return {
        ok: false,
        error: 'Slug or SKU is already in use by another product.',
      };
    throw error;
  }
  return { ok: true, code: current.code };
}
