import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localD1 } from './helpers/local-d1';
import { seedCommerceFixture, syntheticBuyer } from './helpers/commerce-fixture';

const { env } = vi.hoisted(() => ({ env: {} as Record<string, unknown> }));
vi.mock('cloudflare:workers', () => ({ env }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

import { getCart } from '@/lib/cart';
import { createCheckoutQuotes } from '@/lib/checkout-quotes';
import { claimCouponRedemption, COUPON_COPY, createCoupon, discountFor, evaluateCoupon, releaseCouponRedemption, setCouponActive } from '@/lib/coupons';
import { createOrderFromCart } from '@/lib/orders';
import { orderTotals } from '@/lib/order-rules';
import type { ShipTo } from '@/lib/orders';
import { visibilityFor } from '@/lib/visibility-rules';

let local: ReturnType<typeof localD1>;
const shipTo: ShipTo = {
  consigneeName: 'Synthetic',
  consigneeInstitution: null,
  line1: '1 Test St',
  line2: null,
  city: 'Test City',
  region: 'CA',
  postalCode: '00000',
  country: 'US',
  phone: null,
};
const day = 86_400_000;
const base = {
  minSubtotalCents: null,
  startsAt: null,
  endsAt: null,
  maxRedemptions: null,
  perAccountLimit: null,
  note: null,
};
const row = (sql: string) => local.sqlite.prepare(sql).get() as Record<string, unknown> | undefined;

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
  vi.stubGlobal('fetch', vi.fn());
  await seedCommerceFixture();
});
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
  local.sqlite.close();
  for (const key of Object.keys(env)) delete env[key];
});

