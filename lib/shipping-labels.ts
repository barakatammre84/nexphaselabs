import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { fulfillmentQuotes, shippingLabels } from '@/db/commerce-schema';
import type { Order } from '@/db/schema';
import {
  purchaseShippingLabel,
  quoteShipping,
  reconcileShippingLabelRefund as reconcileProviderRefund,
  requestShippingLabelRefund,
} from '@/lib/shipping-provider';
import type { Parcel } from '@/lib/shipping-rates';
import type { StaffPrincipal } from '@/lib/staff-auth';

function identifier(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
}

function toAddress(order: Order) {
  return {
    name: order.consigneeName,
    street1: order.shipToLine1,
    ...(order.shipToLine2 ? { street2: order.shipToLine2 } : {}),
    city: order.shipToCity,
    state: order.shipToRegion.toUpperCase(),
    zip: order.shipToPostalCode,
    country: order.shipToCountry,
    ...(order.shipToPhone ? { phone: order.shipToPhone } : {}),
    is_residential: !order.consigneeInstitution,
  };
}

export async function quoteFulfillment(
  order: Order,
  parcel: Parcel,
  staff: StaffPrincipal,
  originId?: string,
) {
  if (order.status !== 'fulfilling')
    return {
      ok: false as const,
      error: 'Start fulfillment before purchasing a shipping label.',
    };
  const result = await quoteShipping(
    toAddress(order),
    parcel,
    {
      services: [],
      maxEstimatedDays: 10,
    },
    originId,
  );
  if (!result.ok) return result;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 60_000);
  const rows = result.rates.slice(0, 6).map((rate) => ({
    id: identifier('fq'),
    orderId: order.id,
    originId: result.originId,
    originLabel: result.originLabel,
    provider: result.provider,
    shipmentId: rate.shipmentId,
    rateId: rate.id,
    carrier: rate.carrier,
    service: rate.service,
    serviceName: rate.serviceName,
    amountCents: rate.cents,
    currency: rate.currency,
    estimatedDays: rate.estimatedDays,
    test: result.test,
    expiresAt,
    createdBy: `${staff.name} (${staff.id})`,
    createdAt: now,
  }));
  if (!rows.length)
    return {
      ok: false as const,
      error: 'No eligible USPS, UPS or FedEx rates were returned.',
    };
  await getDb().insert(fulfillmentQuotes).values(rows);
  return {
    ok: true as const,
    quotes: rows.map((row) => ({
      id: row.id,
      originId: row.originId,
      originLabel: row.originLabel,
      carrier: row.carrier,
      serviceName: row.serviceName,
      amountCents: row.amountCents,
      estimatedDays: row.estimatedDays,
      test: row.test,
      expiresAt: row.expiresAt.toISOString(),
    })),
    warning: result.warning,
  };
}

export async function currentShippingLabel(orderId: string) {
  const [label] = await getDb()
    .select()
    .from(shippingLabels)
    .where(eq(shippingLabels.orderId, orderId))
    .orderBy(
      desc(sql`CASE WHEN ${shippingLabels.state} = 'voided' THEN 0 ELSE 1 END`),
      desc(shippingLabels.createdAt),
      desc(shippingLabels.id),
    )
    .limit(1);
  return label ?? null;
}

export async function shippingLabelHistory(orderId: string) {
  return getDb()
    .select()
    .from(shippingLabels)
    .where(eq(shippingLabels.orderId, orderId))
    .orderBy(desc(shippingLabels.createdAt), desc(shippingLabels.id));
}

