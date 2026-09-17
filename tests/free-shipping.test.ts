import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localD1 } from './helpers/local-d1';
import { seedCommerceFixture, syntheticBuyer } from './helpers/commerce-fixture';

const { env } = vi.hoisted(() => ({ env: {} as Record<string, unknown> }));
vi.mock('cloudflare:workers', () => ({ env }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

import { getCart } from '@/lib/cart';
import { cartSummary } from '@/lib/cart-summary';
import { createCheckoutQuotes } from '@/lib/checkout-quotes';
import { freeShippingLine, freeShippingProgress, freeShippingThresholdCents } from '@/lib/free-shipping';
import type { ShipTo } from '@/lib/orders';
import { visibilityFor } from '@/lib/visibility-rules';

let local: ReturnType<typeof localD1>;
const shipTo: ShipTo = { consigneeName: 'Synthetic', consigneeInstitution: null, line1: '1 Test St', line2: null, city: 'Test City', region: 'CA', postalCode: '00000', country: 'US', phone: null };
const setThreshold = (cents: string) =>
  local.sqlite.prepare("INSERT INTO settings (key, value, updated_by, updated_at) VALUES ('shipping.free_threshold_cents', ?, 'test', 0)").run(cents);

beforeEach(async () => {
  local = localD1();
  Object.assign(env, {
    DB: local.binding,
    APP_ENV: 'staging',
    OPEN_CHECKOUT_ENABLED: 'true',
    SHIPPING_PROVIDER: 'simulated',
    SHIPPING_SIMULATION_ENABLED: 'true',
    SHIPPING_FROM_JSON: JSON.stringify({ name: 'Test origin', street1: '1 Origin Way', city: 'Oakland', state: 'CA', zip: '94612', country: 'US', is_residential: false }),
    SHIPPING_DEFAULT_PARCEL_JSON: JSON.stringify({ length: 8, width: 6, height: 4, baseWeight: 0.4, perPackWeight: 0.1 }),
    TAX_PROVIDER: 'simulated',
    TAX_SIMULATED_RATE_BPS: '825',
    CHECKOUT_QUOTES_REQUIRED: 'true',
  });
  await seedCommerceFixture();
});
afterEach(() => {
  local.sqlite.close();
  for (const key of Object.keys(env)) delete env[key];
});

describe('free delivery rule', () => {
  it('is off unless a positive whole number of cents is set', async () => {
    expect(freeShippingProgress(500, null)).toBeNull();
    expect(freeShippingProgress(500, 0)).toBeNull();
    expect(freeShippingProgress(500, 12.5)).toBeNull();
    expect(await freeShippingThresholdCents()).toBeNull();
    setThreshold('abc');
    expect(await freeShippingThresholdCents()).toBeNull();
  });

  it('measures the distance to the threshold and says so in one line', async () => {
    expect(freeShippingProgress(3000, 10000)).toEqual({ thresholdCents: 10000, remainingCents: 7000, qualifies: false });
    expect(freeShippingLine(freeShippingProgress(3000, 10000))).toBe('Add $70.00 in materials for free standard delivery.');
    expect(freeShippingProgress(10000, 10000)).toMatchObject({ remainingCents: 0, qualifies: true });
    expect(freeShippingLine(freeShippingProgress(12000, 10000))).toBe('Free standard delivery applies to this order.');
    expect(freeShippingLine(null)).toBeNull();
  });

  it('prices the cheapest delivery at nothing once the cart qualifies, and only then', async () => {
    const buyer = await syntheticBuyer(2); // 2 × $1.00 in the fixture
    const visibility = visibilityFor(null, false, true);
    const cart = await getCart(buyer.buyer.id, visibility);
    expect(cartSummary(cart).freeShipping).toBeNull();
    expect(cartSummary(cart, 500).freeShipping).toEqual({ thresholdCents: 500, remainingCents: 300, qualifies: false });

    const paid = await createCheckoutQuotes(buyer.buyer.id, cart, shipTo, 'buyer@example.invalid');
    if (!paid.ok) throw new Error(paid.error);
    expect(paid.quotes.every((quote) => quote.shippingCents > 0)).toBe(true);

    setThreshold('150');
    expect(await freeShippingThresholdCents()).toBe(150);
    expect(cartSummary(cart, await freeShippingThresholdCents()).freeShipping).toMatchObject({ qualifies: true });
    const free = await createCheckoutQuotes(buyer.buyer.id, cart, shipTo, 'buyer@example.invalid');
    if (!free.ok) throw new Error(free.error);
    expect(free.quotes[0].shippingCents).toBe(0);
    expect(free.quotes[0].totalCents).toBe(cart.subtotalCents + free.quotes[0].taxCents);
    expect(free.quotes.slice(1).every((quote) => quote.shippingCents > 0)).toBe(true);
  });
});
