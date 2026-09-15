import { and, desc, eq, inArray, like, sql, isNull } from 'drizzle-orm';
import { STOREFRONT_COPY } from '@/lib/storefront-copy';
import { getDb } from '@/db';
import {
  accounts,
  cartItems,
  lots,
  orderEvents,
  orderItems,
  orders,
  type Order,
  type Organization,
} from '@/db/schema';
import type { AccountPrincipal } from '@/lib/account-auth';
import { getCart, type Cart } from '@/lib/cart';
import {
  RUO_VERSION,
  TERMS_VERSION,
  GUEST_CHECKOUT_TERMS_VERSION,
} from '@/lib/policy';
import { buildOrderAttestation } from '@/lib/attestation';
import {
  btcpayCheckoutUrl,
  getPaymentMethod,
  invalidateBtcpayInvoice,
  type PaymentInstructions,
} from '@/lib/payments';
import {
  canTransition,
  formatOrderNumber,
  orderTotals,
  refundAllowed,
  refundDue,
  type OrderStatus,
} from '@/lib/order-rules';
import type { Visibility } from '@/lib/visibility-rules';
import { conditionalInsert } from '@/lib/conditional-insert';
import { openCheckoutEnabled } from '@/lib/site-config';
import { orderSubmissionGuard } from '@/lib/order-submission-guard';
import { beginClaimedPayment } from '@/lib/payment-attempts';
import {
  checkoutQuotes,
  inventoryReservations,
  paymentAttempts,
  zellePaymentClaims,
} from '@/db/commerce-schema';
import { attachPaymentAttempt } from '@/lib/payment-attempts';
import {
  checkAllocatableStock,
  planReservations,
  reservationMinutes,
  reservationPlanGuard,
  reservationEligibility,
} from '@/lib/inventory-reservations';
import {
  acceptedCheckoutQuote,
  checkoutQuotesRequired,
} from '@/lib/checkout-quotes';
import { getOrderByNumber, type OrderDetail } from '@/lib/order-reads';

export {
  getOrderByNumber,
  getOrderForAccount,
  type OrderDetail,
} from '@/lib/order-reads';

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
export function shipToFromOrganization(
  org: Organization,
  account: AccountPrincipal,
): ShipTo {
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
    .where(
      and(
        eq(lots.status, 'released'),
        isNull(lots.supersededById),
        sql`${lots.productCode} IN ${codes}`,
      ),
    );
  return new Set(rows.map((r) => r.code));
}

