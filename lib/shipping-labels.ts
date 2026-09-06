import { and, eq, gt } from 'drizzle-orm';
import { getDb } from '@/db';
import { fulfillmentQuotes, shippingLabels } from '@/db/commerce-schema';
import type { Order } from '@/db/schema';
import { purchaseShippingLabel, quoteShipping } from '@/lib/shipping-provider';
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
) {
  if (order.status !== 'fulfilling')
    return {
      ok: false as const,
      error: 'Start fulfillment before purchasing a shipping label.',
    };
  const result = await quoteShipping(toAddress(order), parcel, {
    services: [],
    maxEstimatedDays: 10,
  });
  if (!result.ok) return result;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 60_000);
  const rows = result.rates.slice(0, 6).map((rate) => ({
    id: identifier('fq'),
    orderId: order.id,
    provider: result.test ? 'test' : 'shippo',
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
      error: 'No eligible UPS or FedEx rates were returned.',
    };
  await getDb().insert(fulfillmentQuotes).values(rows);
  return {
    ok: true as const,
    quotes: rows.map((row) => ({
      id: row.id,
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
    .limit(1);
  return label ?? null;
}

export async function buyShippingLabel(
  order: Order,
  quoteId: string,
  staff: StaffPrincipal,
  now = new Date(),
) {
  const existing = await currentShippingLabel(order.id);
  if (existing)
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
