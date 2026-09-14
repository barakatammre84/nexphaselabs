import { env } from 'cloudflare:workers';
import { and, asc, eq, sql, type SQL } from 'drizzle-orm';
import { getDb } from '@/db';
import { inventoryReservations } from '@/db/commerce-schema';
import { lots, orderItems, orders } from '@/db/schema';
import { publishableLot } from '@/lib/lots-public';
import { parseQuantity } from '@/lib/lot-rules';

const MASS: Record<string, number> = { ug: 1, mg: 1_000, g: 1_000_000, kg: 1_000_000_000 };
export function stockUnits(value: string | null): { units: number; unit: string } | null {
  const parsed = value ? parseQuantity(value.replace('µg', 'ug')) : null;
  if (!parsed) return null;
  const units = parsed.amount * (MASS[parsed.unit] ?? 1);
  const rounded = Math.round(units);
  if (!Number.isSafeInteger(rounded) || rounded < 0 || Math.abs(units - rounded) > 0.00001) return null;
  return { units: rounded, unit: parsed.unit in MASS ? 'ug' : parsed.unit };
}
/** True when a count-tracked lot's labeled container content equals the pack size (both in micrograms). */
export function containerMatches(containerSize: string | null, packUg: number): boolean {
  const container = stockUnits(containerSize);
  return Boolean(container && container.unit === 'ug' && container.units === packUg);
}

export function reservationMinutes(): number | null {
  const text = env.INVENTORY_RESERVATION_MINUTES ?? '';
  if (!/^\d+$/.test(text)) return null;
  const minutes = Number(text);
  return minutes >= 1 && minutes <= 1440 ? minutes : null;
}

/** Paid allocations never expire. Cancellation/shipment releases by order status in the same transaction. */
export function activeReservation(now: Date): SQL {
  return sql`(${orders.status} IN ('paid','fulfilling') OR
    (${orders.status} IN ('submitted','awaiting_payment') AND ${inventoryReservations.expiresAt} > ${Math.floor(now.getTime() / 1000)}))`;
}
type ReservedLine = { itemId: string; lotId: string; units: number; unit: string };
type ReviewedLot = { id: string; remaining: string; held: number; retest: number | null };
export type ReservationPlan = { lines: ReservedLine[]; lots: ReviewedLot[]; expiresAt: Date };

/** One lot per order line, matching the existing packing/shipping model. No automatic split-lot substitution. */
export async function planReservations(lines: { itemId: string; code: string; packSize: string; packs: number }[], now = new Date()): Promise<
  { ok: true; plan: ReservationPlan } | { ok: false; error: string }
> {
  const minutes = reservationMinutes();
  if (!minutes) return { ok: false, error: 'Inventory reservation policy has not been configured.' };
  const codes = [...new Set(lines.map(l => l.code))];
  const rows = await getDb().select().from(lots).where(and(publishableLot(),
    sql`${lots.productCode} IN (SELECT value FROM json_each(${JSON.stringify(codes)}))`)).orderBy(asc(lots.releasedAt)).limit(1001);
  if (rows.length > 1000) return { ok: false, error: 'Inventory needs a bounded allocation review before ordering.' };
  const held = rows.length ? await getDb().select({ lotId: inventoryReservations.lotId, units: sql<number>`sum(${inventoryReservations.units})` })
    .from(inventoryReservations).innerJoin(orders, eq(orders.id, inventoryReservations.orderId))
    .where(and(activeReservation(now), sql`${inventoryReservations.lotId} IN (SELECT value FROM json_each(${JSON.stringify(rows.map(l => l.id))}))`))
    .groupBy(inventoryReservations.lotId) : [];
  const reserved = new Map(held.map(r => [r.lotId, r.units]));
  const planned = new Map<string, number>();
  const result: ReservedLine[] = [];
  const reviewed = new Map<string, ReviewedLot>();
  for (const line of lines) {
    const pack = stockUnits(line.packSize);
    if (!pack || pack.unit !== 'ug' || !Number.isInteger(line.packs) || line.packs < 1 || !Number.isSafeInteger(pack.units * line.packs))
      return { ok: false, error: `Pack quantity for ${line.code} cannot be allocated safely.` };
    // A lot is either mass-tracked (picked by weight, any pack size) or count-tracked (sealed
    // containers; it supplies only packs of exactly its labeled container size, one container per pack).
    // Never assume a 50 mg vial can fill a 10 mg pack, or two 5 mg vials a 10 mg one.
    let chosen: { lot: (typeof rows)[number]; needed: number; unit: string } | null = null;
    for (const l of rows) {
      if (l.productCode !== line.code || (l.retestDate && l.retestDate <= now)) continue;
      const have = stockUnits(l.quantityRemaining);
      if (!have) continue;
      const needed = have.unit === 'ug' ? pack.units * line.packs : containerMatches(l.containerSize, pack.units) ? line.packs : 0;
      if (needed <= 0) continue;
      if (have.units - (reserved.get(l.id) ?? 0) - (planned.get(l.id) ?? 0) >= needed) { chosen = { lot: l, needed, unit: have.unit }; break; }
    }
    if (!chosen) return { ok: false, error: `Not enough allocatable released stock for ${line.code} in this pack size. Reduce the quantity or contact support.` };
    const { lot, needed, unit } = chosen;
    planned.set(lot.id, (planned.get(lot.id) ?? 0) + needed);
    reviewed.set(lot.id, { id: lot.id, remaining: lot.quantityRemaining!, held: reserved.get(lot.id) ?? 0, retest: lot.retestDate ? Math.floor(lot.retestDate.getTime() / 1000) : null });
    result.push({ itemId: line.itemId, lotId: lot.id, units: needed, unit });
  }
  return { ok: true, plan: { lines: result, lots: [...reviewed.values()], expiresAt: new Date(now.getTime() + minutes * 60_000) } };
}