export type CreateOrderResult =
  | { ok: true; orderNumber: string; orderId?: string; duplicate?: boolean }
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
  contactEmail: string | null = null,
  checkoutQuoteId: string | null = null,
  evidence: { from: string | null; researchSetting: string | null; ageConfirmed: boolean } = {
    from: null,
    researchSetting: null,
    ageConfirmed: false,
  },
): Promise<CreateOrderResult> {
  if (visibility.pricing === 'none')
    return {
      ok: false,
      error: 'Ordering is not available to your account yet.',
    };
  if (
    !openCheckoutEnabled() &&
    (account.tier !== 'institutional' ||
      visibility.pricing !== 'institutional' ||
      !organizationId)
  )
    return {
      ok: false,
      error: STOREFRONT_COPY.orderingRequiresWholesale,
    };
  if (
    openCheckoutEnabled() &&
    !organizationId &&
    (!contactEmail ||
      !shipTo.consigneeName ||
      !shipTo.line1 ||
      !shipTo.city ||
      !shipTo.region ||
      !shipTo.postalCode ||
      shipTo.country !== 'US')
  )
    return {
      ok: false,
      error: 'Complete your checkout contact and delivery details.',
    };
  if (!/^[a-f0-9]{32}$/.test(submissionToken))
    return { ok: false, error: 'Reload the cart and try again.' };
  const db = getDb();
  // Idempotent: the same rendered cart form can only ever produce one order.
  const [already] = await db
    .select({ orderNumber: orders.orderNumber, id: orders.id })
    .from(orders)
    .where(
      and(
        eq(orders.submissionToken, submissionToken),
        eq(orders.accountId, account.id),
      ),
    )
    .limit(1);
  if (already)
    return { ok: true, orderNumber: already.orderNumber, orderId: already.id, duplicate: true };
  const cart: Cart = await getCart(account.id, visibility);
  if (cart.lines.length === 0)
    return { ok: false, error: 'Your cart is empty.' };
  if (!cart.orderable)
    return {
      ok: false,
      error: 'Fix the lines marked in your cart before submitting.',
    };

  const released = await releasedProductCodes([
    ...new Set(cart.lines.map((l) => l.product.code)),
  ]);
  const unavailable = cart.lines.filter((l) => !released.has(l.product.code));
  if (unavailable.length) {
    return {
      ok: false,
      error: `No released lot is available for: ${[...new Set(unavailable.map((l) => l.product.name))].join(', ')}. Email research@nexphaselabs.net for lead times.`,
    };
  }

  const now = new Date();
  const quote = checkoutQuoteId
    ? await acceptedCheckoutQuote(
        checkoutQuoteId,
        account.id,
        cart,
        shipTo,
        contactEmail,
        now,
      )
    : null;
  // Both checkout modes: a wholesale order is quoted for its organization's
  // address the way a guest order is quoted for the address typed in.
  if (checkoutQuotesRequired() && !quote)
    return {
      ok: false,
      error: 'Compare delivery options again and choose a current delivery rate.',
    };
  if (checkoutQuoteId && !quote)
    return {
      ok: false,
      error:
        'The selected delivery quote expired or no longer matches this cart and address.',
    };
  const lines = cart.lines.map((l) => ({
    unitPriceCents: l.unitPriceCents!,
    quantity: l.quantity,
  }));
  const totals = orderTotals(
    lines,
    quote?.shippingCents ?? 0,
    quote?.taxCents ?? 0,
  );
  const orderId = id('ord');
  const accepted = eq(orders.id, orderId);
  const itemIds = new Map(cart.lines.map((line) => [line.itemId, id('oli')]));
  const allocationLines = cart.lines.map((line) => ({
    itemId: itemIds.get(line.itemId)!,
    code: line.product.code,
    packSize: line.variant.quantity,
    packs: line.quantity,
  }));
  // Reservations hold stock for the order. With them switched off (production today), a
  // line that no single released lot can supply is still refused rather than sold.
  const allocation = reservationMinutes()
    ? await planReservations(allocationLines, now)
    : null;
  if (allocation && !allocation.ok) return allocation;
  if (!allocation) {
    const supply = await checkAllocatableStock(allocationLines, now);
    if (!supply.ok) return supply;
  }
  const plan = allocation?.ok ? allocation.plan : null;

  const attestation = await buildOrderAttestation({
    guest: openCheckoutEnabled() && !organizationId,
    now,
    from: evidence.from,
    researchSetting: evidence.researchSetting,
    ageConfirmed: evidence.ageConfirmed,
  });

  for (let attempt = 0; attempt < 3; attempt++) {
    const orderNumber = await nextOrderNumber(now);
    try {
      const [created] = await db.batch([
        conditionalInsert(
          orders,
          {
            id: orderId,
            orderNumber,
            accountId: account.id,
            organizationId,
            contactEmail,
            channel: organizationId ? 'research_direct' : 'guest_checkout',
            authorizationRef: null,
            status: 'submitted',
            currency: 'USD',
            subtotalCents: totals.subtotalCents,
            shippingCents: totals.shippingCents,
            taxCents: totals.taxCents,
            totalCents: totals.totalCents,
            shippingQuoteId: quote?.id ?? null,
            shippingRateId: quote?.rateId ?? null,
            shippingService: quote
              ? `${quote.carrier} ${quote.serviceName}`
              : null,
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
            ruoVersion: attestation.ruoVersion,
            termsVersion: attestation.termsVersion,
            acknowledgementHash: attestation.acknowledgementHash,
            acknowledgedAt: attestation.acknowledgedAt,
            acknowledgedFrom: attestation.acknowledgedFrom,
            ageConfirmed: attestation.ageConfirmed,
            researchSetting: attestation.researchSetting,
            submittedAt: now,
            createdAt: now,
            updatedAt: now,
          },
          accounts,
          and(
            orderSubmissionGuard(account, organizationId, shipTo, cart, now),
            plan ? reservationPlanGuard(plan, now) : sql`1 = 1`,
            quote
              ? sql`EXISTS (SELECT 1 FROM ${checkoutQuotes} WHERE ${checkoutQuotes.id} = ${quote.id} AND ${checkoutQuotes.accountId} = ${account.id} AND ${checkoutQuotes.expiresAt} > ${Math.floor(now.getTime() / 1000)})`
              : sql`1 = 1`,
          )!,
        ).returning({ id: orders.id }),
        ...cart.lines.map((l) =>
          conditionalInsert(
            orderItems,
            {
              id: itemIds.get(l.itemId)!,
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
            },
            orders,
            accepted,
          ),
        ),
        ...(plan
          ? plan.lines.map((line) =>
              conditionalInsert(
                inventoryReservations,
                {
                  ...line,
                  orderId,
                  expiresAt: plan.expiresAt,
                  createdAt: now,
                },
                orders,
                accepted,
              ),
            )
          : []),
        conditionalInsert(
          orderEvents,
          {
            id: id('oev'),
            orderId,
            fromStatus: 'none',
            toStatus: 'submitted',
            note: `Submitted by the customer. Research-use acknowledgement version ${RUO_VERSION} and terms ${openCheckoutEnabled() && !organizationId ? GUEST_CHECKOUT_TERMS_VERSION : TERMS_VERSION} confirmed for this order.${quote ? ` Accepted ${quote.carrier} ${quote.serviceName}; shipping ${(quote.shippingCents / 100).toFixed(2)} USD and tax ${(quote.taxCents / 100).toFixed(2)} USD.` : ''}`,
            actor: `${account.name} (${account.id})`,
            createdAt: now,
          },
          orders,
          accepted,
        ),
        // The cart is cleared in the same transaction as the order is written.
        db
          .delete(cartItems)
          .where(
            and(
              eq(cartItems.accountId, account.id),
              sql`EXISTS (SELECT 1 FROM ${orders} WHERE ${accepted})`,
            ),
          ),
      ]);
      if (!created.length) {
        // A competing submission may have cleared this cart after our first
        // idempotency read. Return its order, never a false failure or a new one.
        const [duplicate] = await db
          .select({ orderNumber: orders.orderNumber })
          .from(orders)
          .where(
            and(
              eq(orders.submissionToken, submissionToken),
              eq(orders.accountId, account.id),
            ),
          )
          .limit(1);
        if (duplicate)
          return {
            ok: true,
            orderNumber: duplicate.orderNumber,
            duplicate: true,
          };
        return {
          ok: false,
          error:
            'Your account, delivery address, cart or available offer changed. Reload and review before submitting again.',
        };
      }
      return { ok: true, orderNumber, orderId };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/UNIQUE constraint failed: orders\.submission_token/i.test(message)) {
        const [dup] = await db
          .select({ orderNumber: orders.orderNumber, id: orders.id })
          .from(orders)
          .where(
            and(
              eq(orders.submissionToken, submissionToken),
              eq(orders.accountId, account.id),
            ),
          )
          .limit(1);
        if (dup)
          return { ok: true, orderNumber: dup.orderNumber, orderId: dup.id, duplicate: true };
        return { ok: false, error: 'This cart was already submitted.' };
      }
      if (/UNIQUE constraint failed/i.test(message) && attempt < 2) continue;
      throw error;
    }
  }
  return { ok: false, error: 'The order could not be numbered. Try again.' };
}

