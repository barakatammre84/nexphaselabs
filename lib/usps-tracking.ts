import { env } from 'cloudflare:workers';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { getDb } from '@/db';
import { shippingLabels, shippingTrackingEvents } from '@/db/commerce-schema';
import { orders } from '@/db/schema';
import { recordAutomatedDelivery } from '@/lib/fulfilment';
import { getOrderByNumber } from '@/lib/order-reads';
import { boundedJson } from '@/lib/provider-response';
import { sha256Hex } from '@/lib/staff-auth-core';
import { uspsAccessTokenForTracking, uspsConfiguration } from '@/lib/usps-provider';

/**
 * USPS tracking, polled.
 *
 * Shippo pushes tracking to a webhook; USPS does offer a push subscription, but
 * this polls instead, deliberately. Tracking 3.2 accepts up to 35 numbers in one
 * request, so every parcel in flight fits in a single call on the cron that
 * already runs every five minutes. A subscription would add a public endpoint,
 * subscription lifecycle management and signature verification to gain a few
 * minutes of freshness on a delivery flag — a bad trade at this volume, and one
 * worth revisiting only when the batch stops fitting in one request.
 *
 * The discipline from the Shippo path is kept exactly: events are stored
 * idempotently before anything is concluded from them, and only an unambiguous
 * delivery is allowed to write to the order ledger.
 */

const TRACKING_BATCH = 35;
/** USPS quotas are per hour; this bounds a single cron tick, not the day. */
const MAX_BATCHES_PER_RUN = 3;

export type UspsTrackingStatus =
  | 'UNKNOWN'
  | 'PRE_TRANSIT'
  | 'TRANSIT'
  | 'DELIVERED'
  | 'RETURNED'
  | 'FAILURE';

/**
 * Map USPS prose to our status set.
 *
 * Deliberately conservative about DELIVERED, because that is the only status
 * that writes to the order record. "Out for Delivery" contains the word
 * "delivery" and is emphatically not a delivery, so exact matching decides that
 * case and loose matching is only ever allowed to reach a non-committal status.
 * A missed automatic delivery costs a staff click; a false one corrupts an
 * append-only ledger.
 */
