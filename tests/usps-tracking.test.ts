import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { localD1 } from './helpers/local-d1';

const { env } = vi.hoisted(() => ({ env: {} as Record<string, unknown> }));
vi.mock('cloudflare:workers', () => ({ env }));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

import { getDb } from '@/db';
import {
  fulfillmentQuotes,
  shippingLabels,
  shippingTrackingEvents,
} from '@/db/commerce-schema';
import { orders } from '@/db/schema';
import { getOrderByNumber } from '@/lib/orders';
import {
  pollUspsTracking,
  uspsDeliveredAt,
  uspsTrackingStatus,
} from '@/lib/usps-tracking';
import {
  seedCommerceFixture,
  syntheticOrder,
} from './helpers/commerce-fixture';

describe('status mapping', () => {
  /**
   * The only status that writes to the order ledger is DELIVERED, so this is
   * the test that matters most. "Out for Delivery" is the trap: it contains
   * the word delivery and means the opposite.
   */
  it('treats out-for-delivery as in transit, never as delivered', () => {
    expect(uspsTrackingStatus('Out for Delivery', 'Out for Delivery')).toBe(
      'TRANSIT',
    );
    expect(uspsTrackingStatus('Out for Delivery', 'In Transit')).toBe('TRANSIT');
  });

  it('records a delivery only when USPS says so plainly', () => {
    expect(uspsTrackingStatus('Delivered', 'Delivered')).toBe('DELIVERED');
    expect(uspsTrackingStatus('delivered', null)).toBe('DELIVERED');
    expect(uspsTrackingStatus(null, 'Delivered')).toBe('DELIVERED');
    // Prose that mentions delivery without asserting it must not be read as one.
    expect(uspsTrackingStatus('Arriving Late', 'Expected Delivery Update')).toBe(
      'UNKNOWN',
    );
    expect(uspsTrackingStatus('Awaiting Delivery Scan', null)).toBe('UNKNOWN');
  });

  it('maps the remaining categories it is sure about', () => {
    expect(uspsTrackingStatus('Pre-Shipment Info Sent', null)).toBe('PRE_TRANSIT');
    expect(uspsTrackingStatus('Accepted at USPS Facility', null)).toBe('PRE_TRANSIT');
    expect(uspsTrackingStatus('In Transit to Next Facility', null)).toBe('TRANSIT');
    expect(uspsTrackingStatus('Return to Sender', null)).toBe('RETURNED');
    expect(uspsTrackingStatus('Delivery Alert', 'Alert')).toBe('FAILURE');
    expect(uspsTrackingStatus('Undeliverable as Addressed', null)).toBe('FAILURE');
    expect(uspsTrackingStatus('', '')).toBe('UNKNOWN');
  });
});

describe('delivery timestamp', () => {
  it('takes the latest genuine delivery scan', () => {
    const at = uspsDeliveredAt({
      trackingEvents: [
        { eventType: 'Out for Delivery', eventTimestamp: '2026-09-14T09:00:00Z' },
        { eventType: 'Delivered, In/At Mailbox', eventTimestamp: '2026-09-14T14:32:00Z' },
      ],
    });
    expect(at?.toISOString()).toBe('2026-09-14T14:32:00.000Z');
  });

  it('returns nothing rather than dating a delivery by guesswork', () => {
    expect(uspsDeliveredAt({ trackingEvents: [] })).toBeNull();
    expect(uspsDeliveredAt({})).toBeNull();
    // A delivery scan with no usable timestamp is not a date.
    expect(
      uspsDeliveredAt({ trackingEvents: [{ eventType: 'Delivered' }] }),
    ).toBeNull();
    // Out-for-delivery on its own is not a delivery.
    expect(
      uspsDeliveredAt({
        trackingEvents: [
          { eventType: 'Out for Delivery', eventTimestamp: '2026-09-14T09:00:00Z' },
        ],
      }),
    ).toBeNull();
  });
});