export async function listOrdersForAccount(
  accountId: string,
  limit = 200,
): Promise<Order[]> {
  const db = getDb();
  return db
    .select()
    .from(orders)
    .where(eq(orders.accountId, accountId))
    .orderBy(desc(orders.submittedAt))
    .limit(limit);
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
  extra: Partial<
    Pick<
      typeof orders.$inferInsert,
      | 'paymentMethod'
      | 'paymentRef'
      | 'paymentStatus'
      | 'paidAt'
      | 'carrier'
      | 'trackingNumber'
      | 'shippedAt'
      | 'refundDueCents'
    >
  > = {},
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!canTransition(order.status, to, by)) {
    return {
      ok: false,
      error: `An order that is ${order.status} cannot be moved to ${to} by ${by}.`,
    };
  }
  const db = getDb();
  const now = new Date();
  const transitionId = id('otr');
  const allocation = ['paid', 'fulfilling'].includes(to)
    ? await reservationEligibility(order.id, now)
    : null;
  if (allocation && !allocation.valid)
    return {
      ok: false,
      error:
        'The stock reservation expired or the allocated lot is unavailable. Staff must review the order before payment or shipment.',
    };
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
      .where(
        and(
          eq(orders.id, order.id),
          eq(orders.status, order.status),
          eq(orders.paymentStatus, order.paymentStatus),
          sql`${orders.paymentRef} IS ${order.paymentRef}`,
          sql`${orders.lastTransitionId} IS ${order.lastTransitionId}`,
          allocation?.guard ?? sql`1 = 1`,
        ),
      )
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
          createdAt: sql<number>`${Math.floor(now.getTime() / 1000)}`.as(
            'created_at',
          ),
        })
        .from(orders)
        .where(
          and(
            eq(orders.id, order.id),
            eq(orders.lastTransitionId, transitionId),
          ),
        ),
    ),
  ]);
  if (!changed || changed.length === 0) {
    return {
      ok: false,
      error: 'The order changed while you were working. Reload and try again.',
    };
  }
  return { ok: true };
}

