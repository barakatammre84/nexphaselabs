import { asc, desc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
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
};

export async function orderLines(): Promise<OrderLineRow[]> {
  const db = getDb();
  const rows = await db
    .select({ o: orders, it: orderItems, a: accounts, org: organizations })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .innerJoin(accounts, eq(orders.accountId, accounts.id))
    .leftJoin(organizations, eq(orders.organizationId, organizations.id))
    .orderBy(desc(orders.submittedAt), asc(orderItems.createdAt));
  const lotCosts = await lotUnitCosts();
  return rows.map(({ o, it, a, org }) => ({
    orderNumber: o.orderNumber,
    submittedOn: o.submittedAt,
    status: o.status,
    paymentMethod: o.paymentMethod,
    paymentStatus: o.paymentStatus,
    paidOn: o.paidAt,
    shippedOn: o.shippedAt,
    customerName: a.name,
    customerEmail: a.email,
    organization: org?.legalName ?? null,
    consignee: o.consigneeName,
    shipTo: [o.shipToLine1, o.shipToLine2, o.shipToCity, o.shipToRegion, o.shipToPostalCode, o.shipToCountry].filter(Boolean).join(', '),
    sku: it.sku,
    productCode: it.productCode,
    productName: it.productName,
    packSize: it.packSize,
    quantity: it.quantity,
    unitPriceCents: it.unitPriceCents,
    lineTotalCents: it.lineTotalCents,
    lotNumber: it.lotNumber,
    costCents: it.lotId ? allocatedCost(lotCosts.get(it.lotId), it.packSize, it.quantity) : null,
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

export async function movementLedger(): Promise<ShipmentRow[]> {
  const db = getDb();
  const rows = await db
    .select({ m: lotMovements, l: lots })
    .from(lotMovements)
    .innerJoin(lots, eq(lotMovements.lotId, lots.id))
    .orderBy(desc(lotMovements.occurredAt), desc(lotMovements.createdAt));
  return rows.map(({ m, l }) => ({
    occurredOn: m.occurredAt,
    movementType: m.movementType,
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
  const rows = await db.select().from(lots).orderBy(asc(lots.productCode), asc(lots.receivedAt));
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
export async function revenueByProduct(): Promise<{ productCode: string; productName: string; lines: number; packs: number; revenueCents: number; costCents: number | null }[]> {
  const lines = await orderLines();
  const counted = lines.filter((l) => l.status === 'paid' || l.status === 'fulfilling' || l.status === 'shipped');
  const map = new Map<string, { productCode: string; productName: string; lines: number; packs: number; revenueCents: number; costCents: number | null }>();
  for (const l of counted) {
    const row = map.get(l.productCode) ?? { productCode: l.productCode, productName: l.productName, lines: 0, packs: 0, revenueCents: 0, costCents: 0 };
    row.lines += 1;
    row.packs += l.quantity;
    row.revenueCents += l.lineTotalCents;
    row.costCents = row.costCents === null || l.costCents === null ? null : row.costCents + l.costCents;
    map.set(l.productCode, row);
  }
  return [...map.values()].sort((a, b) => b.revenueCents - a.revenueCents);
}

export async function movementsForConsignee(query: string): Promise<ShipmentRow[]> {
  const all = await movementLedger();
  const q = query.trim().toLowerCase();
  if (!q) return all;
  return all.filter((r) => [r.consigneeName, r.consigneeInstitution, r.shipToAddress].some((v) => v?.toLowerCase().includes(q)));
}