export function uspsTrackingStatus(
  status: unknown,
  statusCategory: unknown,
): UspsTrackingStatus {
  const exact = (value: unknown) =>
    typeof value === 'string' ? value.trim().toLowerCase() : '';
  const category = exact(statusCategory);
  const state = exact(status);

  if (category === 'delivered' || state === 'delivered') return 'DELIVERED';

  const text = `${category} ${state}`;
  if (text.includes('out for delivery') || text.includes('in transit'))
    return 'TRANSIT';
  if (text.includes('return')) return 'RETURNED';
  if (
    text.includes('alert') ||
    text.includes('undeliverable') ||
    text.includes('unable') ||
    text.includes('refused')
  )
    return 'FAILURE';
  if (
    text.includes('pre-shipment') ||
    text.includes('pre shipment') ||
    text.includes('acceptance') ||
    text.includes('accepted')
  )
    return 'PRE_TRANSIT';
  if (text.includes('transit') || text.includes('processing')) return 'TRANSIT';
  // Anything that merely mentions delivery without saying so plainly stays
  // unknown rather than being read as a delivery.
  return 'UNKNOWN';
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function timestamp(value: unknown): Date | null {
  if (typeof value !== 'string' || value.length > 40) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * When USPS delivered it. Taken from the scan event itself rather than from the
 * summary prose, and null when no event carries a usable timestamp — in which
 * case the delivery is flagged for a human instead of being dated by guesswork.
 */
export function uspsDeliveredAt(payload: unknown): Date | null {
  const events = Array.isArray(record(payload).trackingEvents)
    ? (record(payload).trackingEvents as unknown[])
    : [];
  let latest: Date | null = null;
  for (const raw of events) {
    const event = record(raw);
    const label = `${typeof event.eventType === 'string' ? event.eventType : ''} ${
      typeof event.eventCode === 'string' ? event.eventCode : ''
    }`.toLowerCase();
    if (!label.includes('deliver') || label.includes('out for')) continue;
    const at =
      timestamp(event.eventTimestamp) ??
      timestamp(event.eventDateTime) ??
      timestamp(event.eventDate);
    if (at && (!latest || at > latest)) latest = at;
  }
  return latest;
}

export type UspsTrackingResult = {
  polled: number;
  updated: number;
  delivered: number;
  failures: number;
  skipped?: string;
};

/** Labels still in flight: shipped, not yet delivered, in this environment. */
async function labelsInFlight(test: boolean) {
  return getDb()
    .select({ order: orders, trackingNumber: shippingLabels.trackingNumber })
    .from(shippingLabels)
    .innerJoin(orders, eq(orders.id, shippingLabels.orderId))
    .where(
      and(
        eq(shippingLabels.state, 'ready'),
        eq(shippingLabels.test, test),
        isNotNull(shippingLabels.trackingNumber),
        isNull(orders.deliveredAt),
      ),
    )
    .limit(TRACKING_BATCH * MAX_BATCHES_PER_RUN);
}

async function fetchTracking(
  host: string,
  bearer: string,
  numbers: string[],
): Promise<unknown[] | null> {
  try {
    const response = await fetch(`${host}/tracking/v3r2/tracking`, {
      method: 'POST',
      signal: AbortSignal.timeout(20_000),
      headers: {
        Authorization: `Bearer ${bearer}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(numbers.map((trackingNumber) => ({ trackingNumber }))),
    });
    // 207 is USPS's multi-status: some numbers resolved, some did not.
    if (response.status !== 200 && response.status !== 207) return null;
    const payload = await boundedJson(response, 2 * 1024 * 1024);
    return Array.isArray(payload) ? payload : null;
  } catch {
    return null;
  }
}

/**
 * One polling pass. Safe to run on every cron tick: an unchanged status
 * produces the same event key and is discarded as a duplicate, so repeated
 * polling writes nothing and cannot re-record a delivery.
 */
export async function pollUspsTracking(
  now = new Date(),
): Promise<UspsTrackingResult> {
  const empty: UspsTrackingResult = {
    polled: 0,
    updated: 0,
    delivered: 0,
    failures: 0,
  };
  if (env.SHIPPING_PROVIDER !== 'usps')
    return { ...empty, skipped: 'provider is not usps' };
  const configuration = uspsConfiguration();
  if (configuration.issues.length)
    return { ...empty, skipped: configuration.issues.join(' ') };

  const rows = await labelsInFlight(configuration.test);
  if (!rows.length) return empty;

  const bearer = await uspsAccessTokenForTracking(configuration);
  if (!bearer.ok) return { ...empty, skipped: bearer.error };

  const byNumber = new Map(rows.map((row) => [row.trackingNumber!, row.order]));
  const numbers = [...byNumber.keys()];
  const db = getDb();
  const result = { ...empty, polled: numbers.length };

  for (let index = 0; index < numbers.length; index += TRACKING_BATCH) {
    const batch = numbers.slice(index, index + TRACKING_BATCH);
    const payloads = await fetchTracking(configuration.host, bearer.token, batch);
    if (!payloads) {
      result.failures += 1;
      continue;
    }
    for (const payload of payloads) {
      const item = record(payload);
      const trackingNumber =
        typeof item.trackingNumber === 'string' ? item.trackingNumber.trim() : '';
      const order = byNumber.get(trackingNumber);
      if (!order) continue;

      const status = uspsTrackingStatus(item.status, item.statusCategory);
      if (status === 'UNKNOWN') continue;
      const deliveredAt = status === 'DELIVERED' ? uspsDeliveredAt(item) : null;
      const summary =
        typeof item.statusSummary === 'string'
          ? item.statusSummary.slice(0, 500)
          : null;

      /**
       * The key is the fact, not the poll: same parcel, same status, same
       * moment produces the same row no matter how often we ask.
       */
      const key = await sha256Hex(
        JSON.stringify({
          provider: 'usps',
          trackingNumber,
          status,
          statusAt: deliveredAt?.toISOString() ?? null,
          summary,
        }),
      );
      const id = `ste_${key.slice(0, 32)}`;
      const [inserted] = await db
        .insert(shippingTrackingEvents)
        .values({
          id,
          providerEventKey: key,
          eventName: 'usps_tracking_poll',
          carrier: 'usps',
          trackingNumber,
          providerStatusId:
            typeof item.uniqueTrackingID === 'string'
              ? item.uniqueTrackingID.slice(0, 120)
              : null,
          providerTransactionId: null,
          status,
          statusDetail: summary,
          statusAt: deliveredAt,
          test: configuration.test,
          verified: true,
          orderId: order.id,
          outcome: 'recorded',
          outcomeDetail: 'USPS tracking status recorded.',
          receivedAt: now,
          processedAt: now,
        })
        .onConflictDoNothing({ target: shippingTrackingEvents.providerEventKey })
        .returning({ id: shippingTrackingEvents.id });
      // Already seen: nothing has changed since the last poll.
      if (!inserted) continue;
      result.updated += 1;

      if (status === 'RETURNED' || status === 'FAILURE') {
        await db
          .update(shippingTrackingEvents)
          .set({
            outcome: 'attention',
            outcomeDetail: 'Carrier exception requires staff review.',
          })
          .where(eq(shippingTrackingEvents.id, id));
        continue;
      }
      if (status !== 'DELIVERED') continue;

      const detail = await getOrderByNumber(order.orderNumber);
      if (!detail || !deliveredAt || deliveredAt > now) {
        await db
          .update(shippingTrackingEvents)
          .set({
            outcome: 'attention',
            outcomeDetail:
              'USPS reported delivery without a usable delivery date. Confirm and record by hand.',
          })
          .where(eq(shippingTrackingEvents.id, id));
        continue;
      }
      if (detail.order.deliveredAt) {
        await db
          .update(shippingTrackingEvents)
          .set({ outcomeDetail: 'Order delivery was already recorded.' })
          .where(eq(shippingTrackingEvents.id, id));
        continue;
      }
      const recorded = await recordAutomatedDelivery(
        detail,
        {
          deliveredOn: deliveredAt.toISOString().slice(0, 10),
          evidence: [
            `USPS tracking ${trackingNumber}`,
            typeof item.uniqueTrackingID === 'string'
              ? `unique id ${item.uniqueTrackingID}`
              : null,
            summary,
          ]
            .filter(Boolean)
            .join('; ')
            .slice(0, 300),
        },
        'usps',
      );
      await db
        .update(shippingTrackingEvents)
        .set({
          outcome: recorded.ok ? 'delivered' : 'attention',
          outcomeDetail: recorded.ok
            ? 'Order delivery recorded.'
            : recorded.error,
        })
        .where(eq(shippingTrackingEvents.id, id));
      if (recorded.ok) result.delivered += 1;
    }
  }
  return result;
}