describe('promo codes (owner, 16 Sep 2026)', () => {
  it('validates what staff create and never reveals which codes exist', async () => {
    expect(await createCoupon({ ...base, code: 'X', kind: 'percent', value: 10 }, 'test')).toMatchObject({ ok: false });
    expect(await createCoupon({ ...base, code: 'TOO-MUCH', kind: 'percent', value: 120 }, 'test')).toMatchObject({ ok: false });
    expect(await createCoupon({ ...base, code: 'WELCOME10', kind: 'percent', value: 10, perAccountLimit: 1 }, 'test')).toMatchObject({ ok: true });
    expect(await createCoupon({ ...base, code: 'WELCOME10', kind: 'percent', value: 5 }, 'test')).toMatchObject({ ok: false, error: 'That code already exists.' });
    expect(await evaluateCoupon('nope', 'acct', 1000)).toEqual({ ok: false, error: COUPON_COPY.unknown });
    expect(await evaluateCoupon('welcome10', 'acct', 1000)).toMatchObject({ ok: true, discountCents: 100 });
  });

  it('applies every rule: window, minimum, total uses, per-account, inactive, and caps a fixed amount', async () => {
    await createCoupon({ ...base, code: 'LATER', kind: 'percent', value: 10, startsAt: new Date(Date.now() + day) }, 'test');
    await createCoupon({ ...base, code: 'GONE', kind: 'percent', value: 10, endsAt: new Date(Date.now() - day) }, 'test');
    await createCoupon({ ...base, code: 'BIGCART', kind: 'fixed', value: 500, minSubtotalCents: 2000 }, 'test');
    await createCoupon({ ...base, code: 'CAP', kind: 'fixed', value: 5000 }, 'test');
    const dead = await createCoupon({ ...base, code: 'DEAD', kind: 'percent', value: 10 }, 'test');
    if (dead.ok) await setCouponActive(dead.id, false);
    expect(await evaluateCoupon('LATER', 'acct', 1000)).toEqual({ ok: false, error: COUPON_COPY.notYet });
    expect(await evaluateCoupon('GONE', 'acct', 1000)).toEqual({ ok: false, error: COUPON_COPY.expired });
    expect(await evaluateCoupon('BIGCART', 'acct', 1000)).toEqual({ ok: false, error: COUPON_COPY.minimum(2000) });
    expect(await evaluateCoupon('BIGCART', 'acct', 2000)).toMatchObject({ ok: true, discountCents: 500 });
    expect(await evaluateCoupon('CAP', 'acct', 300)).toMatchObject({ ok: true, discountCents: 300 });
    expect(await evaluateCoupon('DEAD', 'acct', 1000)).toEqual({ ok: false, error: COUPON_COPY.inactive });
    expect(discountFor({ kind: 'percent', value: 33 }, 1000)).toBe(330);
    expect(orderTotals([{ unitPriceCents: 100, quantity: 10 }], 900, 149, 100)).toMatchObject({ discountCents: 100, totalCents: 1949 });
    expect(() => orderTotals([{ unitPriceCents: 100, quantity: 1 }], 0, 0, 5000)).toThrow(RangeError);
  });
  it('calculates large percentage discounts exactly and rejects unsafe amounts', async () => {
    const max = Number.MAX_SAFE_INTEGER;
    expect(discountFor({ kind: 'percent', value: 99 }, max)).toBe(Number((BigInt(max) * BigInt(99) + BigInt(50)) / BigInt(100)));
    expect(discountFor({ kind: 'percent', value: 100 }, max)).toBe(max);
    expect(discountFor({ kind: 'percent', value: 50 }, 101)).toBe(51);
    for (const bad of [max + 1, NaN, Infinity, -1, 0.5]) {
      expect(() => discountFor({ kind: 'fixed', value: bad }, 100)).toThrow(RangeError);
      expect(() => discountFor({ kind: 'percent', value: 10 }, bad)).toThrow(RangeError);
    }
    expect(await createCoupon({ ...base, code: 'UNSAFE', kind: 'fixed', value: max + 1 }, 'test')).toMatchObject({ ok: false });
  });

  it('prices the code into the delivery quote, with tax on the reduced subtotal', async () => {
    await createCoupon({ ...base, code: 'WELCOME10', kind: 'percent', value: 10 }, 'test');
    const guest = await syntheticBuyer(10);
    const visibility = visibilityFor(null, false, true);
    const cart = await getCart(guest.buyer.id, visibility);
    expect(cart.subtotalCents).toBe(1000);
    const unknown = await createCheckoutQuotes(guest.buyer.id, cart, shipTo, 'synthetic@example.invalid', 'NOPE');
    expect(unknown).toEqual({ ok: false, error: COUPON_COPY.unknown });
    const result = await createCheckoutQuotes(guest.buyer.id, cart, shipTo, 'synthetic@example.invalid', 'welcome10');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const quote = result.quotes[0];
    const expectedTax = Math.round(((1000 - 100 + quote.shippingCents) * 825) / 10_000);
    expect(quote).toMatchObject({ couponCode: 'WELCOME10', discountCents: 100, taxCents: expectedTax, totalCents: 1000 - 100 + quote.shippingCents + expectedTax });
  });

  it('records the redemption on the order and refuses a second use past the per-account limit', async () => {
    await createCoupon({ ...base, code: 'WELCOME10', kind: 'percent', value: 10, perAccountLimit: 1, maxRedemptions: 5 }, 'test');
    const guest = await syntheticBuyer(2);
    const visibility = visibilityFor(null, false, true);
    const cart = await getCart(guest.buyer.id, visibility);
    const quotes = await createCheckoutQuotes(guest.buyer.id, cart, shipTo, 'synthetic@example.invalid', 'WELCOME10');
    if (!quotes.ok) throw new Error(quotes.error);
    const quote = quotes.quotes[0];
    const created = await createOrderFromCart(guest.buyer, visibility, shipTo, null, null, 'b'.repeat(32), 'synthetic@example.invalid', quote.id);
    if (!created.ok) throw new Error(`order refused: ${created.error}`);
    const order = row(`SELECT coupon_code, discount_cents, subtotal_cents, shipping_cents, tax_cents, total_cents FROM orders WHERE order_number = '${created.orderNumber}'`)!;
    expect(order).toMatchObject({ coupon_code: 'WELCOME10', discount_cents: 20, subtotal_cents: 200, total_cents: quote.totalCents });
    expect(Number(order.subtotal_cents) - Number(order.discount_cents) + Number(order.shipping_cents) + Number(order.tax_cents)).toBe(Number(order.total_cents));
    expect(row('SELECT count(*) AS n FROM coupon_redemptions')!.n).toBe(1);
    expect(row(`SELECT redemption_count AS n FROM coupons WHERE code = 'WELCOME10'`)!.n).toBe(1);

    // The same account tries the code again on a new cart: the per-account limit holds.
    const { addToCart } = await import('@/lib/cart');
    await addToCart(guest.buyer.id, 'NPL-9999-2MG', 1, visibility);
    const again = await createCheckoutQuotes(guest.buyer.id, await getCart(guest.buyer.id, visibility), shipTo, 'synthetic@example.invalid', 'WELCOME10');
    expect(again).toEqual({ ok: false, error: COUPON_COPY.used });
  });
});