export async function buyShippingLabel(
  order: Order,
  quoteId: string,
  staff: StaffPrincipal,
  now = new Date(),
) {
  const existing = await currentShippingLabel(order.id);
  if (existing && existing.state !== 'voided')
    return { ok: existing.state === 'ready', label: existing, duplicate: true };
  if (order.status !== 'fulfilling')
    return {
      ok: false as const,
      error: 'The order must be in fulfillment before buying a label.',
    };
  if (!/^fq_[a-f0-9]{32}$/.test(quoteId))
    return { ok: false as const, error: 'Choose a current shipping quote.' };
  const [quote] = await getDb()
    .select()
    .from(fulfillmentQuotes)
    .where(
      and(
        eq(fulfillmentQuotes.id, quoteId),
        eq(fulfillmentQuotes.orderId, order.id),
        gt(fulfillmentQuotes.expiresAt, now),
      ),
    )
    .limit(1);
  if (!quote)
    return {
      ok: false as const,
      error: 'The shipping quote expired. Compare rates again.',
    };
  const attempt = {
    orderId: order.id,
    id: identifier('sl'),
    quoteId: quote.id,
    state: 'requesting',
    originId: quote.originId,
    originLabel: quote.originLabel,
    providerRef: null,
    labelUrl: null,
    trackingNumber: null,
    carrier: quote.carrier,
    serviceName: quote.serviceName,
    amountCents: quote.amountCents,
    test: quote.test,
    error: null,
    createdBy: `${staff.name} (${staff.id})`,
    createdAt: now,
    updatedAt: now,
  };
  const [claimed] = await getDb()
    .insert(shippingLabels)
    .values(attempt)
    .onConflictDoNothing()
    .returning();
  if (!claimed) {
    const label = await currentShippingLabel(order.id);
    return { ok: label?.state === 'ready', label, duplicate: true };
  }
  const purchased = await purchaseShippingLabel(
    quote.rateId,
    order.orderNumber,
    {
      to: toAddress(order),
      // The claim row already written above is the USPS idempotency key, so a
      // retry of this same claim can never buy a second label.
      labelId: attempt.id,
      originId: quote.originId,
      institution: order.consigneeInstitution,
    },
  );
  const updatedAt = new Date();
  if (!purchased.ok) {
    const [label] = await getDb()
      .update(shippingLabels)
      .set({
        state: 'attention',
        error: purchased.error.slice(0, 500),
        updatedAt,
      })
      .where(
        and(
          eq(shippingLabels.orderId, order.id),
          eq(shippingLabels.id, attempt.id),
          eq(shippingLabels.state, 'requesting'),
        ),
      )
      .returning();
    return {
      ok: false as const,
      error: purchased.error,
      label,
      uncertain: purchased.uncertain,
    };
  }
  const [label] = await getDb()
    .update(shippingLabels)
    .set({
      state: 'ready',
      providerRef: purchased.transactionId,
      labelUrl: purchased.labelUrl,
      trackingNumber: purchased.trackingNumber,
      test: purchased.test,
      error: null,
      updatedAt,
    })
    .where(
      and(
        eq(shippingLabels.orderId, order.id),
        eq(shippingLabels.id, attempt.id),
        eq(shippingLabels.state, 'requesting'),
      ),
    )
    .returning();
  return label
    ? { ok: true as const, label, duplicate: false }
    : {
        ok: false as const,
        error: 'Label response was not attached. Reconcile it before retrying.',
        uncertain: true,
      };
}

