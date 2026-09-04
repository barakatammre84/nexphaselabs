import { and, asc, eq, sql, isNull } from 'drizzle-orm';
import { getDb } from '@/db';
import { returnAllowed, validateReturn } from '@/lib/order-rules';
import { accounts, lotMovements, lotStatusEvents, lots, orderEvents, orderItems, orders, type Lot } from '@/db/schema';
import { sendEmail } from '@/lib/email';
import { isMassUnit, pickFromLot, sumQuantities } from '@/lib/lot-quantities';
import { formatQuantity, parseQuantity } from '@/lib/lot-rules';
import { recordedBy } from '@/lib/lots-admin';
import { scanText } from '@/lib/catalog-rules';
import { transitionOrder, type OrderDetail } from '@/lib/orders';
import { publicOrigin } from '@/lib/site-config';
import type { StaffPrincipal } from '@/lib/staff-auth';
import { ENTITY_FOOTER } from '@/lib/entity';

/**
 * Fulfilment. The one place material leaves a lot.
 *
 *  - Only a RELEASED lot with quantity on hand can be picked.
 *  - The shipment is one batch: each lot decremented (conditionally on the
 *    quantity that was read), one movement row per line with the named
 *    consignee and the ACTUAL ship date, order lines stamped with their lot,
 *    order moved to shipped with tracking, and the event row guarded by the
 *    transition id. A lot that reaches zero is marked exhausted, with its
 *    own status event.
 */

function id(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
}

export async function startFulfilment(detail: OrderDetail, staff: StaffPrincipal) {
  return transitionOrder(detail.order, 'fulfilling', 'staff', recordedBy(staff), 'Picking started.');
}

export type PickableLot = { id: string; lotNumber: string; quantityRemaining: string | null; retestDate: Date | null; releasedAt: Date | null };

/** Released lots with quantity on hand for a product, oldest release first (first in, first out). */
export async function pickableLots(productCode: string): Promise<PickableLot[]> {
  const db = getDb();
  const rows = await db
    .select({ id: lots.id, lotNumber: lots.lotNumber, quantityRemaining: lots.quantityRemaining, retestDate: lots.retestDate, releasedAt: lots.releasedAt })
    .from(lots)
    .where(and(eq(lots.productCode, productCode), eq(lots.status, 'released'), isNull(lots.supersededById)))
    .orderBy(asc(lots.releasedAt));
  return rows.filter((r) => {
    const q = r.quantityRemaining ? parseQuantity(r.quantityRemaining) : null;
    return q !== null && q.amount > 0;
  });
}

export type ShipmentInput = {
  /** order item id → lot id */
  picks: Record<string, string>;
  carrier: string;
  trackingNumber: string;
  shippedOn: string; // YYYY-MM-DD, the actual ship date
  note?: string | null;
};

export type ShipmentResult = { ok: true } | { ok: false; error: string };

