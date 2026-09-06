import { and, asc, desc, eq, isNull, sql, type SQL } from 'drizzle-orm';
import { getDb } from '@/db';
import {
  lots,
  purchaseOrderEvents,
  purchaseOrderLines,
  purchaseOrders,
  supplierEvents,
  suppliers,
  type PurchaseOrder,
  type PurchaseOrderEvent,
  type PurchaseOrderLine,
  type Supplier,
  type SupplierEvent,
} from '@/db/schema';
import { getProductByCode } from '@/lib/catalog-data';
import { conditionalInsert } from '@/lib/conditional-insert';
import { sumQuantities } from '@/lib/lot-quantities';
import { compareQuantities } from '@/lib/procurement-quantities';
import { PO_TRANSITIONS, formatPoNumber, landedCostByLine, type PoStatus, type PoValidation, type SupplierValidation } from '@/lib/procurement-rules';
import type { StaffPrincipal } from '@/lib/staff-auth';
import { randomToken } from '@/lib/staff-auth-core';

/**
 * Suppliers and purchase orders. Every change is an append-only event naming
 * the actor. A purchase order line is an "expected receipt": lot intake can be
 * recorded against it, which carries the supplier, the ordered quantity and
 * the landed cost (line cost plus its share of freight and duty) onto the lot
 * and closes the line when everything ordered has arrived.
 */

const id = (prefix: string) => `${prefix}_${randomToken().slice(0, 24)}`;
const by = (staff: StaffPrincipal) => `${staff.name} (${staff.id})`;
type Ok<T> = Extract<T, { ok: true }>;
export type WriteResult = { ok: true; id: string } | { ok: false; error: string };

/* ------------------------------------------------------------------------ */
/* Suppliers                                                                 */
/* ------------------------------------------------------------------------ */

export async function listSuppliers(): Promise<(Supplier & { openOrders: number })[]> {
  const db = getDb();
  const rows = await db
    .select({
      s: suppliers,
      openOrders: sql<number>`(SELECT count(*) FROM purchase_orders p WHERE p.supplier_id = suppliers.id AND p.status IN ('draft', 'sent', 'partially_received'))`.mapWith(Number).as('open_orders'),
    })
    .from(suppliers)
    .orderBy(desc(suppliers.active), asc(suppliers.name));
  return rows.map((r) => ({ ...r.s, openOrders: r.openOrders }));
}

export async function getSupplier(supplierId: string): Promise<{ supplier: Supplier; events: SupplierEvent[]; orders: PurchaseOrder[] } | null> {
  const db = getDb();
  const [supplier] = await db.select().from(suppliers).where(eq(suppliers.id, supplierId)).limit(1);
  if (!supplier) return null;
  const [events, orders] = await Promise.all([
    db.select().from(supplierEvents).where(eq(supplierEvents.supplierId, supplierId)).orderBy(desc(supplierEvents.createdAt)).limit(100),
    db.select().from(purchaseOrders).where(eq(purchaseOrders.supplierId, supplierId)).orderBy(desc(purchaseOrders.createdAt)).limit(100),
  ]);
  return { supplier, events, orders };
}

export async function createSupplier(v: Ok<SupplierValidation>['value'], staff: StaffPrincipal): Promise<WriteResult> {
  const db = getDb();
  const now = new Date();
  const supplierId = id('sup');
  try {
    await db.batch([
      db.insert(suppliers).values({ id: supplierId, ...v, createdBy: staff.id, createdAt: now, updatedAt: now }),
      db.insert(supplierEvents).values({ id: id('spe'), supplierId, action: 'create', detail: v.name, actor: by(staff), createdAt: now }),
    ]);
  } catch (error) {
    if (/UNIQUE constraint failed/i.test(error instanceof Error ? error.message : String(error))) return { ok: false, error: 'A supplier with that name already exists.' };
    throw error;
  }
  return { ok: true, id: supplierId };
}

