import { env } from 'cloudflare:workers';
import { and, eq, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import {
  shippingLabels,
  shippingTrackingEvents,
} from '@/db/commerce-schema';
import { orders } from '@/db/schema';
import { boundedJson } from '@/lib/provider-response';
import { recordAutomatedDelivery } from '@/lib/fulfilment';
import { getOrderByNumber } from '@/lib/order-reads';
import { sha256Hex } from '@/lib/staff-auth-core';

const STATUSES = new Set([
  'UNKNOWN',
  'PRE_TRANSIT',
  'TRANSIT',
  'DELIVERED',
  'RETURNED',
  'FAILURE',
]);

type StatusData = {
  object_id?: unknown;
  status?: unknown;
  status_details?: unknown;
  status_date?: unknown;
};

type TrackData = {
  carrier?: unknown;
  tracking_number?: unknown;
  transaction?: unknown;
  tracking_status?: StatusData;
};

export type ShippoTrackEvent = {
  event: 'track_updated';
  test: boolean;
  data: {
    carrier: string;
    trackingNumber: string;
    transactionId: string | null;
    statusId: string | null;
    status: string;
    detail: string | null;
    statusAt: Date | null;
  };
};

export type ShippoTrackingResult = {
  ok: boolean;
  status: number;
  outcome: string;
};

const text = (value: unknown, max: number): string | null =>
  typeof value === 'string' && value.trim() && value.length <= max
    ? value.trim()
    : null;

function statusDate(value: unknown): Date | null {
  if (typeof value !== 'string' || value.length > 40) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function parseShippoTrackEvent(value: unknown): ShippoTrackEvent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const root = value as Record<string, unknown>;
  if (root.event !== 'track_updated' || typeof root.test !== 'boolean')
    return null;
  if (!root.data || typeof root.data !== 'object' || Array.isArray(root.data))
    return null;
  const data = root.data as TrackData;
  const carrier = text(data.carrier, 30)?.toLowerCase();
  const trackingNumber = text(data.tracking_number, 80);
  const tracking = data.tracking_status;
  const status = text(tracking?.status, 30)?.toUpperCase();
  if (
    !carrier ||
    !/^[a-z0-9_]+$/u.test(carrier) ||
    !trackingNumber ||
    !/^[A-Za-z0-9 -]+$/u.test(trackingNumber) ||
    !status ||
    !STATUSES.has(status)
  )
    return null;
  return {
    event: 'track_updated',
    test: root.test,
    data: {
      carrier,
      trackingNumber,
      transactionId: text(data.transaction, 120),
      statusId: text(tracking?.object_id, 120),
      status,
      detail: text(tracking?.status_details, 500),
      statusAt: statusDate(tracking?.status_date),
    },
  };
}

export function shippoWebhookConfigurationError(): string | null {
  if (!env.SHIPPO_WEBHOOK_TOKEN || env.SHIPPO_WEBHOOK_TOKEN.length < 32)
    return 'Shippo webhook token is not configured.';
  const expectedKey =
    env.APP_ENV === 'production' ? /^shippo_live_/u : /^shippo_test_/u;
  if (!env.SHIPPO_API_KEY || !expectedKey.test(env.SHIPPO_API_KEY))
    return 'The environment-specific Shippo API key is not configured.';
  return null;
}

export async function validShippoWebhookToken(candidate: string | null) {
  const secret = env.SHIPPO_WEBHOOK_TOKEN;
  if (!secret || secret.length < 32 || !candidate) return false;
  const [actual, expected] = await Promise.all([
    sha256Hex(candidate),
    sha256Hex(secret),
  ]);
  let difference = actual.length ^ expected.length;
  for (let index = 0; index < Math.max(actual.length, expected.length); index++)
    difference |= actual.charCodeAt(index) ^ expected.charCodeAt(index);
  return difference === 0;
}

async function eventKey(event: ShippoTrackEvent): Promise<string> {
  return sha256Hex(
    JSON.stringify({
      event: event.event,
      test: event.test,
      carrier: event.data.carrier,
      tracking: event.data.trackingNumber,
      transaction: event.data.transactionId,
      statusId: event.data.statusId,
      status: event.data.status,
      statusAt: event.data.statusAt?.toISOString() ?? null,
      detail: event.data.detail,
    }),
  );
}

async function verifyWithShippo(event: ShippoTrackEvent) {
  try {
    const response = await fetch(
      `https://api.goshippo.com/tracks/${encodeURIComponent(event.data.carrier)}/${encodeURIComponent(event.data.trackingNumber)}`,
      {
        signal: AbortSignal.timeout(10_000),
        headers: {
          Authorization: `ShippoToken ${env.SHIPPO_API_KEY}`,
          'SHIPPO-API-VERSION': '2018-02-08',
        },
      },
    );
    if (!response.ok)
      return {
        ok: false as const,
        retryable: response.status === 408 || response.status === 429 || response.status >= 500,
      };
    const value = (await boundedJson(response)) as TrackData;
    const parsed = parseShippoTrackEvent({
      event: 'track_updated',
      test: event.test,
      data: value,
    });
    if (
      !parsed ||
      parsed.data.carrier !== event.data.carrier ||
      parsed.data.trackingNumber !== event.data.trackingNumber
    )
      return { ok: false as const, retryable: false };
    return { ok: true as const, verified: parsed };
  } catch {
    return { ok: false as const, retryable: true };
  }
}

export async function processShippoTrackingEvent(
  event: ShippoTrackEvent,
): Promise<ShippoTrackingResult> {
  const db = getDb();
  const key = await eventKey(event);
  const now = new Date();
  const id = `ste_${key.slice(0, 32)}`;
  const [inserted] = await db
    .insert(shippingTrackingEvents)
    .values({
      id,
      providerEventKey: key,
      eventName: event.event,
      carrier: event.data.carrier,
      trackingNumber: event.data.trackingNumber,
      providerStatusId: event.data.statusId,
      providerTransactionId: event.data.transactionId,
      status: event.data.status,
      statusDetail: event.data.detail,
      statusAt: event.data.statusAt,
      test: event.test,
      receivedAt: now,
    })
    .onConflictDoNothing({ target: shippingTrackingEvents.providerEventKey })
    .returning({ id: shippingTrackingEvents.id });
  const [existing] = await db
    .select()
    .from(shippingTrackingEvents)
    .where(eq(shippingTrackingEvents.providerEventKey, key))
    .limit(1);
  if (!inserted && existing?.outcome !== 'verification_retry')
    return { ok: true, status: 200, outcome: 'duplicate' };

  const verified = await verifyWithShippo(event);
  if (!verified.ok) {
    await db
      .update(shippingTrackingEvents)
      .set({
        outcome: verified.retryable ? 'verification_retry' : 'attention',
        outcomeDetail: 'Independent Shippo tracking verification failed.',
        processedAt: verified.retryable ? null : now,
      })
      .where(eq(shippingTrackingEvents.id, id));
    return {
      ok: !verified.retryable,
      status: verified.retryable ? 503 : 200,
      outcome: verified.retryable ? 'verification_retry' : 'attention',
    };
  }

  const effective = verified.verified;
  const wrongEnvironment =
    (env.APP_ENV === 'production' && event.test) ||
    (env.APP_ENV !== 'production' && !event.test);
  if (wrongEnvironment) {
    await db
      .update(shippingTrackingEvents)
      .set({
        verified: true,
        outcome: 'ignored',
        outcomeDetail: 'Test/live event did not match this environment.',
        processedAt: now,
      })
      .where(eq(shippingTrackingEvents.id, id));
    return { ok: true, status: 200, outcome: 'ignored' };
  }

  const labelConditions = [
    eq(shippingLabels.trackingNumber, event.data.trackingNumber),
    eq(shippingLabels.state, 'ready'),
    eq(shippingLabels.test, event.test),
    sql`lower(${shippingLabels.carrier}) = ${event.data.carrier}`,
  ];
  if (effective.data.transactionId)
    labelConditions.push(
      eq(shippingLabels.providerRef, effective.data.transactionId),
    );
  const [match] = await db
    .select({ order: orders })
    .from(shippingLabels)
    .innerJoin(orders, eq(orders.id, shippingLabels.orderId))
    .where(and(...labelConditions))
    .limit(1);
  if (!match) {
    await db
      .update(shippingTrackingEvents)
      .set({
        verified: true,
        outcome: 'unmatched',
        outcomeDetail: 'No active Shippo label matched this tracking event.',
        processedAt: now,
      })
      .where(eq(shippingTrackingEvents.id, id));
    return { ok: true, status: 200, outcome: 'unmatched' };
  }

  const order = match.order;
  if (effective.data.status !== 'DELIVERED') {
    const attention = ['RETURNED', 'FAILURE'].includes(effective.data.status);
    await db
      .update(shippingTrackingEvents)
      .set({
        verified: true,
        orderId: order.id,
        status: effective.data.status,
        statusDetail: effective.data.detail,
        statusAt: effective.data.statusAt,
        outcome: attention ? 'attention' : 'recorded',
        outcomeDetail: attention
          ? 'Carrier exception requires staff review.'
          : 'Carrier status recorded.',
        processedAt: now,
      })
      .where(eq(shippingTrackingEvents.id, id));
    return {
      ok: true,
      status: 200,
      outcome: attention ? 'attention' : 'recorded',
    };
  }

  const detail = await getOrderByNumber(order.orderNumber);
  const deliveredAt = effective.data.statusAt;
  if (!detail || !deliveredAt || deliveredAt > now) {
    await db
      .update(shippingTrackingEvents)
      .set({
        verified: true,
        orderId: order.id,
        outcome: 'attention',
        outcomeDetail: 'Verified delivery had no usable delivery date or order.',
        processedAt: now,
      })
      .where(eq(shippingTrackingEvents.id, id));
    return { ok: true, status: 200, outcome: 'attention' };
  }
  if (detail.order.deliveredAt) {
    await db
      .update(shippingTrackingEvents)
      .set({
        verified: true,
        orderId: order.id,
        outcome: 'recorded',
        outcomeDetail: 'Order delivery was already recorded.',
        processedAt: now,
      })
      .where(eq(shippingTrackingEvents.id, id));
    return { ok: true, status: 200, outcome: 'recorded' };
  }
  const result = await recordAutomatedDelivery(detail, {
    deliveredOn: deliveredAt.toISOString().slice(0, 10),
    evidence: [
      `Shippo-verified ${effective.data.carrier.toUpperCase()} tracking ${effective.data.trackingNumber}`,
      effective.data.statusId ? `event ${effective.data.statusId}` : null,
      effective.data.detail,
    ]
      .filter(Boolean)
      .join('; ')
      .slice(0, 300),
  });
  await db
    .update(shippingTrackingEvents)
    .set({
      verified: true,
      orderId: order.id,
      status: effective.data.status,
      statusDetail: effective.data.detail,
      statusAt: effective.data.statusAt,
      outcome: result.ok ? 'delivered' : 'attention',
      outcomeDetail: result.ok ? 'Order delivery recorded.' : result.error,
      processedAt: now,
    })
    .where(eq(shippingTrackingEvents.id, id));
  return {
    ok: true,
    status: 200,
    outcome: result.ok ? 'delivered' : 'attention',
  };
}