describe('polling', () => {
  let local: ReturnType<typeof localD1>;

  beforeEach(async () => {
    local = localD1();
    Object.assign(env, {
      DB: local.binding,
      APP_ENV: 'staging',
      OPEN_CHECKOUT_ENABLED: 'true',
      SHIPPING_PROVIDER: 'usps',
      USPS_CLIENT_ID: 'consumerkey0000000000',
      USPS_CLIENT_SECRET: 'consumersecret0000000',
      USPS_CRID: '59918139',
      USPS_MID: '904260903',
    });
    vi.stubGlobal('fetch', vi.fn());
    await seedCommerceFixture();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    local.sqlite.close();
    for (const key of Object.keys(env)) delete env[key];
  });

  async function shippedOrder(trackingNumber: string) {
    const created = await syntheticOrder();
    const order = created.detail.order;
    // A delivery can only be recorded against a shipped order with a complete
    // shipment record — the same rule a staff member is held to.
    await getDb()
      .update(orders)
      .set({
        status: 'shipped',
        shippedAt: new Date('2026-09-12T18:00:00Z'),
        carrier: 'USPS',
        trackingNumber,
      })
      .where(eq(orders.id, order.id));
    // A label is always bought against a quote, and the schema enforces it.
    const quoteId = `fq_${'b'.repeat(32)}`;
    await getDb().insert(fulfillmentQuotes).values({
      id: quoteId,
      orderId: order.id,
      originId: 'primary',
      originLabel: 'Primary location',
      provider: 'usps',
      shipmentId: 'usps-shipment',
      rateId: 'usps-GA-SP-M-95242-63118-50-900-600-400-895',
      carrier: 'USPS',
      service: 'usps_ground_advantage',
      serviceName: 'USPS Ground Advantage Machinable Single-piece',
      amountCents: 895,
      estimatedDays: 4,
      test: true,
      expiresAt: new Date(Date.now() + 30 * 60_000),
      createdBy: 'Synthetic Ops (staff)',
    });
    await getDb().insert(shippingLabels).values({
      id: `sl_${'a'.repeat(32)}`,
      orderId: order.id,
      quoteId,
      state: 'ready',
      originId: 'primary',
      originLabel: 'Primary location',
      providerRef: trackingNumber,
      labelUrl: `r2:shipping-labels/2026/sl_${'a'.repeat(32)}.pdf`,
      trackingNumber,
      carrier: 'USPS',
      serviceName: 'USPS Ground Advantage Machinable Single-piece',
      amountCents: 895,
      test: true,
      createdBy: 'Synthetic Ops (staff)',
    });
    return order;
  }

  function uspsResponses(tracking: Record<string, unknown>) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (target: string | URL) => {
        const url = String(target);
        if (url.includes('/oauth2/v3/token'))
          return new Response(
            JSON.stringify({ access_token: 'token', expires_in: 28_800 }),
          );
        if (url.includes('/tracking/v3r2/tracking'))
          return new Response(JSON.stringify([tracking]));
        throw new Error(`unrouted: ${url}`);
      }),
    );
  }

  it('does nothing at all when USPS is not the configured provider', async () => {
    env.SHIPPING_PROVIDER = 'shippo';
    const result = await pollUspsTracking();
    expect(result.skipped).toContain('not usps');
    expect(result.polled).toBe(0);
  });

  it('records an in-transit status without touching the order', async () => {
    const order = await shippedOrder('9400100000000000000001');
    uspsResponses({
      trackingNumber: '9400100000000000000001',
      status: 'In Transit to Next Facility',
      statusCategory: 'In Transit',
      statusSummary: 'Moving through network',
    });
    const result = await pollUspsTracking();
    expect(result.updated).toBe(1);
    expect(result.delivered).toBe(0);
    const reread = await getOrderByNumber(order.orderNumber);
    expect(reread?.order.deliveredAt).toBeFalsy();
  });

  it('marks the order delivered from a real delivery scan', async () => {
    const order = await shippedOrder('9400100000000000000002');
    uspsResponses({
      trackingNumber: '9400100000000000000002',
      status: 'Delivered',
      statusCategory: 'Delivered',
      statusSummary: 'Your item was delivered at 2:32 pm',
      uniqueTrackingID: 'UID-1',
      trackingEvents: [
        { eventType: 'Delivered, In/At Mailbox', eventTimestamp: '2026-09-14T14:32:00Z' },
      ],
    });
    const result = await pollUspsTracking(new Date('2026-09-15T00:00:00Z'));
    expect(result.delivered).toBe(1);
    const reread = await getOrderByNumber(order.orderNumber);
    expect(reread?.order.deliveredAt).toBeTruthy();
  });

  it('polling twice cannot record the same delivery twice', async () => {
    await shippedOrder('9400100000000000000003');
    uspsResponses({
      trackingNumber: '9400100000000000000003',
      status: 'Delivered',
      statusCategory: 'Delivered',
      trackingEvents: [
        { eventType: 'Delivered', eventTimestamp: '2026-09-14T14:32:00Z' },
      ],
    });
    const first = await pollUspsTracking(new Date('2026-09-15T00:00:00Z'));
    const second = await pollUspsTracking(new Date('2026-09-15T00:05:00Z'));
    expect(first.delivered).toBe(1);
    // The order is delivered, so it is no longer in flight and is not re-polled.
    expect(second.polled).toBe(0);
    expect(second.delivered).toBe(0);
    const events = await getDb()
      .select()
      .from(shippingTrackingEvents)
      .where(eq(shippingTrackingEvents.trackingNumber, '9400100000000000000003'));
    expect(events).toHaveLength(1);
  });

  it('flags a delivery with no usable date instead of inventing one', async () => {
    const order = await shippedOrder('9400100000000000000004');
    uspsResponses({
      trackingNumber: '9400100000000000000004',
      status: 'Delivered',
      statusCategory: 'Delivered',
      trackingEvents: [{ eventType: 'Delivered' }],
    });
    const result = await pollUspsTracking();
    expect(result.delivered).toBe(0);
    const [event] = await getDb()
      .select()
      .from(shippingTrackingEvents)
      .where(eq(shippingTrackingEvents.trackingNumber, '9400100000000000000004'));
    expect(event.outcome).toBe('attention');
    const reread = await getOrderByNumber(order.orderNumber);
    expect(reread?.order.deliveredAt).toBeFalsy();
  });

  it('sends a returned parcel to staff rather than closing it', async () => {
    await shippedOrder('9400100000000000000005');
    uspsResponses({
      trackingNumber: '9400100000000000000005',
      status: 'Return to Sender',
      statusCategory: 'Alert',
    });
    await pollUspsTracking();
    const [event] = await getDb()
      .select()
      .from(shippingTrackingEvents)
      .where(eq(shippingTrackingEvents.trackingNumber, '9400100000000000000005'));
    expect(event.status).toBe('RETURNED');
    expect(event.outcome).toBe('attention');
  });
});