export async function updateSupplier(current: Supplier, v: Ok<SupplierValidation>['value'], staff: StaffPrincipal): Promise<WriteResult> {
  const db = getDb();
  const now = new Date();
  const marker = id('chg');
  const changed = (Object.keys(v) as (keyof typeof v)[]).filter((k) => (current[k] ?? null) !== (v[k] ?? null));
  if (changed.length === 0) return { ok: false, error: 'Nothing changed.' };
  try {
    const [updated] = await db.batch([
      db.update(suppliers).set({ ...v, updatedAt: now, lastChangeId: marker })
        .where(and(eq(suppliers.id, current.id), sql`${suppliers.lastChangeId} IS ${current.lastChangeId}`))
        .returning({ id: suppliers.id }),
      db.insert(supplierEvents).select(
        db
          .select({
            id: sql<string>`${id('spe')}`.as('id'),
            supplierId: suppliers.id,
            action: sql<string>`'update'`.as('action'),
            detail: sql<string>`${`changed ${changed.join(', ')}`}`.as('detail'),
            actor: sql<string>`${by(staff)}`.as('actor'),
            createdAt: sql<number>`${Math.floor(now.getTime() / 1000)}`.as('created_at'),
          })
          .from(suppliers)
          .where(and(eq(suppliers.id, current.id), eq(suppliers.lastChangeId, marker))),
      ),
    ]);
    if (!updated.length) return { ok: false, error: 'The supplier changed while you were editing. Reload and review again.' };
  } catch (error) {
    if (/UNIQUE constraint failed/i.test(error instanceof Error ? error.message : String(error))) return { ok: false, error: 'Another supplier already has that name.' };
    throw error;
  }
  return { ok: true, id: current.id };
}

/** Qualification is a named decision with a reason; suspension ends the ability to raise orders. */
export async function setSupplierQualification(current: Supplier, to: 'qualified' | 'suspended', reason: string, staff: StaffPrincipal): Promise<WriteResult> {
  if (!reason.trim()) return { ok: false, error: 'Give the reason (what was reviewed, or why the supplier is suspended).' };
  if (current.qualificationStatus === to) return { ok: false, error: `The supplier is already ${to}.` };
  const db = getDb();
  const now = new Date();
  const marker = id('chg');
  const action = to === 'suspended' ? 'suspend' : current.qualificationStatus === 'suspended' ? 'requalify' : 'qualify';
  const [updated] = await db.batch([
    db
      .update(suppliers)
      .set({ qualificationStatus: to, qualifiedBy: to === 'qualified' ? by(staff) : current.qualifiedBy, qualifiedAt: to === 'qualified' ? now : current.qualifiedAt, updatedAt: now, lastChangeId: marker })
      .where(and(eq(suppliers.id, current.id), eq(suppliers.qualificationStatus, current.qualificationStatus), sql`${suppliers.lastChangeId} IS ${current.lastChangeId}`))
      .returning({ id: suppliers.id }),
    db.insert(supplierEvents).select(
      db
        .select({
          id: sql<string>`${id('spe')}`.as('id'),
          supplierId: suppliers.id,
          action: sql<string>`${action}`.as('action'),
          detail: sql<string>`${reason.trim().slice(0, 500)}`.as('detail'),
          actor: sql<string>`${by(staff)}`.as('actor'),
          createdAt: sql<number>`${Math.floor(now.getTime() / 1000)}`.as('created_at'),
        })
        .from(suppliers)
        .where(and(eq(suppliers.id, current.id), eq(suppliers.lastChangeId, marker))),
    ),
  ]);
  if (!updated || updated.length === 0) return { ok: false, error: 'The supplier changed while you were editing. Reload and try again.' };
  return { ok: true, id: current.id };
}

/* ------------------------------------------------------------------------ */
/* Purchase orders                                                           */
/* ------------------------------------------------------------------------ */

export type PoDetail = { order: PurchaseOrder; lines: (PurchaseOrderLine & { landedCostCents: number; lots: { lotNumber: string; quantityReceived: string | null; status: string }[] })[]; events: PurchaseOrderEvent[]; supplier: Supplier | null };

