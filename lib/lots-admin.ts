import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import type { SQLiteUpdateSetSource } from 'drizzle-orm/sqlite-core';
import { getDb } from '@/db';
import {
  lotDocuments,
  lotMovements,
  lotStatusEvents,
  lotTests,
  lots,
  type Lot,
  type LotDocument,
  type LotMovement,
  type LotStatusEvent,
  type LotTest,
} from '@/db/schema';
import { getProductByCode } from '@/lib/catalog-data';
import type { DocumentType, StoredDocument } from '@/lib/documents';
import {
  DISPOSITION_TARGET,
  releaseBlockers,
  type Disposition,
  type LotIntakeValidation,
  type LotTestValidation,
} from '@/lib/lot-rules';
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
        costCents: validated.costCents,
        costNote: validated.costNote ?? null,
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

export type LotDetail = {
  lot: Lot;
  tests: LotTest[];
  movements: LotMovement[];
  documents: LotDocument[];
  statusEvents: LotStatusEvent[];
};

export async function getLot(lotNumber: string): Promise<Lot | null> {
  const db = getDb();
  const [lot] = await db.select().from(lots).where(eq(lots.lotNumber, lotNumber.toUpperCase())).limit(1);
  return lot ?? null;
}

export async function getLotDetail(lotNumber: string): Promise<LotDetail | null> {
  const db = getDb();
  const lot = await getLot(lotNumber);
  if (!lot) return null;
  const [tests, movements, documents, statusEvents] = await Promise.all([
    db.select().from(lotTests).where(eq(lotTests.lotId, lot.id)).orderBy(asc(lotTests.createdAt)),
    db.select().from(lotMovements).where(eq(lotMovements.lotId, lot.id)).orderBy(asc(lotMovements.occurredAt)),
    db.select().from(lotDocuments).where(eq(lotDocuments.lotId, lot.id)).orderBy(desc(lotDocuments.uploadedAt)),
    db.select().from(lotStatusEvents).where(eq(lotStatusEvents.lotId, lot.id)).orderBy(asc(lotStatusEvents.createdAt)),
  ]);
  return { lot, tests, movements, documents, statusEvents };
}

export type DispositionResult = { ok: true; status: string } | { ok: false; error: string };

/**
 * The only code path that changes a lot's status. Release re-checks every
 * blocker against the database at the moment of the decision — the form's
 * checklist is advisory. The status update is conditional on the status the
 * decision was made against, so two people acting at once cannot both win.
 */
export async function setLotDisposition(
  lot: Lot,
  decision: Disposition,
  reason: string | null,
  staff: StaffPrincipal,
): Promise<DispositionResult> {
  const db = getDb();
  const now = new Date();
  const target = DISPOSITION_TARGET[decision];
  const by = recordedBy(staff);
  const stale = { ok: false as const, error: 'The lot changed while you were deciding. Reload and review again.' };

  // Decide against the row as it is now, not as the page rendered it.
  const fresh = await getLot(lot.lotNumber);
  if (!fresh || fresh.status !== lot.status) return stale;

  if (decision === 'release') {
    const tests = await db
      .select({ testType: lotTests.testType, passed: lotTests.passed })
      .from(lotTests)
      .where(eq(lotTests.lotId, fresh.id));
    const blockers = releaseBlockers(fresh, tests);
    if (blockers.length) return { ok: false, error: `Cannot release: ${blockers.join(' ')}` };
  }

  const update =
    decision === 'release'
      ? { status: target, releasedBy: by, releasedAt: now, statusReason: null, updatedAt: now }
      : { status: target, statusReason: reason, updatedAt: now };

  // Conditional on the status the decision was made against, so two people
  // acting at once cannot both win. The event is written only after the
  // update is known to have applied; a decision that did not happen leaves
  // no record claiming that it did.
  const [changed] = await db
    .update(lots)
    .set(update)
    .where(and(eq(lots.id, fresh.id), eq(lots.status, fresh.status)))
    .returning({ id: lots.id });
  if (!changed) return stale;

  await db.insert(lotStatusEvents).values({
    id: `evt_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`,
    lotId: fresh.id,
    fromStatus: fresh.status,
    toStatus: target,
    reason,
    decidedBy: by,
    createdAt: now,
  });
  return { ok: true, status: target };
}

/**
 * Record one test result and refresh the lot's analytical summary from it.
 * The summary columns are what the public lookup shows; they are derived,
 * never typed in directly:
 *   identity     → identityConfirmed (pass only), identityMethod
 *   purity       → purityResult, purityMethod
 *   water        → waterContent
 *   heavy_metal  → heavyMetalsSummary, rebuilt from every heavy-metal row
 * A test can be recorded in any status; it does not change the status.
 */
export async function addLotTest(
  lot: Lot,
  value: Extract<LotTestValidation, { ok: true }>['value'],
  staff: StaffPrincipal,
): Promise<void> {
  const db = getDb();
  const now = new Date();
  const row = {
    id: `tst_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`,
    lotId: lot.id,
    testType: value.testType,
    analyte: value.analyte,
    method: value.method,
    result: value.result,
    specification: value.specification,
    passed: value.passed,
    testedBy: value.testedBy ?? recordedBy(staff),
    testedAt: value.testedAtDate,
    createdAt: now,
  };

  const summary: SQLiteUpdateSetSource<typeof lots> = { updatedAt: now };
  switch (value.testType) {
    case 'identity':
      summary.identityConfirmed = value.passed === true;
      summary.identityMethod = value.method;
      break;
    case 'purity':
      summary.purityResult = value.result;
      summary.purityMethod = value.method;
      break;
    case 'water':
      summary.waterContent = value.result;
      break;
    case 'heavy_metal':
      // Rebuilt in SQL after the insert, inside the same batch, so concurrent
      // submissions cannot each snapshot a stale list and drop the other's row.
      summary.heavyMetalsSummary = sql`(
        SELECT group_concat(entry, '; ') FROM (
          SELECT COALESCE(${lotTests.analyte}, 'Heavy metals') || ': ' || ${lotTests.result} AS entry
          FROM ${lotTests}
          WHERE ${lotTests.lotId} = ${lot.id} AND ${lotTests.testType} = 'heavy_metal'
          ORDER BY ${lotTests.createdAt}, ${lotTests.id}
        )
      )`;
      break;
    default:
      break;
  }

  await db.batch([db.insert(lotTests).values(row), db.update(lots).set(summary).where(eq(lots.id, lot.id))]);
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

/** Admin records or corrects the landed cost of a lot; the change is an event on the lot. */
export async function setLotCost(lot: Lot, costCents: number, costNote: string | null, staff: StaffPrincipal): Promise<void> {
  const db = getDb();
  const now = new Date();
  const was = lot.costCents === null ? 'not recorded' : `$${(lot.costCents / 100).toFixed(2)}`;
  await db.batch([
    db.update(lots).set({ costCents, costNote, updatedAt: now }).where(eq(lots.id, lot.id)),
    db.insert(lotStatusEvents).values({
      id: `evt_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`,
      lotId: lot.id,
      fromStatus: lot.status,
      toStatus: lot.status,
      reason: `Landed cost recorded: $${(costCents / 100).toFixed(2)}${costNote ? ` (${costNote})` : ''}; was ${was}.`,
      decidedBy: recordedBy(staff),
      kind: 'cost',
      createdAt: now,
    }),
  ]);
}
