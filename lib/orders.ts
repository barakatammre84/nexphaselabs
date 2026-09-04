import { and, asc, desc, eq, like, sql, isNull } from 'drizzle-orm';
import { getDb } from '@/db';
import { cartItems, lots, orderEvents, orderItems, orders, type Order, type OrderEvent, type OrderItem, type Organization } from '@/db/schema';
import type { AccountPrincipal } from '@/lib/account-auth';
import { getCart, type Cart } from '@/lib/cart';
import { RUO_VERSION } from '@/lib/policy';
import { btcpayCheckoutUrl, getPaymentMethod, invalidateBtcpayInvoice, type PaymentInstructions } from '@/lib/payments';
import { canTransition, formatOrderNumber, orderTotals, refundAllowed, refundDue, type OrderStatus } from '@/lib/order-rules';
import type { Visibility } from '@/lib/visibility-rules';

function id(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
}

export type ShipTo = {
  consigneeName: string;
  consigneeInstitution: string | null;
  line1: string;
  line2: string | null;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  phone: string | null;
};

/** The verified organisation's address is the only ship-to for an institutional account. */
export function shipToFromOrganization(org: Organization, account: AccountPrincipal): ShipTo {
  return {
    consigneeName: org.receivingParty || account.name,
    consigneeInstitution: org.legalName,
    line1: org.addressLine1,
    line2: org.addressLine2,
    city: org.city,
    region: org.region,
    postalCode: org.postalCode,
    country: org.country,
    phone: org.phone,
  };
}

/** Next order number for today, unique across retries. */
async function nextOrderNumber(now: Date): Promise<string> {
  const db = getDb();
  const prefix = formatOrderNumber(now, 0).slice(0, -4);
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(orders)
    .where(like(orders.orderNumber, `${prefix}%`));
  return formatOrderNumber(now, (row?.n ?? 0) + 1);
}

/** Products that have at least one released lot — the only ones that can be ordered. */
async function releasedProductCodes(codes: string[]): Promise<Set<string>> {
  if (codes.length === 0) return new Set();
  const db = getDb();
  const rows = await db
    .selectDistinct({ code: lots.productCode })
    .from(lots)
    .where(and(eq(lots.status, 'released'), isNull(lots.supersededById), sql`${lots.productCode} IN ${codes}`));
  return new Set(rows.map((r) => r.code));
}

export type CreateOrderResult =
  | { ok: true; orderNumber: string; duplicate?: boolean }
  | { ok: false; error: string };

/**
 * Turn the account's cart into a submitted order. Prices come from the
 * catalog at this moment for the viewer's tier, never from the client.
 * Every product must have a released lot; the specific lot is chosen at
 * fulfilment by staff.
 */
