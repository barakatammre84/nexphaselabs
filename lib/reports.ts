import { and, asc, desc, eq, gte, isNull, lt } from 'drizzle-orm';
import { getDb } from '@/db';
import { refundShares } from '@/lib/refund-shares';
import { accounts, lotMovements, lots, orderItems, orders, organizations } from '@/db/schema';
import { parseQuantity } from '@/lib/lot-rules';

/**
 * Reporting reads for the books. Staff-only; the routes that call these are
 * admin-gated. Everything here is a plain query over the operational record —
 * orders, lot costs, shipments — which is what syncs out to accounting. There
 * is deliberately no general ledger in this codebase.
 */

export type OrderLineRow = {
  orderNumber: string;
  submittedOn: Date;
  status: string;
  paymentMethod: string | null;
  paymentStatus: string;
  paidOn: Date | null;
  shippedOn: Date | null;
  deliveredOn: Date | null;
  customerName: string;
  customerEmail: string;
  organization: string | null;
  consignee: string;
  shipTo: string;
  sku: string;
  productCode: string;
  productName: string;
  packSize: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  lotNumber: string | null;
  costCents: number | null;
  /** Order-level figures, repeated on every line of the order; exports print them once. */
  orderTotalCents: number;
  orderShippingCents: number;
  /** Remaining recorded obligation, not proof that a provider refund has occurred. */
  refundOutstandingCents: number;
  refundCents: number | null;
  refundedOn: Date | null;
  refundRef: string | null;
  returnedOn: Date | null;
  returnedPacks: number | null;
  /** This line's share of the order's refund: by returned value after a return, pro rata by line total otherwise. */
  refundShareCents: number;
};

export type ReportPeriod = {
  from: Date;
  toExclusive: Date;
  fromText: string;
  toText: string;
};

function dateValue(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value
    ? null
    : date;
}

/** A closed-open UTC range; defaults to the current calendar month. */
export function reportPeriod(
  fromValue?: string | null,
  toValue?: string | null,
  now = new Date(),
): ReportPeriod {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const from = dateValue(fromValue) ?? monthStart;
  const defaultTo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  const to = dateValue(toValue) ?? defaultTo;
  const safeTo = to < from ? from : to;
  const toExclusive = new Date(safeTo.getTime() + 24 * 60 * 60 * 1000);
  return {
    from,
    toExclusive,
    fromText: from.toISOString().slice(0, 10),
    toText: safeTo.toISOString().slice(0, 10),
  };
}