/* ------------------------------------------------------------------------ */
/* Payment                                                                   */
/* ------------------------------------------------------------------------ */

export type BeginPaymentResult =
  | { ok: true; instructions: PaymentInstructions }
  | { ok: false; error: string };

/**
 * Customer chooses a payment method for a submitted order. Moves the order
 * to awaiting_payment with the method and provider reference recorded, and
 * queues a notice linking to the secure instructions page. Re-choosing is
 * allowed only while still submitted.
 */
export async function beginPayment(
  detail: OrderDetail,
  methodId: string,
  _accountEmail: string,
  actor: string,
): Promise<BeginPaymentResult> {
  const method = getPaymentMethod(methodId);
  if (!method)
    return { ok: false, error: 'That payment method is not available.' };
  if (detail.order.status !== 'submitted')
    return {
      ok: false,
      error: 'Payment has already been set up for this order.',
    };

  const allocation = await reservationEligibility(detail.order.id);
  if (!allocation.valid)
    return {
      ok: false,
      error:
        'Your stock reservation expired or the lot is unavailable. Cancel this unpaid order and return to your cart, or contact support.',
    };
  return beginClaimedPayment(detail.order, method, actor);
}

/** Rebuild the instructions for display from what is stored on the order. */
export async function paymentInstructionsFor(
  order: Order,
): Promise<PaymentInstructions | null> {
  if (!order.paymentMethod) return null;
  const method = getPaymentMethod(order.paymentMethod);
  if (!method) {
    return {
      method: order.paymentMethod as PaymentInstructions['method'],
      title: 'Contact us before sending payment',
      lines: [
        'This payment method is no longer available. Ask staff to confirm the instructions.',
        `Reference: ${order.paymentRef ?? order.orderNumber}`,
      ],
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
export async function markOrderPaid(
  detail: OrderDetail,
  actor: string,
  reference: string | null,
) {
  const now = new Date();
  const allocation = await reservationEligibility(detail.order.id, now);
  let moved: Awaited<ReturnType<typeof transitionOrder>>;
  // Money that arrives after the reservation lapsed cancels the order with a refund due,
  // and the caller has to say so rather than report a paid order.
  const cancelledForStock = allocation.tracked && !allocation.valid;
  if (cancelledForStock) {
    moved = await transitionOrder(
      detail.order,
      'cancelled',
      'staff',
      actor,
      'Payment received after stock reservation expiry or lot unavailability. Refund review required; no shipment authorized.',
      {
        paymentStatus: 'refund_due',
        paidAt: now,
        refundDueCents: detail.order.totalCents,
        ...(reference ? { paymentRef: reference } : {}),
      },
    );
  } else {
    moved = await transitionOrder(
      detail.order,
      'paid',
      'staff',
      actor,
      reference
        ? `Payment received. Reference: ${reference}.`
        : 'Payment received.',
      {
        paymentStatus: 'paid',
        paidAt: now,
        ...(reference ? { paymentRef: reference } : {}),
      },
    );
  }
  if (!moved.ok) return moved;
  if (detail.order.paymentMethod === 'zelle') {
    await getDb()
      .update(zellePaymentClaims)
      .set({ status: 'matched', updatedAt: now })
      .where(
        and(
          eq(zellePaymentClaims.orderId, detail.order.id),
          inArray(zellePaymentClaims.status, ['pending', 'review']),
        ),
      );
  }
  return { ...moved, outcome: cancelledForStock ? ('cancelled' as const) : ('paid' as const) };
}

/** Record a matched settlement once, including money arriving after cancellation.
 * Cancellation never erases incoming money or reopens fulfilment: the existing
 * refund-obligation workflow handles it; this function never transfers funds. */
export async function settleBtcpayInvoice(
  orderNumber: string,
  invoiceId: string,
): Promise<{ ok: boolean; note: string; retryable?: boolean; unmatched?: boolean }> {
  const db = getDb();
  // Re-read once if cancellation/another settlement wins during the batch.
  for (let attempt = 0; attempt < 2; attempt++) {
    const detail = await getOrderByNumber(orderNumber);
    if (!detail) return { ok: false, note: 'unknown order', unmatched: true };
    const order = detail.order;
    if (order.paymentMethod !== 'btcpay' || order.paymentRef !== invoiceId) {
      const [attempt] = await db
        .select()
        .from(paymentAttempts)
        .where(eq(paymentAttempts.orderId, order.id))
        .limit(1);
      if (
        attempt?.method === 'btcpay' &&
        attempt.reference === invoiceId &&
        ['ready', 'attached'].includes(attempt.state)
      ) {
        const attached = await attachPaymentAttempt(order.id);
        if (attached) continue;
      }
      // A signed settlement can arrive after an uncertain provider response and before
      // the invoice reference was recovered locally. Ask BTCPay to redeliver; never guess.
      if (
        attempt?.method === 'btcpay' &&
        !attempt.reference &&
        ['requesting', 'attention'].includes(attempt.state)
      )
        return {
          ok: false,
          note: 'payment request needs reconciliation before settlement can attach',
          retryable: true,
        };
      return { ok: false, note: 'invoice does not match order', unmatched: true };
    }
    if (
      order.paidAt ||
      ['paid', 'refund_due', 'refunded'].includes(order.paymentStatus)
    )
      return { ok: true, note: 'settlement already recorded' };
    const allocation = await reservationEligibility(order.id);
    const cancelled =
      order.status === 'cancelled' || (allocation.tracked && !allocation.valid);
    if (order.status !== 'awaiting_payment' && order.status !== 'cancelled')
      return {
        ok: false,
        note: 'order is not ready for settlement',
        retryable: true,
      };
    const now = new Date();
    const marker = id('otr');
    const note = cancelled
      ? `Invoice ${invoiceId} settled after cancellation. Payment recorded; refund review required. No shipment authorized.`
      : `Invoice ${invoiceId} settled.`;
    const [changed] = await db.batch([
      db
        .update(orders)
        .set({
          status: cancelled ? 'cancelled' : 'paid',
          paymentStatus: cancelled ? 'refund_due' : 'paid',
          paidAt: now,
          ...(cancelled && order.status !== 'cancelled'
            ? {
                cancelledAt: now,
                cancelReason:
                  'Stock reservation expired or allocated lot unavailable when payment settled.',
              }
            : {}),
          ...(cancelled ? { refundDueCents: order.totalCents } : {}),
          lastTransitionId: marker,
          updatedAt: now,
        })
        .where(
          and(
            eq(orders.id, order.id),
            eq(orders.status, order.status),
            eq(orders.paymentStatus, order.paymentStatus),
            eq(orders.paymentMethod, 'btcpay'),
            eq(orders.paymentRef, invoiceId),
            isNull(orders.paidAt),
            sql`${orders.lastTransitionId} IS ${order.lastTransitionId}`,
            allocation.valid
              ? allocation.guard
              : sql`NOT (${allocation.guard})`,
          ),
        )
        .returning({ id: orders.id }),
      conditionalInsert(
        orderEvents,
        {
          id: id('oev'),
          orderId: order.id,
          fromStatus: order.status,
          toStatus: cancelled ? 'cancelled' : 'paid',
          note,
          actor: 'BTCPay Server',
          createdAt: now,
        },
        orders,
        and(eq(orders.id, order.id), eq(orders.lastTransitionId, marker))!,
      ),
    ]);
    if (changed.length)
      return {
        ok: true,
        note: cancelled
          ? 'late payment recorded; refund review required'
          : 'paid',
      };
  }
  return {
    ok: false,
    note: 'order changed during settlement; retry required',
    retryable: true,
  };
}

/** Cancel an unpaid order and request invoice invalidation. A later settlement
 * can still arrive and must be recorded separately, never silently discarded. */
export async function cancelOrderByCustomer(
  detail: OrderDetail,
  actor: string,
  reason: string | null,
) {
  const moved = await transitionOrder(
    detail.order,
    'cancelled',
    'customer',
    actor,
    reason ?? 'Cancelled by the customer.',
    {
      paymentStatus:
        detail.order.paymentStatus === 'pending'
          ? 'failed'
          : detail.order.paymentStatus,
    },
  );
  if (
    moved.ok &&
    detail.order.paymentMethod === 'btcpay' &&
    detail.order.paymentRef
  ) {
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
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0)
    return {
      ok: false,
      error: 'The refund must be a positive whole number of cents.',
    };
  reference = reference.trim();
  if (!reference || reference.length > 120)
    return {
      ok: false,
      error: 'Enter a bank or provider reference of at most 120 characters.',
    };
  const order = detail.order;
  if (!refundAllowed(order))
    return {
      ok: false,
      error: `No refund is due on an order whose payment is ${order.paymentStatus}.`,
    };
  const due = refundDue(order);
  const already = order.refundCents ?? 0;
  if (amountCents > due - already)
    return {
      ok: false,
      error: `The refund cannot exceed the $${((due - already) / 100).toFixed(2)} still owed.`,
    };
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
      .where(
        and(
          eq(orders.id, order.id),
          eq(orders.paymentStatus, 'refund_due'),
          sql`COALESCE(${orders.refundCents}, 0) = ${already}`,
          sql`COALESCE(${orders.refundDueCents}, ${orders.totalCents}) = ${due}`,
        ),
      )
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
          createdAt: sql<number>`${Math.floor(now.getTime() / 1000)}`.as(
            'created_at',
          ),
        })
        .from(orders)
        .where(
          and(eq(orders.id, order.id), eq(orders.lastTransitionId, marker)),
        ),
    ),
  ]);
  if (!changed || changed.length === 0)
    return {
      ok: false,
      error: 'The order changed while you were working. Reload and try again.',
    };
  return { ok: true };
}
