import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localD1 } from './helpers/local-d1';

const { env } = vi.hoisted(() => ({ env: {} as Record<string, unknown> }));
vi.mock('cloudflare:workers', () => ({ env }));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

import { getCart } from '@/lib/cart';
import {
  acceptedCheckoutQuote,
  createCheckoutQuotes,
} from '@/lib/checkout-quotes';
import {
  seedCommerceFixture,
  syntheticBuyer,
} from './helpers/commerce-fixture';
import { visibilityFor } from '@/lib/visibility-rules';
import { createOrderFromCart } from '@/lib/orders';

let local: ReturnType<typeof localD1>;
const shipTo = {
  consigneeName: 'Synthetic buyer',
  consigneeInstitution: null,
  line1: '1 Test Street',
  line2: null,
  city: 'Test City',
  region: 'CA',
  postalCode: '00000',
  country: 'US',
  phone: null,
};

beforeEach(async () => {
  local = localD1();
  Object.assign(env, {
    DB: local.binding,
    APP_ENV: 'staging',
    OPEN_CHECKOUT_ENABLED: 'true',
    SHIPPING_PROVIDER: 'simulated',
    SHIPPING_SIMULATION_ENABLED: 'true',
    SHIPPING_FROM_JSON: JSON.stringify({
      name: 'Test origin',
      street1: '1 Origin Way',
      city: 'Oakland',
      state: 'CA',
      zip: '94612',
      country: 'US',
      is_residential: false,
    }),
    SHIPPING_DEFAULT_PARCEL_JSON: JSON.stringify({
      length: 8,
      width: 6,
      height: 4,
      baseWeight: 0.4,
      perPackWeight: 0.1,
    }),
    TAX_PROVIDER: 'simulated',
    TAX_SIMULATED_RATE_BPS: '825',
  });
  vi.stubGlobal('fetch', vi.fn());
  await seedCommerceFixture();
});

afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
  local.sqlite.close();
  for (const key of Object.keys(env)) delete env[key];
});

describe('server-owned checkout quotes', () => {
  it('compares UPS and FedEx, includes tax, and accepts the matching lowest option', async () => {
    const guest = await syntheticBuyer();
    const cart = await getCart(
      guest.buyer.id,
      visibilityFor(null, false, true),
    );
    const result = await createCheckoutQuotes(
      guest.buyer.id,
      cart,
      shipTo,
      'synthetic@example.invalid',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.quotes.map((quote) => quote.carrier)).toEqual(
      expect.arrayContaining(['UPS', 'FedEx']),
    );
    expect(result.quotes[0]).toMatchObject({
      carrier: 'UPS',
      shippingCents: 900,
      taxCents: 83,
      totalCents: 1083,
      test: true,
    });
    expect(
      await acceptedCheckoutQuote(
        result.quotes[0].id,
        guest.buyer.id,
        cart,
        shipTo,
        'synthetic@example.invalid',
      ),
    ).toMatchObject({ rateId: 'sim-ups-ground-1' });
    expect(
      local.sqlite.prepare('SELECT count(*) AS n FROM checkout_quotes').get()!
        .n,
    ).toBe(4);
  });

  it('rejects a changed address, changed contact, another buyer, and expiry', async () => {
    const guest = await syntheticBuyer();
    const cart = await getCart(
      guest.buyer.id,
      visibilityFor(null, false, true),
    );
    const result = await createCheckoutQuotes(
      guest.buyer.id,
      cart,
      shipTo,
      'synthetic@example.invalid',
    );
    if (!result.ok) throw new Error(result.error);
    const id = result.quotes[0].id;
    expect(
      await acceptedCheckoutQuote(
        id,
        guest.buyer.id,
        cart,
        { ...shipTo, line1: 'Changed' },
        'synthetic@example.invalid',
      ),
    ).toBeNull();
    expect(
      await acceptedCheckoutQuote(
        id,
        guest.buyer.id,
        cart,
        shipTo,
        'changed@example.invalid',
      ),
    ).toBeNull();
    expect(
      await acceptedCheckoutQuote(
        id,
        'another',
        cart,
        shipTo,
        'synthetic@example.invalid',
      ),
    ).toBeNull();
    expect(
      await acceptedCheckoutQuote(
        id,
        guest.buyer.id,
        cart,
        shipTo,
        'synthetic@example.invalid',
        new Date(Date.now() + 31 * 60_000),
      ),
    ).toBeNull();
  });

  it('copies the accepted shipping and tax into the immutable order total', async () => {
    env.CHECKOUT_QUOTES_REQUIRED = 'true';
    const guest = await syntheticBuyer();
    const visibility = visibilityFor(null, false, true);
    const cart = await getCart(guest.buyer.id, visibility);
    const missing = await createOrderFromCart(
      guest.buyer,
      visibility,
      shipTo,
      null,
      null,
      'a'.repeat(32),
      'synthetic@example.invalid',
    );
    expect(missing).toMatchObject({
      ok: false,
      error: expect.stringContaining('Compare delivery'),
    });
    const quoted = await createCheckoutQuotes(
      guest.buyer.id,
      cart,
      shipTo,
      'synthetic@example.invalid',
    );
    if (!quoted.ok) throw new Error(quoted.error);
    const created = await createOrderFromCart(
      guest.buyer,
      visibility,
      shipTo,
      null,
      null,
      'b'.repeat(32),
      'synthetic@example.invalid',
      quoted.quotes[0].id,
    );
    expect(created.ok).toBe(true);
    const row = local.sqlite
      .prepare(
        'SELECT shipping_cents, tax_cents, total_cents, shipping_service FROM orders',
      )
      .get()!;
    expect(row).toMatchObject({
      shipping_cents: 900,
      tax_cents: 83,
      total_cents: 1083,
      shipping_service: 'UPS Ground',
    });
  });
});