export async function orderLines(period?: ReportPeriod): Promise<OrderLineRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      orderId: orders.id,
      orderNumber: orders.orderNumber,
      submittedAt: orders.submittedAt,
      status: orders.status,
      paymentMethod: orders.paymentMethod,
      paymentStatus: orders.paymentStatus,
      paidAt: orders.paidAt,
      shippedAt: orders.shippedAt,
      deliveredAt: orders.deliveredAt,
      consigneeName: orders.consigneeName,
      shipToLine1: orders.shipToLine1,
      shipToLine2: orders.shipToLine2,
      shipToCity: orders.shipToCity,
      shipToRegion: orders.shipToRegion,
      shipToPostalCode: orders.shipToPostalCode,
      shipToCountry: orders.shipToCountry,
      totalCents: orders.totalCents,
      shippingCents: orders.shippingCents,
      refundDueCents: orders.refundDueCents,
      refundCents: orders.refundCents,
      refundRef: orders.refundRef,
      refundedAt: orders.refundedAt,
      returnedAt: orders.returnedAt,
      itemId: orderItems.id,
      sku: orderItems.sku,
      productCode: orderItems.productCode,
      productName: orderItems.productName,
      packSize: orderItems.packSize,
      quantity: orderItems.quantity,
      unitPriceCents: orderItems.unitPriceCents,
      lineTotalCents: orderItems.lineTotalCents,
      lotId: orderItems.lotId,
      lotNumber: orderItems.lotNumber,
      returnedPacks: orderItems.returnedPacks,
      customerName: accounts.name,
      customerEmail: accounts.email,
      organization: organizations.legalName,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .innerJoin(accounts, eq(orders.accountId, accounts.id))
    .leftJoin(organizations, eq(orders.organizationId, organizations.id))
    .where(
      period
        ? and(
            gte(orders.submittedAt, period.from),
            lt(orders.submittedAt, period.toExclusive),
          )
        : undefined,
    )
    .orderBy(desc(orders.submittedAt), asc(orderItems.createdAt));
  const lotCosts = await lotUnitCosts();
  const shares = refundShares(rows.map((row) => ({ orderId: row.orderId, itemId: row.itemId, refundCents: row.refundCents, returnedAt: row.returnedAt, lineTotalCents: row.lineTotalCents, returnedPacks: row.returnedPacks, unitPriceCents: row.unitPriceCents })));
  return rows.map((row) => ({
    orderNumber: row.orderNumber,
    submittedOn: row.submittedAt,
    status: row.status,
    paymentMethod: row.paymentMethod,
    paymentStatus: row.paymentStatus,
    paidOn: row.paidAt,
    shippedOn: row.shippedAt,
    deliveredOn: row.deliveredAt,
    customerName: row.customerName,
    customerEmail: row.customerEmail,
    organization: row.organization,
    consignee: row.consigneeName,
    shipTo: [row.shipToLine1, row.shipToLine2, row.shipToCity, row.shipToRegion, row.shipToPostalCode, row.shipToCountry].filter(Boolean).join(', '),
    sku: row.sku,
    productCode: row.productCode,
    productName: row.productName,
    packSize: row.packSize,
    quantity: row.quantity,
    unitPriceCents: row.unitPriceCents,
    lineTotalCents: row.lineTotalCents,
    lotNumber: row.lotNumber,
    costCents: row.lotId ? allocatedCost(lotCosts.get(row.lotId), row.packSize, row.quantity) : null,
    orderTotalCents: row.totalCents,
    orderShippingCents: row.shippingCents,
    refundOutstandingCents: row.paymentStatus === 'refund_due' ? Math.max(0, (row.refundDueCents ?? row.totalCents) - (row.refundCents ?? 0)) : 0,
    refundCents: row.refundCents,
    refundedOn: row.refundedAt,
    refundRef: row.refundRef,
    returnedOn: row.returnedAt,
    returnedPacks: row.returnedPacks,
    refundShareCents: shares.get(row.itemId) ?? 0,
  }));
}

type UnitCost = { centsPerMg: number | null; centsPerUnit: number | null };

/** Cost per mg (mass-tracked) or per container (count-tracked) for every lot with a cost. */
async function lotUnitCosts(): Promise<Map<string, UnitCost>> {
  const db = getDb();
  const rows = await db.select({ id: lots.id, costCents: lots.costCents, received: lots.quantityReceived }).from(lots);
  const map = new Map<string, UnitCost>();
  const toMg: Record<string, number> = { ug: 0.001, mg: 1, g: 1000, kg: 1_000_000 };
  for (const r of rows) {
    if (r.costCents === null || !r.received) continue;
    const q = parseQuantity(r.received);
    if (!q || q.amount <= 0) continue;
    if (q.unit in toMg) map.set(r.id, { centsPerMg: r.costCents / (q.amount * toMg[q.unit]), centsPerUnit: null });
    else map.set(r.id, { centsPerMg: null, centsPerUnit: r.costCents / q.amount });
  }
  return map;
}

function allocatedCost(unit: UnitCost | undefined, packSize: string, packs: number): number | null {
  if (!unit) return null;
  if (unit.centsPerUnit !== null) return Math.round(unit.centsPerUnit * packs);
  const pack = parseQuantity(packSize);
  const toMg: Record<string, number> = { ug: 0.001, mg: 1, g: 1000, kg: 1_000_000 };
  if (!pack || !(pack.unit in toMg) || unit.centsPerMg === null) return null;
  return Math.round(unit.centsPerMg * pack.amount * toMg[pack.unit] * packs);
}

