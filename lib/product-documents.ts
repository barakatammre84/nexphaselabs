import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { getDb } from '@/db';
import { productDocuments, products, type ProductDocument } from '@/db/schema';
import type { StoredDocument } from '@/lib/documents';
import type { StaffPrincipal } from '@/lib/staff-auth';

function id(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
}

/** The SDS currently in force for a product, or null. */
export async function currentSds(productId: string): Promise<ProductDocument | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(productDocuments)
    .where(and(eq(productDocuments.productId, productId), eq(productDocuments.kind, 'sds'), isNull(productDocuments.supersededAt)))
    .orderBy(desc(productDocuments.uploadedAt))
    .limit(1);
  return row ?? null;
}

/** Current SDS per product id, for lists. */
export async function currentSdsByProduct(productIds: string[]): Promise<Map<string, ProductDocument>> {
  if (productIds.length === 0) return new Map();
  const db = getDb();
  const rows = await db
    .select()
    .from(productDocuments)
    .where(and(inArray(productDocuments.productId, productIds), eq(productDocuments.kind, 'sds'), isNull(productDocuments.supersededAt)));
  return new Map(rows.map((r) => [r.productId, r]));
}

export async function sdsHistory(productId: string): Promise<ProductDocument[]> {
  const db = getDb();
  return db
    .select()
    .from(productDocuments)
    .where(and(eq(productDocuments.productId, productId), eq(productDocuments.kind, 'sds')))
    .orderBy(desc(productDocuments.uploadedAt));
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
      .where(and(eq(productDocuments.productId, productId), eq(productDocuments.kind, 'sds'), isNull(productDocuments.supersededAt))),
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
    db.update(products).set({ hasSds: true, updatedAt: now }).where(eq(products.id, productId)),
  ]);
}