export async function recordShipment(detail: OrderDetail, input: ShipmentInput, staff: StaffPrincipal): Promise<ShipmentResult> {
  const { order, items } = detail;
  if (order.status !== 'fulfilling') return { ok: false, error: 'Start fulfilment before recording a shipment.' };

  const carrier = input.carrier.trim().slice(0, 60);
  const trackingNumber = input.trackingNumber.trim().slice(0, 80);
  const note = (input.note ?? '').trim().slice(0, 300) || null;
  if (!carrier) return { ok: false, error: 'Name the carrier.' };
  if (!trackingNumber) return { ok: false, error: 'Enter the tracking number.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.shippedOn)) return { ok: false, error: 'Ship date must be YYYY-MM-DD.' };
  const shippedOn = new Date(`${input.shippedOn}T00:00:00Z`);
  if (Number.isNaN(shippedOn.getTime()) || shippedOn.toISOString().slice(0, 10) !== input.shippedOn) {
    return { ok: false, error: 'Ship date is not a real date.' };
  }
  if (shippedOn.getTime() > Date.now() + 24 * 3600 * 1000) return { ok: false, error: 'Ship date cannot be in the future.' };
  const violation = scanText('note', note)[0];
  if (violation) return { ok: false, error: `Note contains ${violation.reason} ("${violation.match}").` };

  const db = getDb();
  const now = new Date();
  const by = recordedBy(staff);

  // Resolve every pick against a fresh read of the lot; group lines by lot so a
  // lot used twice is decremented once by the combined amount.
  const lotIds = [...new Set(items.map((it) => input.picks[it.id]))];
  if (lotIds.some((l) => !l)) return { ok: false, error: 'Choose a lot for every line.' };
  const lotRows = await db.select().from(lots).where(and(sql`${lots.id} IN ${lotIds}`, isNull(lots.supersededById)));
  const lotById = new Map<string, Lot>(lotRows.map((l) => [l.id, l]));

  type Plan = { lot: Lot; remaining: string; shipped: string; lines: { itemId: string; packs: number }[] };
  const plans = new Map<string, Plan>();
  for (const it of items) {
    const lot = lotById.get(input.picks[it.id]);
    if (!lot) return { ok: false, error: `Lot for ${it.sku} was not found.` };
    if (lot.status !== 'released') return { ok: false, error: `Lot ${lot.lotNumber} is not released.` };
    if (lot.productCode !== it.productCode) return { ok: false, error: `Lot ${lot.lotNumber} is not ${it.productCode}.` };
    const plan = plans.get(lot.id) ?? { lot, remaining: lot.quantityRemaining ?? '', shipped: '', lines: [] };
    const pick = pickFromLot(plan.remaining, it.packSize, it.quantity);
    if (!pick.ok) return { ok: false, error: `Lot ${lot.lotNumber}: ${pick.error}` };
    plan.remaining = pick.remaining;
    // One lot may supply several lines; the ledger row carries the lot's total. Summed in
    // micrograms so a unit step-down on one pick cannot drop another from the record.
    const shipped = sumQuantities(plan.shipped ? [plan.shipped, pick.shipped] : [pick.shipped]);
    if (!shipped) return { ok: false, error: `Lot ${lot.lotNumber}: shipped quantities could not be reconciled (${plan.shipped} + ${pick.shipped}).` };
    plan.shipped = shipped;
    plan.lines.push({ itemId: it.id, packs: it.quantity });
    plans.set(lot.id, plan);
  }

  const [account] = await db.select({ email: accounts.email, id: accounts.id }).from(accounts).where(eq(accounts.id, order.accountId)).limit(1);
  const shipToAddress = [order.shipToLine1, order.shipToLine2, order.shipToCity, order.shipToRegion, order.shipToPostalCode, order.shipToCountry]
    .filter(Boolean)
    .join(', ');
  const transitionId = id('otr');
  const shipmentId = id('shp');
  const planList = [...plans.values()];
  const lotIdList = planList.map((p) => p.lot.id);

  // Precondition, evaluated once and for all lots: every picked lot is still
  // released with exactly the quantity we read, and the order is still being
  // fulfilled. The marker stamp is a single statement, so it applies to every
  // lot or to none, and nothing below writes unless its lot carries the marker.
  const precondition = sql`(
    SELECT count(*) FROM ${lots}
    WHERE ${sql.join(
      planList.map(
        (p) =>
          sql`(${lots.id} = ${p.lot.id} AND ${lots.status} = 'released' AND ${lots.supersededById} IS NULL AND ${lots.quantityRemaining} = ${p.lot.quantityRemaining ?? ''})`,
      ),
      sql` OR `,
    )}
  ) = ${planList.length} AND (SELECT ${orders.status} FROM ${orders} WHERE ${orders.id} = ${order.id}) = 'fulfilling'`;

  const stamped = (lotId: string) =>
    sql`EXISTS (SELECT 1 FROM ${lots} WHERE ${lots.id} = ${lotId} AND ${lots.lastMovementId} = ${shipmentId})`;

  const statements = [
    db
      .update(lots)
      .set({ lastMovementId: shipmentId })
      .where(and(sql`${lots.id} IN ${lotIdList}`, precondition))
      .returning({ id: lots.id }),
  ] as unknown[];

  for (const plan of planList) {
    const exhausted = (parseQuantity(plan.remaining)?.amount ?? 0) <= 0;
    statements.push(
      db
        .update(lots)
        .set({
          quantityRemaining: plan.remaining,
          ...(exhausted ? { status: 'exhausted', statusReason: `Exhausted by order ${order.orderNumber}.` } : {}),
          updatedAt: now,
        })
        .where(and(eq(lots.id, plan.lot.id), eq(lots.lastMovementId, shipmentId))),
      db.insert(lotMovements).select(
        db
          .select({
            id: sql<string>`${id('mov')}`.as('id'),
            lotId: lots.id,
            movementType: sql<string>`${'shipment'}`.as('movement_type'),
            quantity: sql<string>`${plan.shipped}`.as('quantity'),
            accountId: sql<string>`${order.accountId}`.as('account_id'),
            consigneeName: sql<string>`${order.consigneeName}`.as('consignee_name'),
            consigneeInstitution: sql<string | null>`${order.consigneeInstitution}`.as('consignee_institution'),
            shipToAddress: sql<string>`${shipToAddress}`.as('ship_to_address'),
            carrier: sql<string>`${carrier}`.as('carrier'),
            trackingNumber: sql<string>`${trackingNumber}`.as('tracking_number'),
            witnessOne: sql<string | null>`NULL`.as('witness_one'),
            witnessTwo: sql<string | null>`NULL`.as('witness_two'),
            occurredAt: sql<number>`${Math.floor(shippedOn.getTime() / 1000)}`.as('occurred_at'),
            recordedBy: sql<string>`${by}`.as('recorded_by'),
            note: sql<string>`${`Order ${order.orderNumber}: ${plan.lines.map((l) => `${l.packs} pack(s)`).join(', ')}.${note ? ` ${note}` : ''}`}`.as('note'),
            createdAt: sql<number>`${Math.floor(now.getTime() / 1000)}`.as('created_at'),
          })
          .from(lots)
          .where(and(eq(lots.id, plan.lot.id), eq(lots.lastMovementId, shipmentId))),
      ),
    );
    if (exhausted) {
      statements.push(
        db.insert(lotStatusEvents).select(
          db
            .select({
              id: sql<string>`${id('evt')}`.as('id'),
              lotId: lots.id,
              fromStatus: sql<string>`${'released'}`.as('from_status'),
              toStatus: sql<string>`${'exhausted'}`.as('to_status'),
              reason: sql<string>`${`Quantity reached zero on order ${order.orderNumber}.`}`.as('reason'),
              decidedBy: sql<string>`${by}`.as('decided_by'),
              createdAt: sql<number>`${Math.floor(now.getTime() / 1000)}`.as('created_at'),
            })
            .from(lots)
            .where(and(eq(lots.id, plan.lot.id), eq(lots.lastMovementId, shipmentId))),
        ),
      );
    }
    for (const line of plan.lines) {
      statements.push(
        db
          .update(orderItems)
          .set({ lotId: plan.lot.id, lotNumber: plan.lot.lotNumber })
          .where(and(eq(orderItems.id, line.itemId), stamped(plan.lot.id))),
      );
    }
  }

  // The order moves only when every lot carries the marker.
  const allStamped = sql`(SELECT count(*) FROM ${lots} WHERE ${sql`${lots.id} IN ${lotIdList}`} AND ${lots.lastMovementId} = ${shipmentId}) = ${planList.length}`;
  statements.push(
    db
      .update(orders)
      .set({ status: 'shipped', carrier, trackingNumber, shippedAt: shippedOn, lastTransitionId: transitionId, updatedAt: now })
      .where(and(eq(orders.id, order.id), eq(orders.status, 'fulfilling'), allStamped))
      .returning({ id: orders.id }),
    db.insert(orderEvents).select(
      db
        .select({
          id: sql<string>`${id('oev')}`.as('id'),
          orderId: orders.id,
          fromStatus: sql<string>`${'fulfilling'}`.as('from_status'),
          toStatus: sql<string>`${'shipped'}`.as('to_status'),
          note: sql<string | null>`${`Shipped via ${carrier} ${trackingNumber}.${note ? ` ${note}` : ''}`}`.as('note'),
          actor: sql<string>`${by}`.as('actor'),
          createdAt: sql<number>`${Math.floor(now.getTime() / 1000)}`.as('created_at'),
        })
        .from(orders)
        .where(and(eq(orders.id, order.id), eq(orders.lastTransitionId, transitionId))),
    ),
  );

  const results = (await db.batch(statements as unknown as Parameters<typeof db.batch>[0])) as unknown as unknown[];
  const stampedRows = results[0] as { id: string }[] | undefined;
  const orderRows = results[results.length - 2] as { id: string }[] | undefined;
  if (!stampedRows || stampedRows.length !== planList.length || !orderRows || orderRows.length === 0) {
    // Nothing was written: the marker stamp is all-or-nothing and every other
    // statement is conditional on it. Report plainly.
    return { ok: false, error: 'A picked lot or the order changed while you were recording the shipment. Reload and pick again.' };
  }

  if (account?.email) {
    await sendEmail({
      to: account.email,
      subject: `Order ${order.orderNumber} has shipped — NexPhase Labs`,
      text: [
        `Order ${order.orderNumber} shipped on ${input.shippedOn} via ${carrier}.`,
        `Tracking: ${trackingNumber}`,
        '',
        'Lots supplied:',
        ...[...plans.values()].map((p) => `  ${p.lot.lotNumber} — ${publicOrigin()}/lots/${encodeURIComponent(p.lot.lotNumber)}`),
        '',
        'The certificate of analysis for each lot is in the parcel and at the link above.',
        `Order details: ${publicOrigin()}/account/orders/${order.orderNumber}`,
        '',
        ENTITY_FOOTER,
      ].join('\n'),
    });
  }
  return { ok: true };
}

/* ------------------------------------------------------------------------ */
/* Returns                                                                   */
/* ------------------------------------------------------------------------ */

export type ReturnInput = {
  /** Packs received back per order line (item id → packs). Lines omitted or 0 are not returned. */
  packs: Record<string, number>;
  receivedOn: string; // YYYY-MM-DD
  condition: string;
  note: string;
};

/**
 * Receive material back from a shipped order. Each returned line becomes a
 * 'return' movement on the lot it shipped from, tagged as quarantined:
 * returned material is NEVER added back to the lot's sellable quantity, so
 * nothing this records can make material available again without a named
 * decision. The order stays 'shipped'; its payment becomes 'refund_due' if it
 * was paid, so the refund step follows. All-or-nothing behind an order marker.
 */
export async function recordReturn(detail: OrderDetail, input: ReturnInput, staff: StaffPrincipal): Promise<ShipmentResult> {
  const { order, items } = detail;
  if (!returnAllowed(order)) return { ok: false, error: order.returnedAt ? 'A return has already been received for this order.' : 'Only a shipped order can have material returned.' };
  const validated = validateReturn(
    items.map((it) => ({ id: it.id, sku: it.sku, quantity: it.quantity, lotId: it.lotId, unitPriceCents: it.unitPriceCents })),
    input,
    order.shippedAt,
  );
  if (!validated.ok) return validated;
  const { receivedOn, condition, note } = validated;
  const violation = scanText('note', `${condition} ${note}`)[0];
  if (violation) return { ok: false, error: `Note contains ${violation.reason} ("${violation.match}").` };
  const lines = validated.lines.map((l) => ({ it: items.find((it) => it.id === l.itemId)!, packs: l.packs }));

  const db = getDb();
  // The ledger quantity must be in the unit the lot is tracked in: mass lots return packs × pack size,
  // count-tracked lots return a number of containers — the same rule pickFromLot applies on the way out.
  const lotIds = [...new Set(lines.map((l) => l.it.lotId as string))];
  const lotRows = await db.select({ id: lots.id, received: lots.quantityReceived, remaining: lots.quantityRemaining }).from(lots).where(sql`${lots.id} IN ${lotIds}`);
  const unitOf = new Map(lotRows.map((r) => [r.id, parseQuantity(r.remaining ?? r.received ?? '')?.unit]));
  const quantities = new Map<string, string>();
  for (const l of lines) {
    const unit = unitOf.get(l.it.lotId as string);
    const quantity = unit && !isMassUnit(unit) ? formatQuantity(l.packs, unit) : sumQuantities(Array.from({ length: l.packs }, () => l.it.packSize));
    if (!quantity) return { ok: false, error: `${l.it.sku}: the pack size could not be converted to a quantity.` };
    quantities.set(l.it.id, quantity);
  }

  const now = new Date();
  const marker = id('otr');
  const by = recordedBy(staff);
  const wasPaid = order.paymentStatus === 'paid';
  const noteText = `Return received ${input.receivedOn}: ${lines.map((l) => `${l.packs} × ${l.it.sku}`).join(', ')}. Condition: ${condition}.${note ? ` ${note}` : ''} Material quarantined; not returned to stock.${wasPaid ? ` Refund due: $${(validated.refundDueCents / 100).toFixed(2)}.` : ''}`;
  const statements = [
    db
      .update(orders)
      .set({
        returnedAt: receivedOn,
        lastTransitionId: marker,
        updatedAt: now,
        ...(wasPaid ? { paymentStatus: 'refund_due', refundDueCents: validated.refundDueCents } : {}),
      })
      .where(and(eq(orders.id, order.id), eq(orders.status, 'shipped'), isNull(orders.returnedAt), eq(orders.paymentStatus, order.paymentStatus)))
      .returning({ id: orders.id }),
  ] as unknown[];
  for (const l of lines) {
    statements.push(
      db
        .update(orderItems)
        .set({ returnedPacks: l.packs })
        .where(and(eq(orderItems.id, l.it.id), sql`EXISTS (SELECT 1 FROM ${orders} WHERE ${orders.id} = ${order.id} AND ${orders.lastTransitionId} = ${marker})`)),
    );
    statements.push(
      db.insert(lotMovements).select(
        db
          .select({
            id: sql<string>`${id('mov')}`.as('id'),
            lotId: sql<string>`${l.it.lotId}`.as('lot_id'),
            movementType: sql<string>`'return'`.as('movement_type'),
            quantity: sql<string>`${quantities.get(l.it.id)}`.as('quantity'),
            accountId: sql<string>`${order.accountId}`.as('account_id'),
            consigneeName: sql<string | null>`${order.consigneeName}`.as('consignee_name'),
            consigneeInstitution: sql<string | null>`${order.consigneeInstitution}`.as('consignee_institution'),
            shipToAddress: sql<string>`${[order.shipToLine1, order.shipToLine2, order.shipToCity, order.shipToRegion, order.shipToPostalCode, order.shipToCountry].filter(Boolean).join(', ')}`.as('ship_to_address'),
            carrier: sql<string | null>`NULL`.as('carrier'),
            trackingNumber: sql<string | null>`NULL`.as('tracking_number'),
            witnessOne: sql<string | null>`NULL`.as('witness_one'),
            witnessTwo: sql<string | null>`NULL`.as('witness_two'),
            occurredAt: sql<number>`${Math.floor(receivedOn.getTime() / 1000)}`.as('occurred_at'),
            recordedBy: sql<string>`${by}`.as('recorded_by'),
            note: sql<string>`${`Order ${order.orderNumber}: ${l.packs} × ${l.it.packSize} returned; QUARANTINED, not added to stock. Condition: ${condition}.`}`.as('note'),
            createdAt: sql<number>`${Math.floor(now.getTime() / 1000)}`.as('created_at'),
          })
          .from(orders)
          .where(and(eq(orders.id, order.id), eq(orders.lastTransitionId, marker))),
      ),
    );
  }
  statements.push(
    db.insert(orderEvents).select(
      db
        .select({
          id: sql<string>`${id('oev')}`.as('id'),
          orderId: orders.id,
          fromStatus: orders.status,
          toStatus: orders.status,
          note: sql<string>`${noteText}`.as('note'),
          actor: sql<string>`${by}`.as('actor'),
          createdAt: sql<number>`${Math.floor(now.getTime() / 1000)}`.as('created_at'),
        })
        .from(orders)
        .where(and(eq(orders.id, order.id), eq(orders.lastTransitionId, marker))),
    ),
  );
  const [changed] = await db.batch(statements as unknown as Parameters<typeof db.batch>[0]);
  if (!changed || (changed as unknown[]).length === 0) return { ok: false, error: 'The order changed while you were working. Reload and try again.' };
  return { ok: true };
}