export async function createOrderFromCart(
  account: AccountPrincipal,
  visibility: Visibility,
  shipTo: ShipTo,
  organizationId: string | null,
  customerNote: string | null,
  submissionToken: string,
): Promise<CreateOrderResult> {
  if (visibility.pricing === 'none') return { ok: false, error: 'Ordering is not available to your account yet.' };
  if (!/^[a-f0-9]{32}$/.test(submissionToken)) return { ok: false, error: 'Reload the cart and try again.' };
  const db = getDb();
  // Idempotent: the same rendered cart form can only ever produce one order.
  const [already] = await db
    .select({ orderNumber: orders.orderNumber })
    .from(orders)
    .where(and(eq(orders.submissionToken, submissionToken), eq(orders.accountId, account.id)))
    .limit(1);
  if (already) return { ok: true, orderNumber: already.orderNumber, duplicate: true };
  const cart: Cart = await getCart(account.id, visibility);
  if (cart.lines.length === 0) return { ok: false, error: 'Your cart is empty.' };
  if (!cart.orderable) return { ok: false, error: 'Fix the lines marked in your cart before submitting.' };

  const released = await releasedProductCodes([...new Set(cart.lines.map((l) => l.product.code))]);
  const unavailable = cart.lines.filter((l) => !released.has(l.product.code));
  if (unavailable.length) {
    return {
      ok: false,
      error: `No released lot is available for: ${[...new Set(unavailable.map((l) => l.product.name))].join(', ')}. Email research@nexphaselabs.net for lead times.`,
    };
  }

  const now = new Date();
  const lines = cart.lines.map((l) => ({ unitPriceCents: l.unitPriceCents!, quantity: l.quantity }));
  const totals = orderTotals(lines, 0);
  const orderId = id('ord');

  for (let attempt = 0; attempt < 3; attempt++) {
    const orderNumber = await nextOrderNumber(now);
    try {
      await db.batch([
        db.insert(orders).values({
          id: orderId,
          orderNumber,
          accountId: account.id,
          organizationId,
          channel: 'research_direct',
          authorizationRef: null,
          status: 'submitted',
          currency: 'USD',
          subtotalCents: totals.subtotalCents,
          shippingCents: totals.shippingCents,
          totalCents: totals.totalCents,
          priceTier: visibility.pricing,
          submissionToken,
          consigneeName: shipTo.consigneeName,
          consigneeInstitution: shipTo.consigneeInstitution,
          shipToLine1: shipTo.line1,
          shipToLine2: shipTo.line2,
          shipToCity: shipTo.city,
          shipToRegion: shipTo.region,
          shipToPostalCode: shipTo.postalCode,
          shipToCountry: shipTo.country,
          shipToPhone: shipTo.phone,
          customerNote,
          submittedAt: now,
          createdAt: now,
          updatedAt: now,
        }),
        ...cart.lines.map((l) =>
          db.insert(orderItems).values({
            id: id('oli'),
            orderId,
            productId: l.product.id,
            productCode: l.product.code,
            productName: l.product.name,
            variantId: l.variant.id,
            sku: l.variant.sku,
            packSize: l.variant.quantity,
            presentation: l.variant.presentation,
            quantity: l.quantity,
            unitPriceCents: l.unitPriceCents!,
            lineTotalCents: l.unitPriceCents! * l.quantity,
            createdAt: now,
          }),
        ),
        db.insert(orderEvents).values({
          id: id('oev'),
          orderId,
          fromStatus: 'none',
          toStatus: 'submitted',
          note: `Submitted by the customer. Research-use acknowledgement version ${RUO_VERSION} confirmed for this order.`,
          actor: `${account.name} (${account.id})`,
          createdAt: now,
        }),
        // The cart is cleared in the same transaction as the order is written.
        db.delete(cartItems).where(eq(cartItems.accountId, account.id)),
      ]);
      return { ok: true, orderNumber };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/UNIQUE constraint failed: orders\.submission_token/i.test(message)) {
        const [dup] = await db.select({ orderNumber: orders.orderNumber }).from(orders).where(and(eq(orders.submissionToken, submissionToken), eq(orders.accountId, account.id))).limit(1);
        if (dup) return { ok: true, orderNumber: dup.orderNumber, duplicate: true };
        return { ok: false, error: 'This cart was already submitted.' };
      }
      if (/UNIQUE constraint failed/i.test(message) && attempt < 2) continue;
      throw error;
    }
  }
  return { ok: false, error: 'The order could not be numbered. Try again.' };
}

export type OrderDetail = { order: Order; items: OrderItem[]; events: OrderEvent[] };

export async function listOrdersForAccount(accountId: string, limit = 200): Promise<Order[]> {
  const db = getDb();
  return db.select().from(orders).where(eq(orders.accountId, accountId)).orderBy(desc(orders.submittedAt)).limit(limit);
}

export async function getOrderForAccount(accountId: string, orderNumber: string): Promise<OrderDetail | null> {
  const db = getDb();
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.orderNumber, orderNumber), eq(orders.accountId, accountId)))
    .limit(1);
  if (!order) return null;
  return withDetail(order);
}

export async function getOrderByNumber(orderNumber: string): Promise<OrderDetail | null> {
  const db = getDb();
  const [order] = await db.select().from(orders).where(eq(orders.orderNumber, orderNumber)).limit(1);
  if (!order) return null;
  return withDetail(order);
}

async function withDetail(order: Order): Promise<OrderDetail> {
  const db = getDb();
  const [items, events] = await Promise.all([
    db.select().from(orderItems).where(eq(orderItems.orderId, order.id)).orderBy(asc(orderItems.createdAt)),
    db.select().from(orderEvents).where(eq(orderEvents.orderId, order.id)).orderBy(asc(orderEvents.createdAt)),
  ]);
  return { order, items, events };
}

export async function listAllOrders(): Promise<Order[]> {
  const db = getDb();
  return db.select().from(orders).orderBy(desc(orders.submittedAt));
}

/**
 * The only path that changes an order's status. One batch: a conditional
 * update stamped with a fresh transition id, then an event row inserted only
 * where the order now carries that id. A lost race writes nothing.
 */
