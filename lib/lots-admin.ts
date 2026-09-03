import { SQL, and, asc, desc, eq, getTableColumns, is, isNull, sql } from 'drizzle-orm';
import type { SQLiteTable, SQLiteUpdateSetSource } from 'drizzle-orm/sqlite-core';
import { getDb } from '@/db';
import {
  lotDocuments,
  lotMovements,
  lotStatusEvents,
  lotTests,
  lots,
  purchaseOrderLines,
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
  describeChanges,
  type LotCorrectionValidation,
  type LotIntakeInput,
} from '@/lib/lot-rules';
import type { StaffPrincipal } from '@/lib/staff-auth';
import { randomToken } from '@/lib/staff-auth-core';
import { lotFamilyIds } from '@/lib/lot-family';
import { receiptStatements, type ExpectedReceipt } from '@/lib/procurement';
import { quantitiesComparable, quantityRatio, receiptCostCents } from '@/lib/procurement-quantities';
import { sumQuantities } from '@/lib/lot-quantities';

export { lotFamilyIds, lotVersions } from '@/lib/lot-family';

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
 * INSERT … SELECT of literal values, one row, only where `where` holds on
 * `from`. Every column of the table is supplied (drizzle emits the full
 * column list): given values are driver-encoded through the column, missing
 * nullable columns are NULL, missing timestamp defaults are `now` and missing
 * booleans/integers with defaults take their declared default.
 */
function insertWhere<T extends SQLiteTable>(table: T, values: Record<string, unknown>, from: SQLiteTable, where: SQL) {
  const db = getDb();
  const columns = getTableColumns(table);
  const projection = Object.fromEntries(
    Object.entries(columns).map(([key, col]) => {
      const c = col as unknown as { name: string; notNull: boolean; hasDefault: boolean; default: unknown; mapToDriverValue: (v: unknown) => unknown; dataType: string };
      let raw: unknown;
      if (key in values) raw = values[key];
      else if (c.hasDefault && is(c.default, SQL)) raw = new Date(); // only sql`(unixepoch())` defaults exist on these tables
      else if (c.hasDefault && c.default !== undefined && typeof c.default !== 'object') raw = c.default;
      else if (c.hasDefault) throw new Error(`insertWhere: column ${c.name} has a default this helper cannot reproduce`);
      else if (c.notNull) throw new Error(`insertWhere: no value for required column ${c.name}`);
      else raw = null;
      const driver = raw === null || raw === undefined ? null : c.mapToDriverValue(raw);
      return [key, sql`${driver}`.as(c.name)];
    }),
  ) as unknown as typeof columns;
  // The projection is built at runtime from the table's own columns; the generic insert().select() typing cannot see that.
  return db.insert(table).select(db.select(projection).from(from).where(where) as never);
}

/**
 * Receive a lot. Inserts the lot in quarantine and the receipt movement in
 * one batch. There is deliberately no `status` parameter.
 */
