import { SQL, and, asc, desc, eq, getTableColumns, is, isNull, sql } from 'drizzle-orm';
import type { SQLiteTable, SQLiteUpdateSetSource } from 'drizzle-orm/sqlite-core';
import { getDb } from '@/db';
import { inventoryReservations } from '@/db/commerce-schema';
import {
  lotDocuments,
  lotMovements,
  lotStatusEvents,
  lotTests,
  lots,
  orders,
  products,
  purchaseOrderEvents,
  purchaseOrderLines,
  purchaseOrders,
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
  validateDisposition,
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
import { adjustQuantity, compareQuantities, quantitiesComparable, quantityRatio, receiptCostCents } from '@/lib/procurement-quantities';
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
  const productCurrent = sql`EXISTS (SELECT 1 FROM products p WHERE p.id = ${product.id}
    AND p.code = ${product.code} AND p.name = ${product.name} AND p.cas_number = ${product.casNumber}
    AND p.visibility != 'withdrawn')`;
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
    receipt = receiptStatements(expected.lineId, id, validated.quantityReceived, staff, now, expected, productCurrent);
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
    containerSize: validated.containerSize ?? null,
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
    direction: 'increase',
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
      const [created] = await db.batch([
        insertWhere(lots, lotValues, products, and(eq(products.id, product.id), productCurrent)!).returning({ id: lots.id }),
        insertWhere(lotMovements, movementValues, lots, eq(lots.id, id)),
        ...(costEventValues ? [insertWhere(lotStatusEvents, costEventValues, lots, eq(lots.id, id))] : []),
      ] as unknown as Parameters<typeof db.batch>[0]);
      if (!created || (created as unknown[]).length === 0) return { ok: false, error: 'The catalog product changed during intake. Reload and review again.' };
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
        return { ok: false, error: 'The purchase order, receipt quantities, allocated costs or catalog changed during intake. Reload and review again.' };
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
export function queuePage(raw?: string): number {
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? Math.min(n, 100000) : 1;
}

export type LotQueueOptions = { query?: string; status?: string; page?: number };
export async function listLots(options: LotQueueOptions = {}): Promise<{ rows: Lot[]; hasNext: boolean }> {
  const db = getDb();
  const search = (options.query ?? '').trim().slice(0, 120).toLowerCase();
  const matching = search
    ? sql`instr(lower(${lots.lotNumber} || ' ' || ${lots.productName} || ' ' || ${lots.productCode} || ' ' || coalesce(${lots.manufacturerName}, '')), ${search}) > 0`
    : undefined;
  const status = options.status && options.status !== 'all' ? eq(lots.status, options.status) : undefined;
  const rows = await db.select().from(lots)
    .where(and(isNull(lots.supersededById), matching, status))
    .orderBy(desc(lots.receivedAt), asc(lots.lotNumber))
    .limit(51).offset((queuePage(String(options.page ?? 1)) - 1) * 50);
  return { rows: rows.slice(0, 50), hasNext: rows.length > 50 };
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
    db.select().from(lotTests).where(sql`${lotTests.lotId} IN (SELECT value FROM json_each(${JSON.stringify(family)}))`).orderBy(asc(lotTests.createdAt)),
    db.select().from(lotMovements).where(sql`${lotMovements.lotId} IN (SELECT value FROM json_each(${JSON.stringify(family)}))`).orderBy(asc(lotMovements.occurredAt)),
    db.select().from(lotDocuments).where(sql`${lotDocuments.lotId} IN (SELECT value FROM json_each(${JSON.stringify(family)}))`).orderBy(desc(lotDocuments.uploadedAt)),
    db.select().from(lotStatusEvents).where(sql`${lotStatusEvents.lotId} IN (SELECT value FROM json_each(${JSON.stringify(family)}))`).orderBy(asc(lotStatusEvents.createdAt)),
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
  if (!fresh || fresh.id !== lot.id || fresh.status !== lot.status) return stale;
  const validation = validateDisposition({ decision, reason }, fresh.status);
  if (!validation.ok) return { ok: false, error: 'This lot decision is not allowed. Reload and review the reason and status.' };

  let releaseGuard: SQL = sql`1 = 1`;

  if (decision === 'release') {
    // Tests live on the version they were recorded against; a corrected record must still see them.
    const family = await lotFamilyIds(fresh.id);
    const tests = await db
      .select({ testType: lotTests.testType, passed: lotTests.passed })
      .from(lotTests)
      .where(sql`${lotTests.lotId} IN (SELECT value FROM json_each(${JSON.stringify(family)}))`);
    const blockers = releaseBlockers(fresh, tests);
    if (blockers.length) return { ok: false, error: `Cannot release: ${blockers.join(' ')}` };
    // Tests are append-only. Recheck the reviewed evidence at write time so a
    // simultaneous result/document/correction cannot invalidate the decision.
    releaseGuard = sql`
      ${lots.manufacturerName} IS ${fresh.manufacturerName}
      AND ${lots.manufacturerAddress} IS ${fresh.manufacturerAddress}
      AND ${lots.coaKey} IS ${fresh.coaKey}
      AND ${lots.identityConfirmed} = 1
      AND ${lots.purityResult} IS ${fresh.purityResult}
      AND ${lots.quantityRemaining} IS ${fresh.quantityRemaining}
      AND (SELECT count(*) FROM ${lotTests} WHERE ${lotTests.lotId} IN (SELECT value FROM json_each(${JSON.stringify(family)}))) = ${tests.length}
    `;
  }

  const update =
    decision === 'release'
      ? { status: target, releasedBy: by, releasedAt: now, statusReason: null, updatedAt: now }
      : { status: target, statusReason: reason, updatedAt: now };

  // The decision and its audit event must commit or fail together. changes()
  // refers to the immediately preceding UPDATE within this atomic batch.
  const [changed] = await db.batch([
    db.update(lots).set(update)
      .where(and(eq(lots.id, fresh.id), isNull(lots.supersededById), eq(lots.status, fresh.status), releaseGuard))
      .returning({ id: lots.id }),
    insertWhere(lotStatusEvents, {
      id: `evt_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`,
      lotId: fresh.id, fromStatus: fresh.status, toStatus: target,
      reason, decidedBy: by, createdAt: now,
    }, lots, sql`${lots.id} = ${fresh.id} AND changes() = 1`),
  ]);
  if (!changed.length) return stale;
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
 * Hold a released lot before recording new evidence, then make a fresh named
 * release decision. A failed result must never leave material sellable.
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
          WHERE ${lotTests.lotId} IN (SELECT value FROM json_each(${JSON.stringify(family)})) AND ${lotTests.testType} = 'heavy_metal'
          ORDER BY ${lotTests.createdAt}, ${lotTests.id}
        )
      )`;
      break;
    default:
      break;
  }

  const [inserted] = await db.batch([
    insertWhere(lotTests, row, lots, sql`${lots.id} = ${lot.id} AND ${lots.supersededById} IS NULL AND ${lots.status} != 'released'`).returning({ id: lotTests.id }),
    db.update(lots).set(summary).where(and(eq(lots.id, lot.id), isNull(lots.supersededById), sql`changes() = 1`)),
  ]);
  if (!inserted.length) throw new Error('Hold a released lot before recording results, or reload a corrected lot.');
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
  const column = KEY_COLUMN[type];
  // The unique upload key is the claim marker. A correction that wins first
  // must not leave a history entry saying a document was attached when it was not.
  const claimed = sql`EXISTS (SELECT 1 FROM ${lots} WHERE ${lots.id} = ${lot.id} AND ${lots.supersededById} IS NULL AND ${lots[column]} = ${stored.key})`;
  // The replacement's id is needed before the update that supersedes the old
  // rows, so the chain records what replaced what rather than only that
  // something did (chapter 10 c10-supersede).
  const documentId = `doc_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
  const [changed] = await db.batch([
    db.update(lots).set({ [column]: stored.key, updatedAt: now })
      .where(and(eq(lots.id, lot.id), isNull(lots.supersededById)))
      .returning({ id: lots.id }),
    db
      .update(lotDocuments)
      .set({ supersededAt: now, supersededById: documentId })
      .where(and(sql`${lotDocuments.lotId} IN (SELECT value FROM json_each(${JSON.stringify(family)}))`, eq(lotDocuments.documentType, type), isNull(lotDocuments.supersededAt), claimed)),
    insertWhere(lotDocuments, {
      id: documentId,
      lotId: lot.id,
      documentType: type,
      objectKey: stored.key,
      contentType: stored.contentType,
      sizeBytes: stored.size,
      originalName,
      uploadedBy: recordedBy(staff),
      uploadedAt: stored.uploadedAt,
      sha256: stored.sha256,
      createdAt: now,
    }, lots, sql`${lots.id} = ${lot.id} AND ${claimed}`),
  ]);
  if (!changed.length) throw new Error('The lot was corrected during upload. Reload and attach the document to the current record.');
}