export async function listPurchaseOrders(): Promise<(PurchaseOrder & { lineCount: number; materialCents: number; openLineCostCents: number })[]> {
  const db = getDb();
  const rows = await db
    .select({
      p: purchaseOrders,
      lineCount: sql<number>`(SELECT count(*) FROM purchase_order_lines l WHERE l.purchase_order_id = purchase_orders.id)`.mapWith(Number).as('line_count'),
      materialCents: sql<number>`(SELECT COALESCE(sum(l.line_cost_cents), 0) FROM purchase_order_lines l WHERE l.purchase_order_id = purchase_orders.id)`.mapWith(Number).as('material_cents'),
      openLineCostCents: sql<number>`(SELECT COALESCE(sum(l.line_cost_cents), 0) FROM purchase_order_lines l WHERE l.purchase_order_id = purchase_orders.id AND l.closed_at IS NULL)`.mapWith(Number).as('open_line_cost_cents'),
    })
    .from(purchaseOrders)
    .orderBy(desc(purchaseOrders.createdAt));
  return rows.map((r) => ({ ...r.p, lineCount: r.lineCount, materialCents: r.materialCents, openLineCostCents: r.openLineCostCents }));
}

export async function getPurchaseOrder(poNumber: string): Promise<PoDetail | null> {
  const db = getDb();
  const [order] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.poNumber, poNumber)).limit(1);
  if (!order) return null;
  const [lineRows, events, supplierRows] = await Promise.all([
    db.select().from(purchaseOrderLines).where(eq(purchaseOrderLines.purchaseOrderId, order.id)).orderBy(asc(purchaseOrderLines.lineNo)),
    db.select().from(purchaseOrderEvents).where(eq(purchaseOrderEvents.purchaseOrderId, order.id)).orderBy(asc(purchaseOrderEvents.createdAt)),
    db.select().from(suppliers).where(eq(suppliers.id, order.supplierId)).limit(1),
  ]);
  const landed = landedCostByLine(lineRows, order.freightCents, order.dutyCents);
  const lineIds = lineRows.map((l) => l.id);
  const lotRows = lineIds.length
    ? await db
        .select({ lineId: lots.purchaseOrderLineId, lotNumber: lots.lotNumber, quantityReceived: lots.quantityReceived, status: lots.status })
        .from(lots)
        .where(and(sql`${lots.purchaseOrderLineId} IN (SELECT value FROM json_each(${JSON.stringify(lineIds)}))`, isNull(lots.supersededById)))
    : [];
  return {
    order,
    lines: lineRows.map((l) => ({ ...l, landedCostCents: landed.get(l.id) ?? l.lineCostCents, lots: lotRows.filter((r) => r.lineId === l.id).map(({ lotNumber, quantityReceived, status }) => ({ lotNumber, quantityReceived, status })) })),
    events,
    supplier: supplierRows[0] ?? null,
  };
}

/** Next PO number for today: PO-YYMMDD-NNNN, from the highest existing sequence for the day. */
async function nextPoNumber(now: Date): Promise<string> {
  const db = getDb();
  const prefix = formatPoNumber(now, 0).slice(0, -4);
  const [row] = await db
    .select({ max: sql<string | null>`max(${purchaseOrders.poNumber})` })
    .from(purchaseOrders)
    .where(sql`${purchaseOrders.poNumber} LIKE ${`${prefix}%`}`);
  const last = row?.max ? Number(row.max.slice(-4)) : 0;
  return formatPoNumber(now, last + 1);
}

