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
import { fulfillmentQuotes } from '@/db/commerce-schema';
import { orders } from '@/db/schema';
import { getOrderByNumber } from '@/lib/orders';
import { buyShippingLabel, quoteFulfillment } from '@/lib/shipping-labels';
import type { StaffPrincipal } from '@/lib/staff-auth';
import {
  seedCommerceFixture,
  syntheticOrder,
} from './helpers/commerce-fixture';

let local: ReturnType<typeof localD1>;
const staff = {
  id: 'staff',
  name: 'Synthetic Ops',
  role: 'admin',
} as StaffPrincipal;
const origin = {
  name: 'Test origin',
  street1: '1 Origin Way',
  city: 'Oakland',
  state: 'CA',
  zip: '94612',
  country: 'US',
  is_residential: false,
};

beforeEach(async () => {
  local = localD1();
  Object.assign(env, {
    DB: local.binding,
    APP_ENV: 'staging',
    OPEN_CHECKOUT_ENABLED: 'true',
    SHIPPING_PROVIDER: 'simulated',
    SHIPPING_SIMULATION_ENABLED: 'true',
    SHIPPING_FROM_JSON: JSON.stringify(origin),
  });
  vi.stubGlobal('fetch', vi.fn());
  await seedCommerceFixture();
});

afterEach(() => {
  vi.unstubAllGlobals();
  local.sqlite.close();
  for (const key of Object.keys(env)) delete env[key];
});

async function fulfillingOrder() {
  const created = await syntheticOrder();
  await getDb()
    .update(orders)
    .set({ status: 'fulfilling' })
    .where(eq(orders.id, created.detail.order.id));
  return (await getOrderByNumber(created.detail.order.orderNumber))!.order;
}

describe('shipping label automation', () => {
  it('quotes both carriers and creates exactly one safe staging label', async () => {
    const order = await fulfillingOrder();
    const quoted = await quoteFulfillment(
      order,
      { length: 8, width: 6, height: 4, weight: 1 },
      staff,
    );
    if (!quoted.ok) throw new Error(quoted.error);
    expect(quoted.quotes.map((quote) => quote.carrier)).toEqual(
      expect.arrayContaining(['UPS', 'FedEx']),
    );
    const first = await buyShippingLabel(order, quoted.quotes[0].id, staff);
    expect(first).toMatchObject({
      ok: true,
      label: { state: 'ready', test: true, carrier: 'UPS' },
    });
    expect(first.label?.trackingNumber ?? '').toMatch(/^TEST/);
    expect(
      await buyShippingLabel(order, quoted.quotes[1].id, staff),
    ).toMatchObject({ ok: true, duplicate: true });
    expect(
      local.sqlite.prepare('SELECT count(*) AS n FROM shipping_labels').get()!
        .n,
    ).toBe(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('never retries an uncertain provider purchase and leaves it for reconciliation', async () => {
    const order = await fulfillingOrder();
    Object.assign(env, {
      APP_ENV: 'production',
      SHIPPING_PROVIDER: 'shippo',
      SHIPPING_SIMULATION_ENABLED: 'false',
      SHIPPO_API_KEY: 'shippo_live_synthetic',
      SHIPPO_CARRIER_ACCOUNTS: 'account1',
      LIVE_SHIPPING_ENABLED: 'true',
    });
    vi.mocked(fetch).mockRejectedValue(
      new Error('Synthetic timeout after provider commit'),
    );
    const now = new Date();
    await getDb()
      .insert(fulfillmentQuotes)
      .values({
        id: `fq_${'a'.repeat(32)}`,
        orderId: order.id,
        provider: 'shippo',
        shipmentId: 'shipment',
        rateId: 'rate',
        carrier: 'UPS',
        service: 'ground',
        serviceName: 'Ground',
        amountCents: 900,
        currency: 'USD',
        test: false,
        expiresAt: new Date(now.getTime() + 60_000),
        createdBy: 'test',
        createdAt: now,
      });
    expect(
      await buyShippingLabel(order, `fq_${'a'.repeat(32)}`, staff),
    ).toMatchObject({
      ok: false,
      uncertain: true,
      label: { state: 'attention' },
    });
    expect(
      await buyShippingLabel(order, `fq_${'a'.repeat(32)}`, staff),
    ).toMatchObject({
      ok: false,
      duplicate: true,
      label: { state: 'attention' },
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