export type ShipmentRow = {
  occurredOn: Date;
  movementType: string;
  direction: string | null;
  lotNumber: string;
  productCode: string;
  productName: string;
  quantity: string;
  consigneeName: string | null;
  consigneeInstitution: string | null;
  shipToAddress: string | null;
  carrier: string | null;
  trackingNumber: string | null;
  recordedBy: string;
  note: string | null;
};

export async function movementLedger(period?: ReportPeriod): Promise<ShipmentRow[]> {
  const db = getDb();
  const rows = await db
    .select({ m: lotMovements, l: lots })
    .from(lotMovements)
    .innerJoin(lots, eq(lotMovements.lotId, lots.id))
    .where(
      period
        ? and(
            gte(lotMovements.occurredAt, period.from),
            lt(lotMovements.occurredAt, period.toExclusive),
          )
        : undefined,
    )
    .orderBy(desc(lotMovements.occurredAt), desc(lotMovements.createdAt));
  return rows.map(({ m, l }) => ({
    occurredOn: m.occurredAt,
    movementType: m.movementType,
    direction: m.direction,
    lotNumber: l.lotNumber,
    productCode: l.productCode,
    productName: l.productName,
    quantity: m.quantity,
    consigneeName: m.consigneeName,
    consigneeInstitution: m.consigneeInstitution,
    shipToAddress: m.shipToAddress,
    carrier: m.carrier,
    trackingNumber: m.trackingNumber,
    recordedBy: m.recordedBy,
    note: m.note,
  }));
}

export type LotRow = {
  lotNumber: string;
  productCode: string;
  productName: string;
  status: string;
  receivedOn: Date;
  manufacturerName: string | null;
  supplierName: string | null;
  quantityReceived: string | null;
  quantityRemaining: string | null;
  costCents: number | null;
  costNote: string | null;
  releasedOn: Date | null;
  retestDate: Date | null;
};

export async function lotInventory(): Promise<LotRow[]> {
  const db = getDb();
  const rows = await db.select().from(lots).where(isNull(lots.supersededById)).orderBy(asc(lots.productCode), asc(lots.receivedAt));
  return rows.map((l) => ({
    lotNumber: l.lotNumber,
    productCode: l.productCode,
    productName: l.productName,
    status: l.status,
    receivedOn: l.receivedAt,
    manufacturerName: l.manufacturerName,
    supplierName: l.supplierName,
    quantityReceived: l.quantityReceived,
    quantityRemaining: l.quantityRemaining,
    costCents: l.costCents,
    costNote: l.costNote,
    releasedOn: l.releasedAt,
    retestDate: l.retestDate,
  }));
}

/** Revenue by product from orders that are paid or beyond (fulfilling, shipped). */
export type RevenueRow = { productCode: string; productName: string; lines: number; packs: number; revenueCents: number; refundedCents: number; costCents: number | null };

/** Paid, preparing and shipped orders; refunds are netted against the lines that came back (pro rata for cancellations). */
export async function revenueByProduct(period?: ReportPeriod): Promise<RevenueRow[]> {
  const lines = await orderLines(period);
  const counted = lines.filter((l) => l.status === 'paid' || l.status === 'fulfilling' || l.status === 'shipped');
  const map = new Map<string, RevenueRow>();
  for (const l of counted) {
    const row = map.get(l.productCode) ?? { productCode: l.productCode, productName: l.productName, lines: 0, packs: 0, revenueCents: 0, refundedCents: 0, costCents: 0 };
    row.lines += 1;
    row.packs += l.quantity;
    row.revenueCents += l.lineTotalCents;
    row.refundedCents += l.refundShareCents;
    row.costCents = row.costCents === null || l.costCents === null ? null : row.costCents + l.costCents;
    map.set(l.productCode, row);
  }
  return [...map.values()].sort((a, b) => b.revenueCents - a.revenueCents);
}

export async function movementsForConsignee(query: string, period?: ReportPeriod): Promise<ShipmentRow[]> {
  const all = await movementLedger(period);
  const q = query.trim().toLowerCase();
  if (!q) return all;
  return all.filter((r) => [r.consigneeName, r.consigneeInstitution, r.shipToAddress].some((v) => v?.toLowerCase().includes(q)));
}