export async function createPurchaseOrder(v: Ok<PoValidation>['value'], staff: StaffPrincipal): Promise<{ ok: true; poNumber: string } | { ok: false; error: string }> {
  const db = getDb();
  const [supplier] = await db.select().from(suppliers).where(eq(suppliers.id, v.supplierId)).limit(1);
  if (!supplier || !supplier.active) return { ok: false, error: 'Unknown supplier.' };
  if (supplier.qualificationStatus !== 'qualified') return { ok: false, error: `${supplier.name} is ${supplier.qualificationStatus}. Qualify the supplier before raising an order.` };
  const lineRows = [];
  for (const [i, l] of v.lines.entries()) {
    const product = await getProductByCode(l.productCode);
    if (!product) return { ok: false, error: `Line ${i + 1}: product ${l.productCode} is not in the catalog.` };
    if (product.visibility === 'withdrawn') return { ok: false, error: `Line ${i + 1}: ${l.productCode} is withdrawn.` };
    lineRows.push({ id: id('pol'), lineNo: i + 1, productCode: product.code, productName: product.name, quantity: l.quantity, lineCostCents: l.lineCostCents });
  }
  const now = new Date();
  const eligible = and(
    eq(suppliers.id, supplier.id), eq(suppliers.active, true), eq(suppliers.qualificationStatus, 'qualified'),
    eq(suppliers.name, supplier.name), sql`${suppliers.lastChangeId} IS ${supplier.lastChangeId}`,
    sql`NOT EXISTS (SELECT 1 FROM json_each(${JSON.stringify(lineRows)}) expected
      WHERE NOT EXISTS (SELECT 1 FROM products p
        WHERE p.code = json_extract(expected.value, '$.productCode')
        AND p.name = json_extract(expected.value, '$.productName') AND p.visibility != 'withdrawn'))`,
  )!;
  // Retry once on a number collision (two orders raised in the same second).
  for (let attempt = 0; attempt < 2; attempt++) {
    const poNumber = await nextPoNumber(now);
    const poId = id('po');
    try {
      const parentExists = eq(purchaseOrders.id, poId);
      const [created] = await db.batch([
        conditionalInsert(purchaseOrders, {
          id: poId,
          poNumber,
          supplierId: supplier.id,
          supplierName: supplier.name,
          status: 'draft',
          orderedOn: v.orderedOn,
          expectedOn: v.expectedOn,
          freightCents: v.freightCents,
          dutyCents: v.dutyCents,
          supplierReference: v.supplierReference,
          note: v.note,
          createdBy: staff.id,
          createdAt: now,
          updatedAt: now,
        }, suppliers, eligible).returning({ id: purchaseOrders.id }),
        ...lineRows.map((l) => conditionalInsert(purchaseOrderLines, { ...l, purchaseOrderId: poId, createdAt: now }, purchaseOrders, parentExists)),
        conditionalInsert(purchaseOrderEvents, { id: id('poe'), purchaseOrderId: poId, fromStatus: 'none', toStatus: 'draft', note: `${lineRows.length} line(s)`, actor: by(staff), createdAt: now }, purchaseOrders, parentExists),
      ]);
      if (!created.length) return { ok: false, error: 'The supplier or catalog changed while you were creating the order. Reload and review again.' };
      return { ok: true, poNumber };
    } catch (error) {
      if (attempt === 0 && /UNIQUE constraint failed/i.test(error instanceof Error ? error.message : String(error))) continue;
      throw error;
    }
  }
  return { ok: false, error: 'The order number could not be allocated. Try again.' };
}

/** Staff-driven status change (send, cancel). Receipt-driven changes happen in lot intake. */
export async function transitionPurchaseOrder(order: PurchaseOrder, to: PoStatus, staff: StaffPrincipal, note: string | null): Promise<WriteResult> {
  if (!PO_TRANSITIONS[order.status as PoStatus]?.includes(to)) return { ok: false, error: `An order that is ${order.status} cannot be moved to ${to}.` };
  const db = getDb();
  const now = new Date();
  const marker = id('pot');
  if (to === 'received' && !note?.trim()) return { ok: false, error: 'Closing an order short needs a reason (what was not delivered and why).' };
  const [changed] = await db.batch([
    db
      .update(purchaseOrders)
      .set({ status: to, lastTransitionId: marker, updatedAt: now, ...(to === 'sent' && !order.orderedOn ? { orderedOn: now } : {}) })
      .where(and(eq(purchaseOrders.id, order.id), eq(purchaseOrders.status, order.status),
        to === 'sent' ? sql`EXISTS (SELECT 1 FROM suppliers s WHERE s.id = ${purchaseOrders.supplierId}
          AND s.active = 1 AND s.qualification_status = 'qualified')
          AND EXISTS (SELECT 1 FROM purchase_order_lines l WHERE l.purchase_order_id = ${purchaseOrders.id})
          AND NOT EXISTS (SELECT 1 FROM purchase_order_lines l WHERE l.purchase_order_id = ${purchaseOrders.id}
            AND NOT EXISTS (SELECT 1 FROM products p WHERE p.code = l.product_code AND p.visibility != 'withdrawn'))` : undefined))
      .returning({ id: purchaseOrders.id }),
    // Closing short (or cancelling) closes every open line, guarded on the transition having landed.
    ...(to === 'received' || to === 'cancelled'
      ? [
          db
            .update(purchaseOrderLines)
            .set({ closedAt: now })
            .where(and(eq(purchaseOrderLines.purchaseOrderId, order.id), isNull(purchaseOrderLines.closedAt), sql`EXISTS (SELECT 1 FROM ${purchaseOrders} WHERE ${purchaseOrders.id} = ${order.id} AND ${purchaseOrders.lastTransitionId} = ${marker})`)),
        ]
      : []),
    db.insert(purchaseOrderEvents).select(
      db
        .select({
          id: sql<string>`${id('poe')}`.as('id'),
          purchaseOrderId: purchaseOrders.id,
          fromStatus: sql<string>`${order.status}`.as('from_status'),
          toStatus: sql<string>`${to}`.as('to_status'),
          note: sql<string | null>`${note}`.as('note'),
          actor: sql<string>`${by(staff)}`.as('actor'),
          createdAt: sql<number>`${Math.floor(now.getTime() / 1000)}`.as('created_at'),
        })
        .from(purchaseOrders)
        .where(and(eq(purchaseOrders.id, order.id), eq(purchaseOrders.lastTransitionId, marker))),
    ),
  ] as unknown as Parameters<typeof db.batch>[0]);
  if (!changed || (changed as unknown[]).length === 0) return { ok: false, error: 'The order, supplier eligibility or catalog changed while you were working. Reload and review again.' };
  return { ok: true, id: order.id };
}

