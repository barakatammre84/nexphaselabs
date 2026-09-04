import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { getDb } from '@/db';
import { productDocuments, productRevisions, products, type ProductDocument } from '@/db/schema';
import type { StoredDocument } from '@/lib/documents';
import type { StaffPrincipal } from '@/lib/staff-auth';

function id(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
}

/** The SDS currently in force for a product, or null. */
export async function currentSds(
  productId: string,
): Promise<ProductDocument | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(productDocuments)
    .where(
      and(
        eq(productDocuments.productId, productId),
        eq(productDocuments.kind, 'sds'),
        isNull(productDocuments.supersededAt),
      ),
    )
    .orderBy(desc(productDocuments.uploadedAt))
    .limit(1);
  return row ?? null;
}

/** Current SDS per product id, for lists. */
export async function currentSdsByProduct(
  productIds: string[],
): Promise<Map<string, ProductDocument>> {
  if (productIds.length === 0) return new Map();
  const db = getDb();
  const rows = await db
    .select()
    .from(productDocuments)
    .where(
      and(
        inArray(productDocuments.productId, productIds),
        eq(productDocuments.kind, 'sds'),
        isNull(productDocuments.supersededAt),
      ),
    );
  return new Map(rows.map((r) => [r.productId, r]));
}

export type ProductDocumentKind = 'sds' | 'image';

export async function productDocumentHistory(
  productId: string,
  kind: ProductDocumentKind,
): Promise<ProductDocument[]> {
  const db = getDb();
  return db
    .select()
    .from(productDocuments)
    .where(
      and(
        eq(productDocuments.productId, productId),
        eq(productDocuments.kind, kind),
      ),
    )
    .orderBy(desc(productDocuments.uploadedAt));
}

export const sdsHistory = (productId: string) =>
  productDocumentHistory(productId, 'sds');

/**
 * Attach a photograph: supersede the current one, insert the new row and point
 * `products.image` at the new key, in one batch. Earlier photographs stay in
 * the bucket and the history.
 */
export async function attachProductImage(
  productId: string,
  productCode: string,
  stored: StoredDocument,
  originalName: string | null,
  staff: StaffPrincipal,
): Promise<void> {
  const db = getDb();
  const now = new Date();
  await db.batch([
    db
      .update(productDocuments)
      .set({ supersededAt: now })
      .where(
        and(
          eq(productDocuments.productId, productId),
          eq(productDocuments.kind, 'image'),
          isNull(productDocuments.supersededAt),
        ),
      ),
    db.insert(productDocuments).values({
      id: id('pdc'),
      productId,
      kind: 'image',
      objectKey: stored.key,
      contentType: stored.contentType,
      sizeBytes: stored.size,
      originalName,
      revision: null,
      uploadedBy: `${staff.name} (${staff.id})`,
      uploadedAt: stored.uploadedAt,
      createdAt: now,
    }),
    db
      .update(products)
      .set({ image: stored.key, updatedAt: now, updatedBy: staff.id })
      .where(eq(products.id, productId)),
    // A photograph appearing on a public product page is a catalog change, attributed like any other.
    db.insert(productRevisions).values({
      id: id('rev'),
      productId,
      productCode: productCode,
      action: 'image',
      snapshot: { image: stored.key, originalName },
      changedBy: staff.id,
      changedByName: staff.name,
      note: `Photograph uploaded: ${originalName ?? stored.key}`,
      createdAt: now,
    }),
  ]);
}

/** Stop showing the photograph. The upload and its history row are kept. */
export async function clearProductImage(
  productId: string,
  productCode: string,
  staff: StaffPrincipal,
): Promise<void> {
  const db = getDb();
  const now = new Date();
  await db.batch([
    db
      .update(productDocuments)
      .set({ supersededAt: now })
      .where(
        and(
          eq(productDocuments.productId, productId),
          eq(productDocuments.kind, 'image'),
          isNull(productDocuments.supersededAt),
        ),
      ),
    db
      .update(products)
      .set({ image: null, updatedAt: now, updatedBy: staff.id })
      .where(eq(products.id, productId)),
    db.insert(productRevisions).values({
      id: id('rev'),
      productId,
      productCode: productCode,
      action: 'image_removed',
      snapshot: { image: null },
      changedBy: staff.id,
      changedByName: staff.name,
      note: 'Photograph removed; the page now says no photograph is on file',
      createdAt: now,
    }),
  ]);
}

/**
 * Attach a new SDS: supersede the current one, insert the new row and mark
 * the product as having an SDS, in one batch. Earlier sheets stay in the
 * bucket and in the history.
 */
export async function attachSds(
  productId: string,
  stored: StoredDocument,
  originalName: string | null,
  revision: string | null,
  staff: StaffPrincipal,
): Promise<void> {
  const db = getDb();
  const now = new Date();
  await db.batch([
    db
      .update(productDocuments)
      .set({ supersededAt: now })
      .where(
        and(
          eq(productDocuments.productId, productId),
          eq(productDocuments.kind, 'sds'),
          isNull(productDocuments.supersededAt),
        ),
      ),
    db.insert(productDocuments).values({
      id: id('pdc'),
      productId,
      kind: 'sds',
      objectKey: stored.key,
      contentType: stored.contentType,
      sizeBytes: stored.size,
      originalName,
      revision,
      uploadedBy: `${staff.name} (${staff.id})`,
      uploadedAt: stored.uploadedAt,
      createdAt: now,
    }),
    db
      .update(products)
      .set({ hasSds: true, updatedAt: now })
      .where(eq(products.id, productId)),
  ]);
}