export async function transitionOrder(
  order: Order,
  to: OrderStatus,
  by: 'staff' | 'customer' | 'system',
  actor: string,
  note: string | null,
  extra: Partial<Pick<typeof orders.$inferInsert, 'paymentMethod' | 'paymentRef' | 'paymentStatus' | 'paidAt' | 'carrier' | 'trackingNumber' | 'shippedAt' | 'refundDueCents'>> = {},
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!canTransition(order.status, to, by)) {
    return { ok: false, error: `An order that is ${order.status} cannot be moved to ${to} by ${by}.` };
  }
  const db = getDb();
  const now = new Date();
  const transitionId = id('otr');
  const [changed] = await db.batch([
    db
      .update(orders)
      .set({
        ...extra,
        status: to,
        lastTransitionId: transitionId,
        updatedAt: now,
        ...(to === 'cancelled' ? { cancelledAt: now, cancelReason: note } : {}),
      })
      .where(and(eq(orders.id, order.id), eq(orders.status, order.status)))
      .returning({ id: orders.id }),
    db.insert(orderEvents).select(
      db
        .select({
          id: sql<string>`${id('oev')}`.as('id'),
          orderId: orders.id,
          fromStatus: sql<string>`${order.status}`.as('from_status'),
          toStatus: sql<string>`${to}`.as('to_status'),
          note: sql<string | null>`${note}`.as('note'),
          actor: sql<string>`${actor}`.as('actor'),
          createdAt: sql<number>`${Math.floor(now.getTime() / 1000)}`.as('created_at'),
        })
        .from(orders)
        .where(and(eq(orders.id, order.id), eq(orders.lastTransitionId, transitionId))),
    ),
  ]);
  if (!changed || changed.length === 0) {
    return { ok: false, error: 'The order changed while you were working. Reload and try again.' };
  }
  return { ok: true };
}

/* ------------------------------------------------------------------------ */
/* Payment                                                                   */
/* ------------------------------------------------------------------------ */

export type BeginPaymentResult = { ok: true; instructions: PaymentInstructions } | { ok: false; error: string };

/**
 * Customer chooses a payment method for a submitted order. Moves the order
 * to awaiting_payment with the method and provider reference recorded, and
 * queues a notice linking to the secure instructions page. Re-choosing is
 * allowed only while still submitted.
 */
export async function beginPayment(detail: OrderDetail, methodId: string, _accountEmail: string, actor: string): Promise<BeginPaymentResult> {
  const method = getPaymentMethod(methodId);
  if (!method) return { ok: false, error: 'That payment method is not available.' };
  if (detail.order.status !== 'submitted') return { ok: false, error: 'Payment has already been set up for this order.' };

  let instructions: PaymentInstructions;
  try {
    instructions = await method.begin(detail.order);
  } catch (error) {
    console.error('[payments] begin failed', error instanceof Error ? error.message : error);
    return { ok: false, error: 'The payment could not be set up. Try again shortly or choose another method.' };
  }

  const moved = await transitionOrder(detail.order, 'awaiting_payment', 'system', actor, `Payment method: ${method.label}.`, {
    paymentMethod: method.id,
    paymentRef: instructions.reference,
    paymentStatus: 'pending',
  });
  if (!moved.ok) return { ok: false, error: moved.error };
  return { ok: true, instructions };
}

/** Rebuild the instructions for display from what is stored on the order. */
export async function paymentInstructionsFor(order: Order): Promise<PaymentInstructions | null> {
  if (!order.paymentMethod) return null;
  const method = getPaymentMethod(order.paymentMethod);
  if (!method) {
    return {
      method: order.paymentMethod as PaymentInstructions['method'],
      title: 'Contact us before sending payment',
      lines: ['This payment method is no longer available. Ask staff to confirm the instructions.', `Reference: ${order.paymentRef ?? order.orderNumber}`],
      url: null,
      reference: order.paymentRef,
    };
  }
  if (method.id === 'btcpay') {
    // Never re-create the invoice; rebuild the checkout link from configuration.
    return {
      method: 'btcpay',
      title: 'Bitcoin invoice',
      lines: [
        `Amount: ${(order.totalCents / 100).toFixed(2)} ${order.currency}`,
        `Invoice: ${order.paymentRef ?? '—'}`,
        'Open the payment page to pay. The order is marked paid automatically once the payment settles.',
      ],
      url: order.paymentRef ? btcpayCheckoutUrl(order.paymentRef) : null,
      reference: order.paymentRef,
    };
  }
  return method.begin(order);
}

/** A staff member records that payment arrived (bank transfer, or any manual rail). Admin only, enforced by the caller. */
export async function markOrderPaid(detail: OrderDetail, actor: string, reference: string | null, _accountEmail: string) {
  const now = new Date();
  const moved = await transitionOrder(detail.order, 'paid', 'staff', actor, reference ? `Payment received. Reference: ${reference}.` : 'Payment received.', {
    paymentStatus: 'paid',
    paidAt: now,
    ...(reference ? { paymentRef: reference } : {}),
  });
  if (!moved.ok) return moved;
  return moved;
}

