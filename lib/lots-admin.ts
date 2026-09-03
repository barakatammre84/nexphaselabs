import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { getDb } from '@/db';
import {
  lotDocuments,
  lotMovements,
  lotTests,
  lots,
  type Lot,
  type LotDocument,
  type LotMovement,
  type LotTest,
} from '@/db/schema';
import { getProductByCode } from '@/lib/catalog-data';
import type { DocumentType, StoredDocument } from '@/lib/documents';
import type { LotIntakeValidation } from '@/lib/lot-rules';
import type { StaffPrincipal } from '@/lib/staff-auth';

/**
 * Lot writes and staff-side reads. Every function here is reachable only
 * from staff-gated server actions and pages. The public lookup route never
 * imports this module.
 */

export const LOT_STATUSES = ['quarantine', 'released', 'on_hold', 'rejected', 'withdrawn', 'exhausted'] as const;
export type LotStatus = (typeof LOT_STATUSES)[number];

export const LOT_STATUS_LABEL: Record<LotStatus, string> = {
  quarantine: 'Quarantine',
  released: 'Released',
  on_hold: 'On hold',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
  exhausted: 'Exhausted',
};

function lotId(): string {
  return `lot_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
}

function movementId(): string {
  return `mov_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
}

/** "Name (staff id)" — a named person, resolvable to the account. */
export function recordedBy(staff: StaffPrincipal): string {
  return `${staff.name} (${staff.id})`;
}

export type CreateLotResult = { ok: true; lotNumber: string } | { ok: false; error: string };

/**
 * Receive a lot. Inserts the lot in quarantine and the receipt movement in
 * one batch. There is deliberately no `status` parameter.
 */
export async function createLot(
  validated: Extract<LotIntakeValidation, { ok: true }>['value'],
  staff: StaffPrincipal,
): Promise<CreateLotResult> {
  const db = getDb();
  const product = await getProductByCode(validated.productCode);
  if (!product) return { ok: false, error: `Product ${validated.productCode} is not in the catalog.` };
  if (product.visibility === 'withdrawn') {
    return { ok: false, error: `Product ${validated.productCode} is withdrawn; a new lot cannot be received against it.` };
  }

  const [existing] = await db.select({ id: lots.id }).from(lots).where(eq(lots.lotNumber, validated.lotNumber)).limit(1);
  if (existing) return { ok: false, error: `Lot ${validated.lotNumber} already exists.` };

  const now = new Date();
  const id = lotId();
  try {
    await db.batch([
      db.insert(lots).values({
        id,
        lotNumber: validated.lotNumber,
        productCode: product.code,
        productName: product.name,
        casNumber: product.casNumber,
        manufacturerName: validated.manufacturerName ?? null,
        manufacturerAddress: validated.manufacturerAddress ?? null,
        supplierName: validated.supplierName ?? null,
        countryOfOrigin: validated.countryOfOrigin ?? null,
        entryNumber: validated.entryNumber ?? null,
        manufactureDate: validated.manufactureDateValue,
        receivedAt: validated.receivedAtDate,
        quantityReceived: validated.quantityReceived,
        quantityRemaining: validated.quantityReceived,
        storageLocation: validated.storageLocation ?? null,
        storageCondition: validated.storageCondition ?? null,
        retestDate: validated.retestDateValue,
        // status is left to its default: 'quarantine'
        statusReason: 'Received; awaiting documents, testing and release.',
        createdAt: now,
        updatedAt: now,
      }),
      db.insert(lotMovements).values({
        id: movementId(),
        lotId: id,
        movementType: 'receipt',
        quantity: validated.quantityReceived,
        consigneeName: validated.supplierName ?? null,
        occurredAt: validated.receivedAtDate,
        recordedBy: recordedBy(staff),
        note: validated.note ?? null,
        createdAt: now,
      }),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/UNIQUE constraint failed/i.test(message)) return { ok: false, error: `Lot ${validated.lotNumber} already exists.` };
    throw error;
  }
  return { ok: true, lotNumber: validated.lotNumber };
}

export async function listLots(): Promise<Lot[]> {
  const db = getDb();
  return db.select().from(lots).orderBy(desc(lots.receivedAt), asc(lots.lotNumber));
}

export type LotDetail = { lot: Lot; tests: LotTest[]; movements: LotMovement[]; documents: LotDocument[] };

export async function getLot(lotNumber: string): Promise<Lot | null> {
  const db = getDb();
  const [lot] = await db.select().from(lots).where(eq(lots.lotNumber, lotNumber.toUpperCase())).limit(1);
  return lot ?? null;
}

export async function getLotDetail(lotNumber: string): Promise<LotDetail | null> {
  const db = getDb();
  const lot = await getLot(lotNumber);
  if (!lot) return null;
  const [tests, movements, documents] = await Promise.all([
    db.select().from(lotTests).where(eq(lotTests.lotId, lot.id)).orderBy(asc(lotTests.createdAt)),
    db.select().from(lotMovements).where(eq(lotMovements.lotId, lot.id)).orderBy(asc(lotMovements.occurredAt)),
    db.select().from(lotDocuments).where(eq(lotDocuments.lotId, lot.id)).orderBy(desc(lotDocuments.uploadedAt)),
  ]);
  return { lot, tests, movements, documents };
}

const KEY_COLUMN: Record<DocumentType, 'coaKey' | 'chromatogramKey' | 'massSpecKey' | 'sdsKey'> = {
  coa: 'coaKey',
  chromatogram: 'chromatogramKey',
  mass_spec: 'massSpecKey',
  sds: 'sdsKey',
};

/** The object key currently in force for a document type, from the lot row. */
export function currentDocumentKey(lot: Lot, type: DocumentType): string | null {
  return lot[KEY_COLUMN[type]];
}

/**
 * Record an uploaded document against a lot: supersede the previous current
 * row of the same type, insert the new row, and point the lot at it. One
 * batch. Allowed in any lot status — a released lot can receive a corrected
 * SDS, and the superseded file stays available.
 */
export async function attachLotDocument(
  lot: Lot,
  type: DocumentType,
  stored: StoredDocument,
  originalName: string | null,
  staff: StaffPrincipal,
): Promise<void> {
  const db = getDb();
  const now = new Date();
  await db.batch([
    db
      .update(lotDocuments)
      .set({ supersededAt: now })
      .where(and(eq(lotDocuments.lotId, lot.id), eq(lotDocuments.documentType, type), isNull(lotDocuments.supersededAt))),
    db.insert(lotDocuments).values({
      id: `doc_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`,
      lotId: lot.id,
      documentType: type,
      objectKey: stored.key,
      contentType: stored.contentType,
      sizeBytes: stored.size,
      originalName,
      uploadedBy: recordedBy(staff),
      uploadedAt: stored.uploadedAt,
      createdAt: now,
    }),
    db
      .update(lots)
      .set({ [KEY_COLUMN[type]]: stored.key, updatedAt: now })
      .where(eq(lots.id, lot.id)),
  ]);
}