/* ------------------------------------------------------------------------ */
/* Expected receipts (for lot intake)                                        */
/* ------------------------------------------------------------------------ */

export type ExpectedReceipt = {
  lineId: string;
  poNumber: string;
  supplierName: string;
  productCode: string;
  productName: string;
  quantity: string;
  receivedQuantity: string | null;
  receivedCount: number;
  /** Landed cost already carried by lots received against this line (current versions). */
  allocatedCents: number;
  landedCostCents: number;
  expectedOn: Date | null;
};

/** Open purchase-order lines (order sent, line not closed), with landed cost, for the intake form. */
export async function openExpectedReceipts(lineId?: string): Promise<ExpectedReceipt[]> {
  const db = getDb();
  const rows = await db
    .select({
      l: purchaseOrderLines,
      p: purchaseOrders,
      allocated: sql<number>`(SELECT COALESCE(sum(x.cost_cents), 0) FROM lots x WHERE x.purchase_order_line_id = purchase_order_lines.id AND x.superseded_by_id IS NULL)`.mapWith(Number).as('allocated'),
    })
    .from(purchaseOrderLines)
    .innerJoin(purchaseOrders, eq(purchaseOrderLines.purchaseOrderId, purchaseOrders.id))
    .where(and(isNull(purchaseOrderLines.closedAt), sql`${purchaseOrders.status} IN ('sent', 'partially_received')`, lineId ? eq(purchaseOrderLines.id, lineId) : undefined))
    .orderBy(asc(purchaseOrders.expectedOn), asc(purchaseOrders.poNumber), asc(purchaseOrderLines.lineNo));
  const byOrder = new Map<string, { id: string; lineCostCents: number }[]>();
  for (const r of rows) byOrder.set(r.p.id, [...(byOrder.get(r.p.id) ?? []), { id: r.l.id, lineCostCents: r.l.lineCostCents }]);
  // Landed cost must be allocated over ALL lines of the order, including closed ones.
  const allLinesByOrder = new Map<string, { id: string; lineCostCents: number }[]>();
  const orderIds = [...byOrder.keys()];
  if (orderIds.length) {
    const all = await db.select({ id: purchaseOrderLines.id, purchaseOrderId: purchaseOrderLines.purchaseOrderId, lineCostCents: purchaseOrderLines.lineCostCents }).from(purchaseOrderLines).where(sql`${purchaseOrderLines.purchaseOrderId} IN (SELECT value FROM json_each(${JSON.stringify(orderIds)}))`);
    for (const l of all) allLinesByOrder.set(l.purchaseOrderId, [...(allLinesByOrder.get(l.purchaseOrderId) ?? []), l]);
  }
  return rows.map((r) => {
    const landed = landedCostByLine(allLinesByOrder.get(r.p.id) ?? [], r.p.freightCents, r.p.dutyCents);
    return {
      lineId: r.l.id,
      poNumber: r.p.poNumber,
      supplierName: r.p.supplierName,
      productCode: r.l.productCode,
      productName: r.l.productName,
      quantity: r.l.quantity,
      receivedQuantity: r.l.receivedQuantity,
      receivedCount: r.l.receivedCount,
      allocatedCents: r.allocated,
      landedCostCents: landed.get(r.l.id) ?? r.l.lineCostCents,
      expectedOn: r.p.expectedOn,
    };
  });
}