export async function voidShippingLabel(
  order: Order,
  reason: string,
  staff: StaffPrincipal,
) {
  const cleanReason = reason.trim();
  if (cleanReason.length < 3 || cleanReason.length > 300)
    return {
      ok: false as const,
      error: 'Give a cancellation reason between 3 and 300 characters.',
    };
  if (order.status === 'shipped' || order.status === 'returned')
    return {
      ok: false as const,
      error:
        'A shipped label cannot be cancelled here. Use the return workflow and carrier review.',
    };
  const existing = await currentShippingLabel(order.id);
  if (!existing)
    return { ok: false as const, error: 'This order has no shipping label.' };
  if (existing.state === 'voided')
    return { ok: true as const, label: existing, duplicate: true };
  if (existing.state !== 'ready' || !existing.providerRef)
    return {
      ok: false as const,
      error:
        'The label is not ready for cancellation. Reconcile its current state first.',
      label: existing,
      duplicate: true,
    };
  const requestedAt = new Date();
  const actor = `${staff.name} (${staff.id})`;
  const [claimed] = await getDb()
    .update(shippingLabels)
    .set({
      state: 'voiding',
      refundState: 'requesting',
      refundReason: cleanReason,
      refundRequestedBy: actor,
      refundRequestedAt: requestedAt,
      refundUpdatedAt: requestedAt,
      error: null,
      updatedAt: requestedAt,
    })
    .where(
      and(
        eq(shippingLabels.id, existing.id),
        eq(shippingLabels.state, 'ready'),
        isNull(shippingLabels.refundState),
      ),
    )
    .returning();
  if (!claimed) {
    const label = await currentShippingLabel(order.id);
    return {
      ok: label?.state === 'voided',
      label,
      duplicate: true,
      error:
        label?.state === 'voided'
          ? undefined
          : 'A label cancellation is already in progress. Do not submit another request.',
    };
  }
  const refunded = await requestShippingLabelRefund(existing.providerRef);
  const updatedAt = new Date();
  if (!refunded.ok) {
    const [label] = await getDb()
      .update(shippingLabels)
      .set({
        state: 'attention',
        refundState: 'attention',
        refundRef: refunded.refundId ?? null,
        refundUpdatedAt: updatedAt,
        error: refunded.error.slice(0, 500),
        updatedAt,
      })
      .where(
        and(
          eq(shippingLabels.id, existing.id),
          eq(shippingLabels.state, 'voiding'),
          eq(shippingLabels.refundState, 'requesting'),
        ),
      )
      .returning();
    return {
      ok: false as const,
      error: refunded.error,
      uncertain: refunded.uncertain,
      label,
    };
  }
  const [label] = await getDb()
    .update(shippingLabels)
    .set({
      state: refunded.status === 'success' ? 'voided' : 'voiding',
      refundState: refunded.status,
      refundRef: refunded.refundId,
      refundUpdatedAt: updatedAt,
      error:
        refunded.status === 'pending'
          ? 'Carrier refund is pending. Reconcile it before using or replacing this label.'
          : null,
      updatedAt,
    })
    .where(
      and(
        eq(shippingLabels.id, existing.id),
        eq(shippingLabels.state, 'voiding'),
        eq(shippingLabels.refundState, 'requesting'),
      ),
    )
    .returning();
  return label
    ? {
        ok: refunded.status === 'success',
        pending: refunded.status === 'pending',
        label,
        duplicate: false,
      }
    : {
        ok: false as const,
        uncertain: true,
        error:
          'The carrier refund response was not attached. Reconcile it before another action.',
      };
}

export async function reconcileShippingLabelRefund(
  order: Order,
  staff: StaffPrincipal,
) {
  const existing = await currentShippingLabel(order.id);
  if (!existing)
    return { ok: false as const, error: 'This order has no shipping label.' };
  if (existing.state === 'voided')
    return { ok: true as const, label: existing, duplicate: true };
  if (!existing.providerRef)
    return {
      ok: false as const,
      error: 'No carrier transaction reference is available. Review it in Shippo.',
      label: existing,
    };
  if (
    !['voiding', 'attention'].includes(existing.state) ||
    !['requesting', 'pending', 'attention'].includes(
      existing.refundState ?? '',
    )
  )
    return {
      ok: false as const,
      error: 'This label has no refund awaiting reconciliation.',
      label: existing,
    };
  const result = await reconcileProviderRefund(
    existing.providerRef,
    existing.refundRef,
  );
  const updatedAt = new Date();
  if (!result.ok) {
    const [label] = await getDb()
      .update(shippingLabels)
      .set({
        state: 'attention',
        refundState: 'attention',
        refundUpdatedAt: updatedAt,
        error: result.error.slice(0, 500),
        updatedAt,
      })
      .where(eq(shippingLabels.id, existing.id))
      .returning();
    return {
      ok: false as const,
      error: result.error,
      uncertain: result.uncertain,
      label,
    };
  }
  const [label] = await getDb()
    .update(shippingLabels)
    .set({
      state: result.status === 'success' ? 'voided' : 'voiding',
      refundState: result.status,
      refundRef: result.refundId,
      refundUpdatedAt: updatedAt,
      refundRequestedBy:
        existing.refundRequestedBy ?? `${staff.name} (${staff.id})`,
      error:
        result.status === 'pending' ? 'Carrier refund is still pending.' : null,
      updatedAt,
    })
    .where(eq(shippingLabels.id, existing.id))
    .returning();
  return {
    ok: result.status === 'success',
    pending: result.status === 'pending',
    label,
  };
}