describe('the redemption cap under concurrent checkouts', () => {
  it('rolls back the order and preserves the cart if its coupon use cannot be recorded, then safely retries', async () => {
    await createCoupon({ ...base, code: 'ATOMIC10', kind: 'percent', value: 10, perAccountLimit: 1, maxRedemptions: 1 }, 'test');
    const guest = await syntheticBuyer(2);
    const visibility = visibilityFor(null, false, true);
    const cart = await getCart(guest.buyer.id, visibility);
    const quotes = await createCheckoutQuotes(guest.buyer.id, cart, shipTo, 'synthetic@example.invalid', 'ATOMIC10');
    if (!quotes.ok) throw new Error(quotes.error);
    const token = 'd'.repeat(32);
    const submit = () => createOrderFromCart(
      guest.buyer, visibility, shipTo, null, null, token,
      'synthetic@example.invalid', quotes.quotes[0].id,
    );
    local.sqlite.exec(`CREATE TRIGGER fail_coupon_record BEFORE INSERT ON coupon_redemptions
      BEGIN SELECT RAISE(ABORT, 'synthetic coupon record failure'); END;`);

    // The route already catches storage errors and returns a retry notice.
    await expect(submit()).rejects.toThrow('synthetic coupon record failure');
    expect(row('SELECT count(*) AS n FROM orders')?.n).toBe(0);
    expect(row('SELECT count(*) AS n FROM order_items')?.n).toBe(0);
    expect(row('SELECT count(*) AS n FROM inventory_reservations')?.n).toBe(0);
    expect(row('SELECT count(*) AS n FROM coupon_redemptions')?.n).toBe(0);
    expect(row("SELECT redemption_count AS n FROM coupons WHERE code = 'ATOMIC10'")?.n).toBe(0);
    expect((await getCart(guest.buyer.id, visibility)).lines).toHaveLength(cart.lines.length);

    local.sqlite.exec('DROP TRIGGER fail_coupon_record');
    const submitted = await submit();
    expect(submitted).toMatchObject({ ok: true });
    expect(await submit()).toMatchObject({ ok: true, duplicate: true });
    expect(row('SELECT count(*) AS n FROM orders')?.n).toBe(1);
    expect(row('SELECT count(*) AS n FROM coupon_redemptions')?.n).toBe(1);
    expect(row("SELECT redemption_count AS n FROM coupons WHERE code = 'ATOMIC10'")?.n).toBe(1);
    expect((await getCart(guest.buyer.id, visibility)).lines).toHaveLength(0);
  });

  it('lets exactly one of two racing orders take the last use', async () => {
    const created = await createCoupon({ ...base, code: 'LASTONE', kind: 'percent', value: 10, maxRedemptions: 1 }, 'test');
    if (!created.ok) throw new Error('setup');
    const id = created.id;

    // Both checkouts pass evaluateCoupon, because it only reads the count.
    expect((await evaluateCoupon('LASTONE', 'acct_a', 10_000)).ok).toBe(true);
    expect((await evaluateCoupon('LASTONE', 'acct_b', 10_000)).ok).toBe(true);

    // The claim is the serialisation point: the second one loses.
    expect(await claimCouponRedemption(id)).toBe(true);
    expect(await claimCouponRedemption(id)).toBe(false);
    expect(row('SELECT redemption_count FROM coupons')?.redemption_count).toBe(1);
    expect((await evaluateCoupon('LASTONE', 'acct_c', 10_000)).ok).toBe(false);
  });

  it('hands a claim back when the order it was taken for is never written, and never below zero', async () => {
    const created = await createCoupon({ ...base, code: 'GIVEBACK', kind: 'percent', value: 10, maxRedemptions: 1 }, 'test');
    if (!created.ok) throw new Error('setup');
    const id = created.id;
    expect(await claimCouponRedemption(id)).toBe(true);
    await releaseCouponRedemption(id);
    expect(row('SELECT redemption_count FROM coupons')?.redemption_count).toBe(0);
    // The use is available again, so a failed checkout does not burn a limited code.
    expect(await claimCouponRedemption(id)).toBe(true);
    await releaseCouponRedemption(id);
    await releaseCouponRedemption(id);
    expect(row('SELECT redemption_count FROM coupons')?.redemption_count).toBe(0);
  });

  it('never blocks an uncapped code', async () => {
    const created = await createCoupon({ ...base, code: 'UNCAPPED', kind: 'percent', value: 10 }, 'test');
    if (!created.ok) throw new Error('setup');
    for (let i = 0; i < 5; i += 1) expect(await claimCouponRedemption(created.id)).toBe(true);
    expect(row("SELECT redemption_count FROM coupons WHERE code = 'UNCAPPED'")?.redemption_count).toBe(5);
  });
});
