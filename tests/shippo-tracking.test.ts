import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { localD1 } from './helpers/local-d1';

const { env } = vi.hoisted(() => ({ env: {} as Record<string, unknown> }));
vi.mock('cloudflare:workers', () => ({ env }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

import { getDb } from '@/db';
import {
  fulfillmentQuotes,
  shippingLabels,
  shippingTrackingEvents,
} from '@/db/commerce-schema';
import { orderEvents, orders } from '@/db/schema';
import {
  parseShippoTrackEvent,
  processShippoTrackingEvent,
  validShippoWebhookToken,
} from '@/lib/shippo-tracking';
import { seedCommerceFixture, syntheticOrder } from './helpers/commerce-fixture';

let local: ReturnType<typeof localD1>;
const token = 'synthetic-webhook-token-32-characters-long';

beforeEach(async () => {
  local = localD1();
  Object.assign(env, {
    DB: local.binding,
    APP_ENV: 'staging',
    OPEN_CHECKOUT_ENABLED: 'true',
    SHIPPO_API_KEY: 'shippo_test_synthetic',
    SHIPPO_WEBHOOK_TOKEN: token,
  });
  await seedCommerceFixture();
});

afterEach(() => {
  vi.unstubAllGlobals();
  local.sqlite.close();
  for (const key of Object.keys(env)) delete env[key];
});

async function shippedOrder() {
  const created = await syntheticOrder();
  const now = new Date();
  const shippedAt = new Date(now.getTime() - 24 * 60 * 60_000);
  await getDb()
    .update(orders)
    .set({
      status: 'shipped',
      carrier: 'USPS',
      trackingNumber: '9205590164917312751089',
      shippedAt,
    })
    .where(eq(orders.id, created.detail.order.id));
  await getDb().insert(fulfillmentQuotes).values({
    id: 'fq_track',
    orderId: created.detail.order.id,
    provider: 'shippo',
    shipmentId: 'shipment_track',
    rateId: 'rate_track',
    carrier: 'USPS',
    service: 'usps_ground_advantage',
    serviceName: 'Ground Advantage',
    amountCents: 558,
    test: true,
    expiresAt: new Date(now.getTime() + 60_000),
    createdBy: 'test',
  });
  await getDb().insert(shippingLabels).values({
    id: 'label_track',
    orderId: created.detail.order.id,
    quoteId: 'fq_track',
    state: 'ready',
    providerRef: 'transaction_track',
    trackingNumber: '9205590164917312751089',
    carrier: 'USPS',
    serviceName: 'Ground Advantage',
    amountCents: 558,
    test: true,
    createdBy: 'test',
  });
  return { id: created.detail.order.id, number: created.detail.order.orderNumber };
}

function payload(status = 'DELIVERED') {
  return {
    event: 'track_updated',
    test: true,
    data: {
      carrier: 'usps',
      tracking_number: '9205590164917312751089',
      transaction: 'transaction_track',
      tracking_status: {
        object_id: `status_${status}`,
        status,
        status_details: status === 'DELIVERED' ? 'Delivered at mailbox.' : 'In transit.',
        status_date: new Date().toISOString(),
      },
    },
  };
}

describe('Shippo tracking automation', () => {
  it('accepts only the configured high-entropy webhook token', async () => {
    expect(await validShippoWebhookToken(token)).toBe(true);
    expect(await validShippoWebhookToken(`${token}x`)).toBe(false);
    expect(await validShippoWebhookToken(null)).toBe(false);
  });

  it('parses only bounded track_updated payloads', () => {
    expect(parseShippoTrackEvent(payload())).toMatchObject({
      event: 'track_updated',
      test: true,
      data: { carrier: 'usps', status: 'DELIVERED' },
    });
    expect(parseShippoTrackEvent({ ...payload(), event: 'transaction_created' })).toBeNull();
    expect(
      parseShippoTrackEvent({
        ...payload(),
        data: { ...payload().data, tracking_number: 'x\nforged' },
      }),
    ).toBeNull();
  });

  it('independently verifies delivery, records it once and deduplicates redelivery', async () => {
    const order = await shippedOrder();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(payload().data)));
    const parsed = parseShippoTrackEvent(payload())!;
    expect(await processShippoTrackingEvent(parsed)).toMatchObject({
      ok: true,
      outcome: 'delivered',
    });
    expect(await processShippoTrackingEvent(parsed)).toMatchObject({
      ok: true,
      outcome: 'duplicate',
    });
    const [after] = await getDb()
      .select()
      .from(orders)
      .where(eq(orders.id, order.id));
    expect(after.deliveredAt).toBeInstanceOf(Date);
    expect(after.deliveryEvidence).toContain('Shippo-verified USPS');
    expect(
      local.sqlite.prepare('SELECT count(*) AS n FROM shipping_tracking_events').get()!.n,
    ).toBe(1);
    expect(
      local.sqlite
        .prepare("SELECT count(*) AS n FROM order_events WHERE note LIKE 'Delivery confirmed%'")
        .get()!.n,
    ).toBe(1);
  });

  it('uses the independent lookup status instead of trusting a forged delivery body', async () => {
    const order = await shippedOrder();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json(payload('TRANSIT').data)),
    );
    expect(
      await processShippoTrackingEvent(parseShippoTrackEvent(payload())!),
    ).toMatchObject({ ok: true, outcome: 'recorded' });
    const [after] = await getDb()
      .select()
      .from(orders)
      .where(eq(orders.id, order.id));
    expect(after.deliveredAt).toBeNull();
    const [event] = await getDb().select().from(shippingTrackingEvents);
    expect(event).toMatchObject({ verified: true, status: 'TRANSIT' });
  });

  it('surfaces carrier failures for staff attention', async () => {
    await shippedOrder();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json(payload('FAILURE').data)),
    );
    expect(
      await processShippoTrackingEvent(parseShippoTrackEvent(payload('FAILURE'))!),
    ).toMatchObject({ ok: true, outcome: 'attention' });
    const [event] = await getDb().select().from(shippingTrackingEvents);
    expect(event.outcomeDetail).toContain('staff review');
    expect(await getDb().select().from(orderEvents)).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ note: expect.stringContaining('Delivery confirmed') }),
      ]),
    );
  });
});
