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
import { fulfillmentQuotes, shippingLabels } from '@/db/commerce-schema';
import { orders } from '@/db/schema';
import { getOrderByNumber } from '@/lib/orders';
import {
  buyShippingLabel,
  clearFailedLabelPurchase,
  quoteFulfillment,
  shippingLabelHistory,
  voidShippingLabel,
} from '@/lib/shipping-labels';
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
  phone: '5105550100',
  email: 'shipping@example.com',
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
  it('quotes all three carriers and creates exactly one safe staging label', async () => {
    const order = await fulfillingOrder();
    const quoted = await quoteFulfillment(
      order,
      { length: 8, width: 6, height: 4, weight: 1 },
      staff,
    );
    if (!quoted.ok) throw new Error(quoted.error);
    expect(quoted.quotes.map((quote) => quote.carrier)).toEqual(
      expect.arrayContaining(['USPS', 'UPS', 'FedEx']),
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

  it('selects a named origin, refunds once, preserves history and permits one replacement label', async () => {
    const order = await fulfillingOrder();
    const secondOrigin = {
      ...origin,
      street1: '2 Origin Way',
      city: 'Berkeley',
      zip: '94704',
    };
    env.SHIPPO_ORIGINS_JSON = JSON.stringify([
      { id: 'oakland-1', label: 'Oakland location 1', address: origin },
      { id: 'berkeley-1', label: 'Berkeley location 1', address: secondOrigin },
    ]);
    const firstQuotes = await quoteFulfillment(
      order,
      { length: 8, width: 6, height: 4, weight: 1 },
      staff,
      'berkeley-1',
    );
    if (!firstQuotes.ok) throw new Error(firstQuotes.error);
    expect(firstQuotes.quotes[0]).toMatchObject({
      originId: 'berkeley-1',
      originLabel: 'Berkeley location 1',
    });
    const first = await buyShippingLabel(
      order,
      firstQuotes.quotes[0].id,
      staff,
    );
    if (!first.ok || !first.label) throw new Error('label not created');
    expect(first.label).toMatchObject({
      state: 'ready',
      originId: 'berkeley-1',
    });
    const refunded = await voidShippingLabel(
      order,
      'Packed dimensions changed',
      staff,
    );
    expect(refunded).toMatchObject({
      ok: true,
      label: { state: 'voided', refundState: 'success' },
    });
    expect(
      await voidShippingLabel(order, 'Packed dimensions changed', staff),
    ).toMatchObject({ ok: true, duplicate: true });

    const replacementQuotes = await quoteFulfillment(
      order,
      { length: 9, width: 6, height: 4, weight: 1.2 },
      staff,
      'oakland-1',
    );
    if (!replacementQuotes.ok) throw new Error(replacementQuotes.error);
    expect(
      await buyShippingLabel(order, replacementQuotes.quotes[0].id, staff),
    ).toMatchObject({
      ok: true,
      label: { state: 'ready', originId: 'oakland-1' },
    });
    expect(await shippingLabelHistory(order.id)).toHaveLength(2);
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

describe('clearing a failed label purchase', () => {
  it('clears a purchase that bought nothing so the order can be relabelled, and refuses anything else', async () => {
    const order = await fulfillingOrder();
    const quoted = await quoteFulfillment(order, { length: 8, width: 6, height: 4, weight: 1 }, staff);
    if (!quoted.ok) throw new Error(quoted.error);
    // What a rejected purchase leaves behind: an attention label, nothing bought, nothing to refund.
    await getDb().insert(shippingLabels).values({
      id: `lbl_${'b'.repeat(32)}`,
      orderId: order.id,
      quoteId: quoted.quotes[0].id,
      state: 'attention',
      carrier: 'UPS',
      serviceName: 'Ground',
      amountCents: 900,
      error: 'Synthetic: the rate expired before purchase',
      createdBy: 'test',
    });
    expect(await buyShippingLabel(order, quoted.quotes[1].id, staff)).toMatchObject({ ok: false, duplicate: true });

    expect(await clearFailedLabelPurchase(order, 'no', staff)).toMatchObject({ ok: false });
    expect(
      await clearFailedLabelPurchase(order, 'Carrier dashboard shows no label for this order', staff),
    ).toMatchObject({ ok: true, label: { state: 'voided', refundState: null } });

    const replacement = await quoteFulfillment(order, { length: 8, width: 6, height: 4, weight: 1 }, staff);
    if (!replacement.ok) throw new Error(replacement.error);
    expect(await buyShippingLabel(order, replacement.quotes[0].id, staff)).toMatchObject({
      ok: true,
      label: { state: 'ready' },
    });
    // A label that exists is never cleared here; it is refunded through the carrier.
    expect(
      await clearFailedLabelPurchase(order, 'Carrier dashboard shows no label for this order', staff),
    ).toMatchObject({ ok: false });
    expect(fetch).not.toHaveBeenCalled();
  });
});