export async function getExpectedReceipt(lineId: string): Promise<ExpectedReceipt | null> {
  const rows = await openExpectedReceipts(lineId);
  return rows[0] ?? null;
}

/**
 * Statements that record a receipt against an expected-receipt line, for
 * inclusion in the lot-intake batch. The line update goes FIRST and is
 * guarded on the received count the intake form was built from, stamping the
 * new lot's id; the lot row itself and everything after it are inserted only
 * where that stamp landed, so two people receiving against one line at once
 * cannot both succeed and the line's totals stay consistent.
 */
export function receiptStatements(lineId: string, lotId: string, quantityReceived: string, staff: StaffPrincipal, now: Date, expected: ExpectedReceipt, additionalGuard?: SQL) {
  const db = getDb();
  const total = sumQuantities(expected.receivedQuantity ? [expected.receivedQuantity, quantityReceived] : [quantityReceived]);
  if (!total) throw new Error('Receipt quantity cannot be added to the line total.');
  const complete = compareQuantities(total, expected.quantity) >= 0;
  const landed = sql`EXISTS (SELECT 1 FROM ${lots} WHERE ${lots.id} = ${lotId} AND ${lots.purchaseOrderLineId} = ${lineId})`;
  return {
    complete,
    total,
    /** Statement 1 of the intake batch. */
    claim: db
      .update(purchaseOrderLines)
      .set({ receivedQuantity: total, receivedCount: sql`${purchaseOrderLines.receivedCount} + 1`, lastReceiptLotId: lotId, ...(complete ? { closedAt: now } : {}) })
      .where(and(eq(purchaseOrderLines.id, lineId), eq(purchaseOrderLines.receivedCount, expected.receivedCount), isNull(purchaseOrderLines.closedAt),
        eq(purchaseOrderLines.quantity, expected.quantity), eq(purchaseOrderLines.productCode, expected.productCode),
        sql`${purchaseOrderLines.receivedQuantity} IS ${expected.receivedQuantity}`,
        sql`(SELECT COALESCE(sum(x.cost_cents), 0) FROM lots x
          WHERE x.purchase_order_line_id = ${purchaseOrderLines.id} AND x.superseded_by_id IS NULL) = ${expected.allocatedCents}`,
        sql`EXISTS (SELECT 1 FROM purchase_orders p WHERE p.id = ${purchaseOrderLines.purchaseOrderId}
          AND p.po_number = ${expected.poNumber} AND p.status IN ('sent', 'partially_received'))`, additionalGuard))
      .returning({ id: purchaseOrderLines.id }),
    /** Guard for the lot insert: the claim above stamped this lot id. */
    claimed: sql`${purchaseOrderLines.id} = ${lineId} AND ${purchaseOrderLines.lastReceiptLotId} = ${lotId}`,
    /** Statements after the lot insert, guarded on the lot row. */
    after: [
      db
        .update(purchaseOrders)
        .set({
          status: sql`CASE WHEN (SELECT count(*) FROM purchase_order_lines l WHERE l.purchase_order_id = purchase_orders.id AND l.closed_at IS NULL) = 0 THEN 'received' ELSE 'partially_received' END`,
          updatedAt: now,
        })
        .where(and(eq(purchaseOrders.poNumber, expected.poNumber), sql`${purchaseOrders.status} IN ('sent', 'partially_received')`, landed)),
      db.insert(purchaseOrderEvents).select(
        db
          .select({
            id: sql<string>`${id('poe')}`.as('id'),
            purchaseOrderId: purchaseOrders.id,
            fromStatus: sql<string>`'receipt'`.as('from_status'),
            toStatus: purchaseOrders.status,
            note: sql<string>`${`Line ${expected.productCode} ${expected.quantity}: received ${quantityReceived} (line total ${total})${complete ? ' — line complete' : ''}`}`.as('note'),
            actor: sql<string>`${by(staff)}`.as('actor'),
            createdAt: sql<number>`${Math.floor(now.getTime() / 1000)}`.as('created_at'),
          })
          .from(purchaseOrders)
          .where(and(eq(purchaseOrders.poNumber, expected.poNumber), landed)),
      ),
    ],
  };
}