export async function createLot(
  validated: Extract<LotIntakeValidation, { ok: true }>['value'],
  staff: StaffPrincipal,
  /** Expected receipt (purchase-order line) this lot arrives against, if any. */
  expected: ExpectedReceipt | null = null,
): Promise<CreateLotResult> {
  const db = getDb();
  if (expected && expected.productCode !== validated.productCode.toUpperCase()) {
    return { ok: false, error: `Expected receipt ${expected.poNumber} is for ${expected.productCode}, not ${validated.productCode}.` };
  }
  const product = await getProductByCode(validated.productCode);
  if (!product) return { ok: false, error: `Product ${validated.productCode} is not in the catalog.` };
  if (product.visibility === 'withdrawn') {
    return { ok: false, error: `Product ${validated.productCode} is withdrawn; a new lot cannot be received against it.` };
  }

  const [existing] = await db.select({ id: lots.id }).from(lots).where(eq(lots.lotNumber, validated.lotNumber)).limit(1);
  if (existing) return { ok: false, error: `Lot ${validated.lotNumber} already exists.` };

  const now = new Date();
  const id = lotId();
  // From an expected receipt: the supplier is the purchase order's, and the landed cost — unless typed —
  // is this receipt's conserved share of the line's landed cost (material + freight/duty share).
  const supplierName = validated.supplierName ?? expected?.supplierName ?? null;
  let receipt: ReturnType<typeof receiptStatements> | null = null;
  if (expected) {
    if (!quantitiesComparable(validated.quantityReceived, expected.quantity)) {
      return { ok: false, error: `The line is ordered as ${expected.quantity}; record this receipt in a comparable unit, or receive without a purchase order.` };
    }
    if (expected.receivedQuantity && !sumQuantities([expected.receivedQuantity, validated.quantityReceived])) {
      return { ok: false, error: `This receipt cannot be added to the ${expected.receivedQuantity} already received on the line.` };
    }
    receipt = receiptStatements(expected.lineId, id, validated.quantityReceived, staff, now, expected);
  }
  const share = expected ? quantityRatio(validated.quantityReceived, expected.quantity) : 1;
  const costCents = validated.costCents ?? (expected && receipt ? receiptCostCents(expected.landedCostCents, expected.allocatedCents, share, receipt.complete) : null);
  const costNote =
    validated.costNote ??
    (expected && validated.costCents === null
      ? `${expected.poNumber} landed cost share (material + freight/duty), ${validated.quantityReceived} of ${expected.quantity} ordered`
      : null);

  const lotValues = {
    id,
    lotNumber: validated.lotNumber,
    productCode: product.code,
    productName: product.name,
    casNumber: product.casNumber,
    manufacturerName: validated.manufacturerName ?? null,
    manufacturerAddress: validated.manufacturerAddress ?? null,
    supplierName,
    purchaseOrderLineId: expected?.lineId ?? null,
    countryOfOrigin: validated.countryOfOrigin ?? null,
    entryNumber: validated.entryNumber ?? null,
    manufactureDate: validated.manufactureDateValue,
    receivedAt: validated.receivedAtDate,
    quantityReceived: validated.quantityReceived,
    quantityRemaining: validated.quantityReceived,
    costCents,
    costNote,
    storageLocation: validated.storageLocation ?? null,
    storageCondition: validated.storageCondition ?? null,
    retestDate: validated.retestDateValue,
    // status is left to its default: 'quarantine'
    statusReason: 'Received; awaiting documents, testing and release.',
    createdAt: now,
    updatedAt: now,
  };
  const movementValues = {
    id: movementId(),
    lotId: id,
    movementType: 'receipt',
    quantity: validated.quantityReceived,
    consigneeName: supplierName,
    occurredAt: validated.receivedAtDate,
    recordedBy: recordedBy(staff),
    note: [expected ? `Against ${expected.poNumber}.` : null, validated.note ?? null].filter(Boolean).join(' ') || null,
    createdAt: now,
  };
  const costEventValues =
    costCents !== null
      ? {
          id: `evt_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`,
          lotId: id,
          fromStatus: 'quarantine',
          toStatus: 'quarantine',
          reason: `Landed cost recorded at intake: $${(costCents / 100).toFixed(2)}${costNote ? ` (${costNote})` : ''}.`,
          decidedBy: recordedBy(staff),
          kind: 'cost',
          createdAt: now,
        }
      : null;

  try {
    if (!receipt) {
      await db.batch([
        db.insert(lots).values(lotValues),
        db.insert(lotMovements).values(movementValues),
        ...(costEventValues ? [db.insert(lotStatusEvents).values(costEventValues)] : []),
      ] as unknown as Parameters<typeof db.batch>[0]);
    } else {
      // Purchase-order path: claim the line first; the lot and everything after it exist only if the claim landed.
      const lotExists = sql`${lots.id} = ${id}`;
      const [claimed] = await db.batch([
        receipt.claim,
        insertWhere(lots, { ...lotValues, status: 'quarantine' }, purchaseOrderLines, receipt.claimed),
        insertWhere(lotMovements, movementValues, lots, lotExists),
        ...(costEventValues ? [insertWhere(lotStatusEvents, costEventValues, lots, lotExists)] : []),
        ...receipt.after,
      ] as unknown as Parameters<typeof db.batch>[0]);
      if (!claimed || (claimed as unknown[]).length === 0) {
        return { ok: false, error: 'Someone else received against that purchase-order line a moment ago. Reload, check the line, and record again.' };
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/UNIQUE constraint failed/i.test(message)) return { ok: false, error: `Lot ${validated.lotNumber} already exists.` };
    throw error;
  }
  return { ok: true, lotNumber: validated.lotNumber };
}

/** Current record of every lot (superseded versions excluded). */
export async function listLots(): Promise<Lot[]> {
  const db = getDb();
  return db.select().from(lots).where(isNull(lots.supersededById)).orderBy(desc(lots.receivedAt), asc(lots.lotNumber));
}

export type LotDetail = {
  lot: Lot;
  tests: LotTest[];
  movements: LotMovement[];
  documents: LotDocument[];
  statusEvents: LotStatusEvent[];
};

/** The current record for a lot number (a corrected record supersedes the earlier one). */
export async function getLot(lotNumber: string): Promise<Lot | null> {
  const db = getDb();
  const [lot] = await db
    .select()
    .from(lots)
    .where(and(eq(lots.lotNumber, lotNumber.toUpperCase()), isNull(lots.supersededById)))
    .limit(1);
  return lot ?? null;
}

export async function getLotDetail(lotNumber: string): Promise<LotDetail | null> {
  const db = getDb();
  const lot = await getLot(lotNumber);
  if (!lot) return null;
  const family = await lotFamilyIds(lot.id);
  const [tests, movements, documents, statusEvents] = await Promise.all([
    db.select().from(lotTests).where(sql`${lotTests.lotId} IN ${family}`).orderBy(asc(lotTests.createdAt)),
    db.select().from(lotMovements).where(sql`${lotMovements.lotId} IN ${family}`).orderBy(asc(lotMovements.occurredAt)),
    db.select().from(lotDocuments).where(sql`${lotDocuments.lotId} IN ${family}`).orderBy(desc(lotDocuments.uploadedAt)),
    db.select().from(lotStatusEvents).where(sql`${lotStatusEvents.lotId} IN ${family}`).orderBy(asc(lotStatusEvents.createdAt)),
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
    // Tests live on the version they were recorded against; a corrected record must still see them.
    const family = await lotFamilyIds(fresh.id);
    const tests = await db
      .select({ testType: lotTests.testType, passed: lotTests.passed })
      .from(lotTests)
      .where(sql`${lotTests.lotId} IN ${family}`);
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
  const family = await lotFamilyIds(lot.id);
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
          WHERE ${lotTests.lotId} IN ${family} AND ${lotTests.testType} = 'heavy_metal'
          ORDER BY ${lotTests.createdAt}, ${lotTests.id}
        )
      )`;
      break;
    default:
      break;
  }

  await db.batch([db.insert(lotTests).values(row), db.update(lots).set(summary).where(and(eq(lots.id, lot.id), isNull(lots.supersededById)))]);
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
  const family = await lotFamilyIds(lot.id);
  await db.batch([
    db
      .update(lotDocuments)
      .set({ supersededAt: now })
      .where(and(sql`${lotDocuments.lotId} IN ${family}`, eq(lotDocuments.documentType, type), isNull(lotDocuments.supersededAt))),
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
      .where(and(eq(lots.id, lot.id), isNull(lots.supersededById))),
  ]);
}

/** Admin records or corrects the landed cost of a lot; the change is an event on the lot. */
export async function setLotCost(lot: Lot, costCents: number, costNote: string | null, staff: StaffPrincipal): Promise<void> {
  const db = getDb();
  const now = new Date();
  const was = lot.costCents === null ? 'not recorded' : `$${(lot.costCents / 100).toFixed(2)}`;
  await db.batch([
    db.update(lots).set({ costCents, costNote, updatedAt: now }).where(and(eq(lots.id, lot.id), isNull(lots.supersededById))),
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

/* ------------------------------------------------------------------------ */
/* Corrections                                                               */
/* ------------------------------------------------------------------------ */

export type CorrectionResult = { ok: true; lotNumber: string; newId: string } | { ok: false; error: string };

/** The current record as intake input, for validating a correction against the same rules as a receipt. */
export function lotToIntakeInput(lot: Lot): LotIntakeInput {
  const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
  return {
    lotNumber: lot.lotNumber,
    productCode: lot.productCode,
    manufacturerName: lot.manufacturerName,
    manufacturerAddress: lot.manufacturerAddress,
    supplierName: lot.supplierName,
    countryOfOrigin: lot.countryOfOrigin,
    entryNumber: lot.entryNumber,
    manufactureDate: day(lot.manufactureDate),
    receivedAt: day(lot.receivedAt) ?? '',
    quantityReceived: lot.quantityReceived ?? '',
    storageLocation: lot.storageLocation,
    storageCondition: lot.storageCondition,
    retestDate: day(lot.retestDate),
  };
}

/**
 * Correct a lot record. The existing row is never edited: a new row carrying
 * the corrected values becomes the current record and the old row points at
 * it through supersededById. Tests, documents, movements and events stay on
 * the version they were written against and are read as one family.
 *
 * Guarded: the old row is claimed first (superseded_by_id must still be
 * NULL); the new row and its event are inserted only where that claim
 * landed, so two simultaneous corrections cannot both become current.
 *
 * Status, release decision and analytical summary carry over unchanged — a
 * correction is not a disposition. It is refused when it would leave a
 * released lot without what its release required, or would change the
 * quantity received after material has already left the lot.
 */
export async function correctLot(
  current: Lot,
  validated: LotCorrectionValidation & { ok: true },
  staff: StaffPrincipal,
): Promise<CorrectionResult> {
  const v = validated.value;
  if (validated.changes.some((c) => c.field === 'quantityReceived') && current.quantityRemaining !== current.quantityReceived) {
    return { ok: false, error: 'Quantity received cannot be corrected after material has been shipped from this lot. Record an adjustment movement instead.' };
  }
  if (current.status === 'released' && (!v.manufacturerName || !v.manufacturerAddress)) {
    return { ok: false, error: 'A released lot must keep a manufacturer name and address (16 CCR 1736.9(d)). Hold the lot first if this is a genuine correction.' };
  }
  const db = getDb();
  const now = new Date();
  const newId = `lot_${randomToken().slice(0, 24)}`;
  const overrides: Partial<Record<keyof Lot, unknown>> = {
    id: newId,
    manufacturerName: v.manufacturerName ?? null,
    manufacturerAddress: v.manufacturerAddress ?? null,
    supplierName: v.supplierName ?? null,
    countryOfOrigin: v.countryOfOrigin ?? null,
    entryNumber: v.entryNumber ?? null,
    manufactureDate: v.manufactureDateValue,
    receivedAt: v.receivedAtDate,
    quantityReceived: v.quantityReceived,
    // Copied live by the INSERT…SELECT unless the received quantity itself is being corrected,
    // so a shipment landing between the read and this batch is never undone.
    ...(validated.changes.some((c) => c.field === 'quantityReceived') ? { quantityRemaining: v.quantityReceived } : {}),
    storageLocation: v.storageLocation ?? null,
    storageCondition: v.storageCondition ?? null,
    retestDate: v.retestDateValue,
    supersededById: null,
    lastMovementId: null,
    createdAt: now,
    updatedAt: now,
  };
  const columns = getTableColumns(lots);
  const projection = Object.fromEntries(
    Object.entries(columns).map(([key, col]) => {
      if (key in overrides) {
        const raw = overrides[key as keyof Lot];
        const driver = raw === null || raw === undefined ? null : (col as { mapToDriverValue: (v: unknown) => unknown }).mapToDriverValue(raw);
        return [key, sql`${driver}`.as(col.name)];
      }
      return [key, col];
    }),
  ) as unknown as typeof columns; // runtime: aliased SQL for overridden columns, the column itself otherwise
  const quantityChanging = validated.changes.some((c) => c.field === 'quantityReceived');
  const [claimed] = await db.batch([
    db
      .update(lots)
      .set({ supersededById: newId, updatedAt: now })
      .where(
        and(
          eq(lots.id, current.id),
          isNull(lots.supersededById),
          // The nothing-shipped rule re-checked at write time, not from the earlier read.
          quantityChanging ? sql`${lots.quantityRemaining} = ${lots.quantityReceived}` : sql`1 = 1`,
        ),
      )
      .returning({ id: lots.id }),
    db.insert(lots).select(
      db
        .select(projection)
        .from(lots)
        .where(and(eq(lots.id, current.id), eq(lots.supersededById, newId))),
    ),
    db.insert(lotStatusEvents).select(
      db
        .select({
          id: sql<string>`${`lse_${randomToken().slice(0, 24)}`}`.as('id'),
          lotId: lots.id,
          fromStatus: lots.status,
          toStatus: lots.status,
          reason: sql<string>`${`${describeChanges(validated.changes)} — ${validated.reason}`.slice(0, 1000)}`.as('reason'),
          decidedBy: sql<string>`${recordedBy(staff)}`.as('decided_by'),
          kind: sql<string>`'correction'`.as('kind'),
          createdAt: sql<number>`${Math.floor(now.getTime() / 1000)}`.as('created_at'),
        })
        .from(lots)
        .where(eq(lots.id, newId)),
    ),
  ]);
  if (!claimed || claimed.length === 0) return { ok: false, error: 'This lot record changed while you were editing (corrected, or material shipped). Reload and check the current record.' };
  return { ok: true, lotNumber: current.lotNumber, newId };
}
