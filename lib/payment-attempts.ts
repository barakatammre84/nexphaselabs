import { and, eq, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { orderEvents, orders, type Order } from '@/db/schema';
import { paymentAttempts } from '@/db/commerce-schema';
import { conditionalInsert } from '@/lib/conditional-insert';
import { getPaymentMethod, type PaymentInstructions, type PaymentMethod } from '@/lib/payments';
import { reservationEligibility } from '@/lib/inventory-reservations';

const attention = 'Payment setup is being checked. Do not send another payment or start another invoice. Contact support with your order number.';

/** Claim BEFORE calling a provider. No timeout can justify creating another invoice.
 * A ready response survives failure in the subsequent order/event/notification batch.
 * An abandoned requesting row requires provider reconciliation, not a lease takeover. */
export async function beginClaimedPayment(order: Order, method: PaymentMethod, actor: string): Promise<
  { ok: true; instructions: PaymentInstructions } | { ok: false; error: string }
> {
  const db = getDb();
  const attemptId = `pat_${crypto.randomUUID().replace(/-/g, '')}`;
  const allocation = await reservationEligibility(order.id);
  const [claimed] = await db.batch([
    conditionalInsert(paymentAttempts, {
      orderId: order.id, id: attemptId, method: method.id, state: 'requesting',
      amountCents: order.totalCents, currency: order.currency, actor,
    }, orders, and(
      eq(orders.id, order.id), eq(orders.status, 'submitted'),
      eq(orders.totalCents, order.totalCents), eq(orders.currency, order.currency),
      sql`${orders.paymentRef} IS NULL`,
      allocation.guard,
    )!).onConflictDoNothing().returning(),
  ]);
  let instructions: PaymentInstructions | undefined;
  if (claimed.length) {
    try {
      instructions = await method.begin(order, attemptId);
      if (!instructions.reference || !/^[A-Za-z0-9_-]{1,120}$/.test(instructions.reference))
        throw new Error('Invalid payment reference');
      await db.update(paymentAttempts).set({
        state: 'ready', reference: instructions.reference, updatedAt: new Date(),
      }).where(and(eq(paymentAttempts.orderId, order.id), eq(paymentAttempts.id, attemptId)));
    } catch {
      // Even an HTTP error can follow an external commit. Never delete this claim.
      await db.update(paymentAttempts).set({ state: 'attention', updatedAt: new Date() })
        .where(and(eq(paymentAttempts.orderId, order.id), eq(paymentAttempts.id, attemptId), eq(paymentAttempts.state, 'requesting')));
      return { ok: false, error: attention };
    }
  }
  const [attempt] = await db.select().from(paymentAttempts).where(eq(paymentAttempts.orderId, order.id)).limit(1);
  if (!attempt || attempt.method !== method.id || !['ready', 'attached'].includes(attempt.state) || !attempt.reference)
    return { ok: false, error: attention };
  const attached = await attachPaymentAttempt(order.id);
  if (!attached) return { ok: false, error: attention };
  if (attached.status === 'cancelled') return { ok: false, error: 'The order was cancelled. Do not pay. Staff can reconcile any payment already sent.' };
  // Rebuild only deterministic local instructions; never call external begin again.
  if (!instructions && method.id !== 'btcpay') instructions = await method.begin(attached, attempt.id);
  return { ok: true, instructions: instructions ?? {
    method: 'btcpay', title: 'Bitcoin invoice', reference: attempt.reference,
    lines: [`Invoice: ${attempt.reference}`, 'Return to the order to open your existing payment instructions.'], url: null,
  } };
}

/** Can be retried after a crash. Cancellation attaches the reference WITHOUT reopening fulfillment. */
export async function attachPaymentAttempt(orderId: string): Promise<Order | null> {
  const db = getDb();
  const [attempt] = await db.select().from(paymentAttempts).where(eq(paymentAttempts.orderId, orderId)).limit(1);
  if (!attempt?.reference || !['ready', 'attached'].includes(attempt.state)) return null;
  const marker = `otr_${crypto.randomUUID().replace(/-/g, '')}`;
  const paymentMethodNote = attempt.reference.startsWith('TEST-')
    ? 'Payment method: simulated payment.'
    : `Payment method: ${attempt.method}.`;
  const current = and(eq(orders.id, orderId), eq(orders.lastTransitionId, marker))!;
  await db.batch([
    db.update(orders).set({
      paymentMethod: attempt.method, paymentRef: attempt.reference,
      status: sql`CASE WHEN ${orders.status} = 'cancelled' THEN 'cancelled' ELSE 'awaiting_payment' END`,
      paymentStatus: sql`CASE WHEN ${orders.status} = 'cancelled' THEN 'failed' ELSE 'pending' END`,
      lastTransitionId: marker, updatedAt: new Date(),
    }).where(and(eq(orders.id, orderId), sql`${orders.status} IN ('submitted','cancelled')`,
      sql`${orders.paymentRef} IS NULL`, sql`${orders.paidAt} IS NULL`,
      eq(orders.totalCents, attempt.amountCents), eq(orders.currency, attempt.currency),
      sql`EXISTS (SELECT 1 FROM ${paymentAttempts} WHERE ${paymentAttempts.orderId} = ${orderId}
        AND ${paymentAttempts.id} = ${attempt.id} AND ${paymentAttempts.state} = 'ready'
        AND ${paymentAttempts.reference} = ${attempt.reference})`,
    )),
    db.insert(orderEvents).select(db.select({
      id: sql<string>`${`oev_${crypto.randomUUID().replace(/-/g, '')}`}`.as('id'), orderId: orders.id,
      fromStatus: sql<string>`CASE WHEN ${orders.status} = 'cancelled' THEN 'cancelled' ELSE 'submitted' END`.as('from_status'),
      toStatus: orders.status,
      note: sql<string>`CASE WHEN ${orders.status} = 'cancelled' THEN 'Payment reference recovered after cancellation. Do not pay; reconcile any incoming settlement.' ELSE ${paymentMethodNote} END`.as('note'),
      actor: sql<string>`${attempt.actor}`.as('actor'), createdAt: sql<number>`unixepoch()`.as('created_at'),
    }).from(orders).where(current)),
    db.update(paymentAttempts).set({ state: 'attached', updatedAt: new Date() }).where(and(
      eq(paymentAttempts.id, attempt.id), sql`EXISTS (SELECT 1 FROM ${orders} WHERE ${orders.id} = ${orderId}
        AND ${orders.paymentRef} = ${attempt.reference} AND ${orders.paymentMethod} = ${attempt.method})`,
    )),
  ]);
  const [order] = await db.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.paymentRef, attempt.reference), eq(orders.paymentMethod, attempt.method))).limit(1);
  return order ?? null;
}

/** Read-only provider lookup followed by guarded local attachment. Never creates invoices or marks money received. */
export async function reconcilePaymentAttempt(order: Order, reference: string, actor: string) {
  const db = getDb();
  const [attempt] = await db.select().from(paymentAttempts).where(eq(paymentAttempts.orderId, order.id)).limit(1);
  const method = getPaymentMethod('btcpay');
  if (!attempt || attempt.method !== 'btcpay' || !method || !['attention', 'requesting', 'ready'].includes(attempt.state))
    return { ok: false, error: 'No recoverable Bitcoin payment request is available.' };
  const { lookupBtcpayInvoice } = await import('@/lib/payments');
  const match = await lookupBtcpayInvoice(reference, order, attempt.id);
  if (!match) return { ok: false, error: 'Provider invoice does not match this order, amount, currency and request.' };
  await db.update(paymentAttempts).set({ state: 'ready', reference, actor, updatedAt: new Date() }).where(and(
    eq(paymentAttempts.id, attempt.id), eq(paymentAttempts.state, attempt.state),
    sql`${paymentAttempts.reference} IS ${attempt.reference}`,
  ));
  return (await attachPaymentAttempt(order.id)) ? { ok: true } : { ok: false, error: attention };
}