/** The order INSERT checks all stock/other allocations in one statement. Competing orders cannot both win. */
export function reservationPlanGuard(plan: ReservationPlan, now: Date): SQL {
  return sql`NOT EXISTS (SELECT 1 FROM json_each(${JSON.stringify(plan.lots)}) expected WHERE NOT EXISTS (
    SELECT 1 FROM ${lots} WHERE ${lots.id} = json_extract(expected.value,'$.id')
      AND ${lots.status} = 'released' AND ${lots.supersededById} IS NULL
      AND ${lots.analyticalLab} IS NOT NULL AND trim(${lots.analyticalLab}) <> ''
      AND ${lots.accessionNumber} IS NOT NULL AND trim(${lots.accessionNumber}) <> ''
      AND ${lots.testingStandard} IS NOT NULL AND trim(${lots.testingStandard}) <> ''
      AND ${lots.quantityRemaining} = json_extract(expected.value,'$.remaining')
      AND ${lots.retestDate} IS json_extract(expected.value,'$.retest')
      AND (${lots.retestDate} IS NULL OR ${lots.retestDate} > ${Math.floor(now.getTime() / 1000)})
      AND (SELECT COALESCE(sum(r.units),0) FROM inventory_reservations r INNER JOIN orders o ON o.id = r.order_id
        WHERE r.lot_id = ${lots.id} AND (o.status IN ('paid','fulfilling') OR
          (o.status IN ('submitted','awaiting_payment') AND r.expires_at > ${Math.floor(now.getTime() / 1000)}))) = json_extract(expected.value,'$.held')
  ))`;
}

/** Fresh expiry/QC/quantity check for payment and fulfillment. Legacy unreserved orders remain distinguishable. */
export async function reservationEligibility(orderId: string, now = new Date()) {
  const db = getDb();
  const rows = await db.select({ reservation: inventoryReservations, lot: lots }).from(inventoryReservations)
    .innerJoin(lots, eq(lots.id, inventoryReservations.lotId)).where(eq(inventoryReservations.orderId, orderId));
  if (!rows.length) return { tracked: false, valid: true, guard: sql`1 = 1`, rows };
  const reviewed = rows.map(({ reservation, lot }) => {
    const have = stockUnits(lot.quantityRemaining);
    return { id: lot.id, remaining: lot.quantityRemaining, units: have?.unit === reservation.unit ? have.units : -1 };
  });
  const guard = sql`(SELECT count(*) FROM ${inventoryReservations} WHERE ${inventoryReservations.orderId} = ${orderId}) =
      (SELECT count(*) FROM ${orderItems} WHERE ${orderItems.orderId} = ${orderId})
    AND NOT EXISTS (SELECT 1 FROM ${inventoryReservations} INNER JOIN ${orders} ON ${orders.id} = ${inventoryReservations.orderId}
      WHERE ${orders.id} = ${orderId} AND NOT (${activeReservation(now)}))
    AND NOT EXISTS (SELECT 1 FROM json_each(${JSON.stringify(reviewed)}) expected WHERE NOT EXISTS (
      SELECT 1 FROM ${lots} WHERE ${lots.id} = json_extract(expected.value,'$.id')
      AND ${lots.status} = 'released' AND ${lots.supersededById} IS NULL
      AND ${lots.quantityRemaining} = json_extract(expected.value,'$.remaining')
      AND (${lots.retestDate} IS NULL OR ${lots.retestDate} > ${Math.floor(now.getTime() / 1000)})
      AND (SELECT COALESCE(sum(r.units),0) FROM inventory_reservations r INNER JOIN orders o ON o.id = r.order_id
        WHERE r.lot_id = ${lots.id} AND (o.status IN ('paid','fulfilling') OR
          (o.status IN ('submitted','awaiting_payment') AND r.expires_at > ${Math.floor(now.getTime() / 1000)}))) <= json_extract(expected.value,'$.units')
    ))`;
  const [valid] = await db.select({ id: orders.id }).from(orders).where(and(eq(orders.id, orderId), guard)).limit(1);
  return { tracked: true, valid: Boolean(valid), guard, rows };
}

/** Legacy orders must not consume material held for newer orders either. */
export function unreservedStockGuard(plans: { lotId: string; remaining: string }[], orderId: string, now: Date): SQL {
  const reviewed = plans.map(p => ({ id: p.lotId, units: stockUnits(p.remaining)?.units ?? -1 }));
  return sql`NOT EXISTS (SELECT 1 FROM json_each(${JSON.stringify(reviewed)}) expected
    WHERE (SELECT COALESCE(sum(r.units),0) FROM inventory_reservations r INNER JOIN orders o ON o.id = r.order_id
      WHERE r.lot_id = json_extract(expected.value,'$.id') AND o.id != ${orderId}
      AND (o.status IN ('paid','fulfilling') OR (o.status IN ('submitted','awaiting_payment')
        AND r.expires_at > ${Math.floor(now.getTime() / 1000)}))) > json_extract(expected.value,'$.units'))`;
}
