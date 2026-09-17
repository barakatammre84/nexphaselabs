import { and, asc, desc, eq, inArray, isNotNull, isNull, or } from 'drizzle-orm';
import { getDb } from '@/db';
import { lotDocuments, orderItems, orders } from '@/db/schema';
import { getLotDocument, sha256Hex } from '@/lib/documents';

/**
 * Document pins.
 *
 * A lot's certificate can be re-issued after material has shipped (a
 * corrected COA, a later SDS revision). The customer who bought from the lot
 * must always be able to retrieve the exact document that accompanied THEIR
 * shipment — never the one uploaded afterwards, and never a document from a
 * reorder against a newer lot. So at dispatch each order line records the id
 * and SHA-256 of the COA and SDS in force at that moment, once, and the
 * customer route serves by that id. The public lot page keeps showing the
 * current document; the two are different questions.
 */
export type DocumentPin = {
  coaDocumentId: string | null;
  coaSha256: string | null;
  sdsDocumentId: string | null;
  sdsSha256: string | null;
};

const EMPTY: DocumentPin = { coaDocumentId: null, coaSha256: null, sdsDocumentId: null, sdsSha256: null };

/** Current COA and SDS for each lot, hashed. A missing hash (pre-0051 upload) is computed from the bucket and back-filled. */
export async function currentDocumentPins(lotIds: string[]): Promise<Map<string, DocumentPin>> {
  const pins = new Map<string, DocumentPin>();
  if (lotIds.length === 0) return pins;
  const db = getDb();
  const rows = await db
    .select({
      id: lotDocuments.id,
      lotId: lotDocuments.lotId,
      documentType: lotDocuments.documentType,
      objectKey: lotDocuments.objectKey,
      sha256: lotDocuments.sha256,
    })
    .from(lotDocuments)
    .where(and(inArray(lotDocuments.lotId, lotIds), inArray(lotDocuments.documentType, ['coa', 'sds']), isNull(lotDocuments.supersededAt)))
    .orderBy(desc(lotDocuments.uploadedAt));
  for (const row of rows) {
    const pin = pins.get(row.lotId) ?? { ...EMPTY };
    const slot = row.documentType === 'coa' ? 'coa' : 'sds';
    if (pin[`${slot}DocumentId`]) continue; // newest first; keep the first seen
    let hash = row.sha256;
    if (!hash) {
      const object = await getLotDocument(row.objectKey);
      if (!object) continue; // a record without bytes cannot be pinned; the line ships unpinned and the alert surfaces it
      hash = await sha256Hex(await object.arrayBuffer());
      await db.update(lotDocuments).set({ sha256: hash }).where(and(eq(lotDocuments.id, row.id), isNull(lotDocuments.sha256)));
    }
    pin[`${slot}DocumentId`] = row.id;
    pin[`${slot}Sha256`] = hash;
    pins.set(row.lotId, pin);
  }
  return pins;
}

/** The pinned document for one of the customer's own order lines, or null when nothing was pinned. */
export async function pinnedDocument(orderId: string, itemId: string, type: 'coa' | 'sds') {
  const db = getDb();
  const [item] = await db
    .select({ coaDocumentId: orderItems.coaDocumentId, sdsDocumentId: orderItems.sdsDocumentId, lotNumber: orderItems.lotNumber })
    .from(orderItems)
    .where(and(eq(orderItems.id, itemId), eq(orderItems.orderId, orderId)))
    .limit(1);
  const documentId = type === 'coa' ? item?.coaDocumentId : item?.sdsDocumentId;
  if (!item || !documentId) return null;
  const [doc] = await db
    .select({ id: lotDocuments.id, objectKey: lotDocuments.objectKey, sha256: lotDocuments.sha256, contentType: lotDocuments.contentType })
    .from(lotDocuments)
    .where(eq(lotDocuments.id, documentId))
    .limit(1);
  return doc ? { ...doc, lotNumber: item.lotNumber } : null;
}

export type PinnedDocumentLine = {
  orderId: string;
  orderNumber: string;
  orderedAt: Date | null;
  itemId: string;
  productCode: string;
  productName: string;
  packSize: string;
  presentation: string;
  quantity: number;
  lotNumber: string | null;
  coaDocumentId: string | null;
  sdsDocumentId: string | null;
};

/**
 * Every order line of the account that shipped with a pinned certificate or safety data
 * sheet, newest order first — the customer's own document library (owner, 16 Sep 2026;
 * ionpeptide's "Downloads" tab as the reference). Lines that have not dispatched carry no
 * pin yet and are left out; the order page explains that.
 */
export async function pinnedDocumentsForAccount(accountId: string, limit = 500): Promise<PinnedDocumentLine[]> {
  const rows = await getDb()
    .select({
      orderId: orders.id,
      orderNumber: orders.orderNumber,
      orderedAt: orders.createdAt,
      itemId: orderItems.id,
      productCode: orderItems.productCode,
      productName: orderItems.productName,
      packSize: orderItems.packSize,
      presentation: orderItems.presentation,
      quantity: orderItems.quantity,
      lotNumber: orderItems.lotNumber,
      coaDocumentId: orderItems.coaDocumentId,
      sdsDocumentId: orderItems.sdsDocumentId,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(
      and(
        eq(orders.accountId, accountId),
        or(isNotNull(orderItems.coaDocumentId), isNotNull(orderItems.sdsDocumentId)),
      ),
    )
    .orderBy(desc(orders.createdAt), asc(orderItems.productName))
    .limit(limit);
  return rows.map((row) => ({ ...row, orderedAt: row.orderedAt ?? null }));
}