/** A settled BTCPay invoice marks its order paid. Idempotent: an already-paid order is left alone. */
export async function settleBtcpayInvoice(orderNumber: string, invoiceId: string): Promise<{ ok: boolean; note: string }> {
  const detail = await getOrderByNumber(orderNumber);
  if (!detail) return { ok: false, note: 'unknown order' };
  if (detail.order.paymentMethod !== 'btcpay' || detail.order.paymentRef !== invoiceId) return { ok: false, note: 'invoice does not match order' };
  if (detail.order.status === 'paid' || detail.order.paymentStatus === 'paid') return { ok: true, note: 'already paid' };
  const moved = await transitionOrder(detail.order, 'paid', 'system', 'BTCPay Server', `Invoice ${invoiceId} settled.`, {
    paymentStatus: 'paid',
    paidAt: new Date(),
  });
  return moved.ok ? { ok: true, note: 'paid' } : { ok: false, note: moved.error };
}

/** Customer cancels an unpaid order. A pending BTCPay invoice is invalidated so a late payment is not accepted. */
export async function cancelOrderByCustomer(detail: OrderDetail, actor: string, reason: string | null) {
  const moved = await transitionOrder(detail.order, 'cancelled', 'customer', actor, reason ?? 'Cancelled by the customer.', {
    paymentStatus: detail.order.paymentStatus === 'pending' ? 'failed' : detail.order.paymentStatus,
  });
  if (moved.ok && detail.order.paymentMethod === 'btcpay' && detail.order.paymentRef) {
    await invalidateBtcpayInvoice(detail.order.paymentRef);
  }
  return moved;
}

/* ------------------------------------------------------------------------ */
/* Refunds                                                                   */
/* ------------------------------------------------------------------------ */

/**
 * Record that money went back to the customer. Payment-only: the order status
 * is unchanged (cancelled or shipped-and-returned). Guarded by a fresh
 * transition marker so two admins cannot both record it, and the event row is
 * written only where the marker landed.
 */
export async function recordRefund(
  detail: OrderDetail,
  amountCents: number,
  reference: string,
  actor: string,
  _accountEmail: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) return { ok: false, error: 'The refund must be a positive whole number of cents.' };
  reference = reference.trim();
  if (!reference || reference.length > 120) return { ok: false, error: 'Enter a bank or provider reference of at most 120 characters.' };
  const order = detail.order;
  if (!refundAllowed(order)) return { ok: false, error: `No refund is due on an order whose payment is ${order.paymentStatus}.` };
  const due = refundDue(order);
  const already = order.refundCents ?? 0;
  if (amountCents > due - already) return { ok: false, error: `The refund cannot exceed the $${((due - already) / 100).toFixed(2)} still owed.` };
  const db = getDb();
  const now = new Date();
  const marker = id('otr');
  const complete = already + amountCents >= due;
  const note = `Refund of $${(amountCents / 100).toFixed(2)} recorded (${((already + amountCents) / 100).toFixed(2)} of ${(due / 100).toFixed(2)} owed). Reference: ${reference}.`;
  const [changed] = await db.batch([
    db
      .update(orders)
      .set({
        // Cumulative: an under-refund can be topped up with a further reference; the first date is kept.
        paymentStatus: complete ? 'refunded' : 'refund_due',
        refundCents: sql`COALESCE(${orders.refundCents}, 0) + ${amountCents}`,
        refundRef: reference,
        refundedAt: sql`COALESCE(${orders.refundedAt}, ${Math.floor(now.getTime() / 1000)})`,
        lastTransitionId: marker,
        updatedAt: now,
      })
      .where(and(eq(orders.id, order.id), eq(orders.paymentStatus, 'refund_due'), sql`COALESCE(${orders.refundCents}, 0) = ${already}`))
      .returning({ id: orders.id }),
    db.insert(orderEvents).select(
      db
        .select({
          id: sql<string>`${id('oev')}`.as('id'),
          orderId: orders.id,
          fromStatus: orders.status,
          toStatus: orders.status,
          note: sql<string>`${note}`.as('note'),
          actor: sql<string>`${actor}`.as('actor'),
          createdAt: sql<number>`${Math.floor(now.getTime() / 1000)}`.as('created_at'),
        })
        .from(orders)
        .where(and(eq(orders.id, order.id), eq(orders.lastTransitionId, marker))),
    ),
  ]);
  if (!changed || changed.length === 0) return { ok: false, error: 'The order changed while you were working. Reload and try again.' };
  return { ok: true };
}
