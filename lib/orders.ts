import { and, desc, eq, inArray, like, sql, isNull } from 'drizzle-orm';
import { accrueCommission, reverseCommissionForOrder } from '@/lib/affiliates';
import { STOREFRONT_COPY } from '@/lib/storefront-copy';
import { getDb } from '@/db';
import { accounts, cartItems, lots, orderEvents, orderItems, orders, type Order, type Organization, couponRedemptions } from '@/db/schema';
import type { AccountPrincipal } from '@/lib/account-auth';
import { getCart, type Cart } from '@/lib/cart';
import {
  RUO_VERSION,
  TERMS_VERSION,
  GUEST_CHECKOUT_TERMS_VERSION,
} from '@/lib/policy';
import { buildOrderAttestation } from '@/lib/attestation';
import { claimCouponRedemption, COUPON_COPY, evaluateCoupon, releaseCouponRedemption } from '@/lib/coupons';
import {
  btcpayCheckoutUrl,
  dollarAmount,
  getPaymentMethod,
  invalidateBtcpayInvoice,
  type PaymentInstructions,
} from '@/lib/payments';
import {
  canTransition,
  formatOrderNumber,
  lineTotal,
  orderTotals,
  refundAllowed,
  refundDue,
  type OrderStatus,
} from '@/lib/order-rules';
import { safeAdd } from '@/lib/safe-integer';
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
import { recordCommerceEvent } from '@/lib/commerce-events';
import {
  planReservations,
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
  let cart: Cart;
  try {
    cart = await getCart(account.id, visibility);
  } catch (error) {
    if (error instanceof RangeError)
      return {
        ok: false,
        error: error.message || 'The cart quantity or total cannot be represented safely.',
      };
    throw error;
  }
  if (cart.lines.length === 0)
    return { ok: false, error: 'Your cart is empty.' };

  // Cart quantities are persisted server-side, but still treat every database
  // value as untrusted. In particular, do not let a manually corrupted row turn
  // into an imprecise order amount or reservation.
  let reviewedSubtotalCents = 0;
  const reviewedLineTotals = new Map<string, number>();
  try {
    for (const line of cart.lines) {
      if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0)
        return {
          ok: false,
          error: `${line.variant.sku}: quantity must be a positive safe whole number.`,
        };
      if (
        line.unitPriceCents !== null &&
        (!Number.isSafeInteger(line.unitPriceCents) ||
          line.unitPriceCents < 0)
      )
        return {
          ok: false,
          error: `${line.variant.sku}: the current unit price cannot be represented safely.`,
        };
      // A null price has a specific cart problem (priced on request, retired,
      // or otherwise unavailable). Preserve that normal refusal below rather
      // than misreporting it as arithmetic corruption.
      if (line.unitPriceCents === null) continue;
      const total = lineTotal({
        unitPriceCents: line.unitPriceCents,
        quantity: line.quantity,
      });
      reviewedLineTotals.set(line.itemId, total);
      reviewedSubtotalCents = safeAdd(
        reviewedSubtotalCents,
        total,
        'Order subtotal',
      );
    }
  } catch (error) {
    if (error instanceof RangeError)
      return {
        ok: false,
        error:
          'The cart amount is too large to calculate safely. Reduce the quantity and try again.',
      };
    throw error;
  }
  if (!cart.orderable)
    return {
      ok: false,
      error:
        cart.lines.find((line) => line.problem)?.problem ??
        'Fix the lines marked in your cart before submitting.',
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
  // The promo code priced into the accepted quote is checked again now, at the
  // moment it is spent; a code that stopped applying in between refuses the order.
  let coupon: Awaited<ReturnType<typeof evaluateCoupon>> | null = null;
  if (quote?.couponCode) {
    coupon = await evaluateCoupon(quote.couponCode, account.id, reviewedSubtotalCents, now);
    if (!coupon.ok)
      return { ok: false, error: `${coupon.error} Compare delivery options again.` };
    if (coupon.discountCents !== quote.discountCents)
      return {
        ok: false,
        error: 'The promo code no longer gives the discount on the delivery quote. Compare delivery options again.',
      };
  }
  let totals: ReturnType<typeof orderTotals>;
  try {
    totals = orderTotals(
      cart.lines.map((line) => ({
        unitPriceCents: line.unitPriceCents!,
        quantity: line.quantity,
      })),
      quote?.shippingCents ?? 0,
      quote?.taxCents ?? 0,
      quote?.discountCents ?? 0,
    );
  } catch (error) {
    if (error instanceof RangeError)
      return {
        ok: false,
        error:
          'The order total or delivery quote cannot be calculated safely. Review the cart and delivery option.',
      };
    throw error;
  }
  // A cart implementation change must not be able to make coupon evaluation
  // and the immutable order snapshot disagree.
  if (totals.subtotalCents !== reviewedSubtotalCents)
    return {
      ok: false,
      error: 'The cart total changed while it was being reviewed. Reload and try again.',
    };

  // Take the redemption now, not after the order is written. evaluateCoupon only READ the count,
  // and two checkouts can both pass that read before either increments; the claim re-asserts the
  // cap in its own WHERE, so exactly one of them gets the last use of a limited code. If the order
  // then fails, or turns out to be a duplicate submission, the finally below hands the claim back.
  let claimedCouponId: string | null = null;
  let couponConsumed = false;
  if (coupon?.ok) {
    if (!(await claimCouponRedemption(coupon.coupon.id, now)))
      return { ok: false, error: `${COUPON_COPY.exhausted} Compare delivery options again.` };
    claimedCouponId = coupon.coupon.id;
  }
  try {
  const orderId = id('ord');
  const accepted = eq(orders.id, orderId);
  const itemIds = new Map(cart.lines.map((line) => [line.itemId, id('oli')]));
  const allocationLines = cart.lines.map((line) => ({
    itemId: itemIds.get(line.itemId)!,
    code: line.product.code,
    packSize: line.variant.quantity,
    packs: line.quantity,
  }));
  // Every accepted order atomically holds stock. The reservation duration has a safe default,
  // so missing or malformed deployment configuration can never restore unreserved checkout.
  const allocation = await planReservations(allocationLines, now);
  if (!allocation.ok) return allocation;
  const plan = allocation.plan;

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
            discountCents: totals.discountCents,
            couponCode: coupon?.ok ? coupon.coupon.code : null,
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
            reservationPlanGuard(plan, now),
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
              lineTotalCents: reviewedLineTotals.get(l.itemId)!,
              createdAt: now,
            },
            orders,
            accepted,
          ),
        ),
        ...plan.lines.map((line) =>
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
        ),
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
      recordCommerceEvent('order_submitted', { source: 'storefront' });
      if (coupon?.ok) {
        // The count was already incremented by the claim above, so this writes only the record of
        // which order spent it. Marking it consumed is what stops the finally handing the claim back.
        couponConsumed = true;
        try {
          await db.batch([
            db.insert(couponRedemptions).values({
              id: id('cpr'),
              couponId: coupon.coupon.id,
              orderId,
              accountId: account.id,
              code: coupon.coupon.code,
              discountCents: totals.discountCents,
              createdAt: now,
            }),
          ]);
        } catch (error) {
          console.error('[orders] coupon redemption not recorded', orderNumber, error instanceof Error ? error.message : error);
        }
      }
      // A partner's commission accrues here and is a liability from this moment (lib/affiliates.ts).
      // It is calculated on materials after any promo code, never on shipping or tax, and a failure
      // is logged rather than raised: nobody's order fails because of somebody else's commission.
      try {
        await accrueCommission(
          {
            id: orderId,
            orderNumber,
            accountId: account.id,
            subtotalCents: totals.subtotalCents,
            discountCents: totals.discountCents,
          },
          now,
        );
      } catch (error) {
        console.error('[orders] affiliate commission not accrued', orderNumber, error instanceof Error ? error.message : error);
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
  } finally {
    // Every exit that did not write a redemption row gives the use back, including the duplicate
    // submission paths, which return an order that already spent its own claim.
    if (claimedCouponId && !couponConsumed)
      await releaseCouponRedemption(claimedCouponId, now).catch((error) =>
        console.error('[orders] coupon claim not released', error instanceof Error ? error.message : error),
      );
  }
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
          // Customer-facing: a status change is exactly what they asked to hear about.
          internal: sql<number>`0`.as('internal'),
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
  const unavailable = (): PaymentInstructions => ({
    method: order.paymentMethod as PaymentInstructions['method'],
    title: 'Contact us before sending payment',
    lines: [
      'Do not pay this order until staff confirm the total and payment instructions.',
      `Reference: ${order.paymentRef ?? order.orderNumber}`,
      'Contact support with the reference above.',
    ],
    url: null,
    reference: order.paymentRef,
  });
  try {
    // Stored rows are still a trust boundary. Never display or send a rounded,
    // unsafe amount even if an old or damaged row reaches this read path.
    dollarAmount(order.totalCents);
  } catch (error) {
    if (error instanceof RangeError) return unavailable();
    throw error;
  }
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
        `Amount: ${dollarAmount(order.totalCents)} ${order.currency}`,
        `Invoice: ${order.paymentRef ?? '—'}`,
        'Open the payment page to pay. The order is marked paid automatically once the payment settles.',
      ],
      url: order.paymentRef ? btcpayCheckoutUrl(order.paymentRef) : null,
      reference: order.paymentRef,
    };
  }
  try {
    return await method.begin(order);
  } catch (error) {
    if (error instanceof RangeError) return unavailable();
    throw error;
  }
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
          internal: sql<number>`0`.as('internal'),
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
  // A refunded order takes its partner commission back at once rather than on the next cron tick.
  try {
    await reverseCommissionForOrder(order.id, 'order refunded');
  } catch (error) {
    console.error('[orders] affiliate commission not reversed', order.orderNumber, error instanceof Error ? error.message : error);
  }
  return { ok: true };

}