/** Admin records or corrects the landed cost of a lot; the change is an event on the lot. */
export async function setLotCost(lot: Lot, costCents: number, costNote: string | null, staff: StaffPrincipal): Promise<void> {
  const db = getDb();
  const now = new Date();
  const was = lot.costCents === null ? 'not recorded' : `$${(lot.costCents / 100).toFixed(2)}`;
  const [changed] = await db.batch([
    db.update(lots).set({ costCents, costNote, updatedAt: now })
      .where(and(eq(lots.id, lot.id), isNull(lots.supersededById), eq(lots.status, lot.status), sql`${lots.costCents} IS ${lot.costCents}`))
      .returning({ id: lots.id }),
    insertWhere(lotStatusEvents, {
      id: `evt_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`,
      lotId: lot.id,
      fromStatus: lot.status,
      toStatus: lot.status,
      reason: `Landed cost recorded: $${(costCents / 100).toFixed(2)}${costNote ? ` (${costNote})` : ''}; was ${was}.`,
      decidedBy: recordedBy(staff),
      kind: 'cost',
      createdAt: now,
    }, lots, sql`${lots.id} = ${lot.id} AND changes() = 1`),
  ]);
  if (!changed.length) throw new Error('The lot changed while recording cost. Reload and review the current record.');
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
    containerSize: lot.containerSize,
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
  const quantityChanging = validated.changes.some((c) => c.field === 'quantityReceived');
  // The received quantity sets how much can be sold. Raising a released lot through an
  // inventory movement already requires a hold first, so a correction must too.
  if (quantityChanging && current.status === 'released') {
    return { ok: false, error: 'Put the lot on hold before correcting its received quantity, then release it again once the record is right.' };
  }
  if (quantityChanging && current.quantityRemaining !== current.quantityReceived) {
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
    containerSize: v.containerSize ?? null,
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
  // A corrected received quantity must reach the purchase-order line the lot arrived against,
  // or the two records diverge: the line total, its closure and the order status are recomputed
  // in the same batch, guarded on the claim.
  const lineStatements: unknown[] = [];
  let lineGuard: SQL = sql`1 = 1`;
  if (quantityChanging && current.purchaseOrderLineId) {
    const [line] = await db
      .select({ l: purchaseOrderLines, poId: purchaseOrders.id, poStatus: purchaseOrders.status, poTransition: purchaseOrders.lastTransitionId })
      .from(purchaseOrderLines)
      .innerJoin(purchaseOrders, eq(purchaseOrderLines.purchaseOrderId, purchaseOrders.id))
      .where(eq(purchaseOrderLines.id, current.purchaseOrderLineId))
      .limit(1);
    if (line) {
      const newTotal = adjustQuantity(line.l.receivedQuantity, current.quantityReceived ?? '', v.quantityReceived);
      if (!newTotal) {
        return { ok: false, error: `The corrected quantity cannot be reconciled with purchase order line ${line.l.productCode} ${line.l.quantity} (${line.l.receivedQuantity ?? 'nothing'} received).` };
      }
      if (line.poStatus !== 'partially_received' && line.poStatus !== 'received') {
        return { ok: false, error: `Purchase order ${line.l.productCode} line is on an order that is ${line.poStatus}; the received quantity cannot be corrected against it.` };
      }
      const complete = compareQuantities(newTotal, line.l.quantity) >= 0;
      // The lot claim (below) also requires the line to be exactly as read, so a receipt landing
      // between the read and this batch makes the whole correction a no-op instead of half-applying.
      lineGuard = sql`EXISTS (SELECT 1 FROM ${purchaseOrderLines} WHERE ${purchaseOrderLines.id} = ${line.l.id}
        AND ${purchaseOrderLines.receivedCount} = ${line.l.receivedCount} AND ${purchaseOrderLines.receivedQuantity} IS ${line.l.receivedQuantity}
        AND ${purchaseOrderLines.closedAt} IS ${line.l.closedAt ? Math.floor(line.l.closedAt.getTime() / 1000) : null})
        AND EXISTS (SELECT 1 FROM ${purchaseOrders} WHERE ${purchaseOrders.id} = ${line.poId}
          AND ${purchaseOrders.status} = ${line.poStatus} AND ${purchaseOrders.lastTransitionId} IS ${line.poTransition})`;
      const claimed = sql`EXISTS (SELECT 1 FROM ${lots} WHERE ${lots.id} = ${current.id} AND ${lots.supersededById} = ${newId})`;
      lineStatements.push(
        db
          .update(purchaseOrderLines)
          .set({ receivedQuantity: newTotal, closedAt: complete ? (line.l.closedAt ?? now) : null })
          .where(and(eq(purchaseOrderLines.id, line.l.id), claimed)),
        db
          .update(purchaseOrders)
          .set({
            status: sql`CASE WHEN (SELECT count(*) FROM purchase_order_lines l WHERE l.purchase_order_id = purchase_orders.id AND l.closed_at IS NULL) = 0 THEN 'received' ELSE 'partially_received' END`,
            updatedAt: now,
          })
          .where(and(eq(purchaseOrders.id, line.poId), sql`${purchaseOrders.status} IN ('partially_received', 'received')`, claimed)),
        db.insert(purchaseOrderEvents).select(
          db
            .select({
              id: sql<string>`${`poe_${randomToken().slice(0, 24)}`}`.as('id'),
              purchaseOrderId: purchaseOrders.id,
              fromStatus: sql<string>`'correction'`.as('from_status'),
              toStatus: purchaseOrders.status,
              note: sql<string>`${`Lot ${current.lotNumber} corrected: ${current.quantityReceived} → ${v.quantityReceived}; line total now ${newTotal}${complete ? ' (line complete)' : ' (line reopened)'}`}`.as('note'),
              actor: sql<string>`${recordedBy(staff)}`.as('actor'),
              createdAt: sql<number>`${Math.floor(now.getTime() / 1000)}`.as('created_at'),
            })
            .from(purchaseOrders)
            .where(and(eq(purchaseOrders.id, line.poId), claimed)),
        ),
      );
    } else {
      return { ok: false, error: 'The linked purchase-order line is missing. Reconcile the receipt before correcting its quantity.' };
    }
  }
  const [claimed] = await db.batch([
    db
      .update(lots)
      .set({ supersededById: newId, updatedAt: now })
      .where(
        and(
          eq(lots.id, current.id),
          isNull(lots.supersededById),
          eq(lots.status, current.status),
          // The nothing-shipped rule re-checked at write time, not from the earlier read.
          quantityChanging ? sql`${lots.quantityRemaining} = ${lots.quantityReceived}` : sql`1 = 1`,
          lineGuard,
        ),
      )
      .returning({ id: lots.id }),
    db.insert(lots).select(
      db
        .select(projection)
        .from(lots)
        .where(and(eq(lots.id, current.id), eq(lots.supersededById, newId))),
    ),
    // Stock held for open orders follows the record it was held against. Without this
    // a correction stranded every reservation on the superseded row: paid orders could
    // not ship, and orders awaiting payment were cancelled with a refund due once paid.
    db
      .update(inventoryReservations)
      .set({ lotId: newId })
      .where(
        and(
          eq(inventoryReservations.lotId, current.id),
          sql`${inventoryReservations.orderId} IN (SELECT ${orders.id} FROM ${orders} WHERE ${orders.status} IN ('submitted', 'awaiting_payment', 'paid', 'fulfilling'))`,
          sql`EXISTS (SELECT 1 FROM ${lots} WHERE ${lots.id} = ${current.id} AND ${lots.supersededById} = ${newId})`,
        ),
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
    ...lineStatements,
  ] as unknown as Parameters<typeof db.batch>[0]);
  if (!claimed || (claimed as unknown[]).length === 0) return { ok: false, error: 'This lot record changed while you were editing (corrected, or material shipped). Reload and check the current record.' };
  return { ok: true, lotNumber: current.lotNumber, newId };
}
