import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localD1 } from './helpers/local-d1';

const { env } = vi.hoisted(() => ({ env: {} as Record<string, unknown> }));
vi.mock('cloudflare:workers', () => ({ env }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

import { seedCommerceFixture, syntheticBuyer } from './helpers/commerce-fixture';
import { getCart } from '@/lib/cart';
import { getOrderByNumber } from '@/lib/orders';
import { visibilityFor } from '@/lib/visibility-rules';

/**
 * Volume pricing, end to end. The cart is not the authority: the order guard
 * re-derives the same ladder in SQL inside the accepting statement, so these
 * tests care as much about what happens when the two disagree.
 */

let local: ReturnType<typeof localD1>;
const visibility = visibilityFor(null, false, true);

/** The fixture pack is $1.00; a ladder the owner might have typed. */
const setLadder = (ladder: unknown) =>
  local.sqlite
    .prepare('UPDATE product_variants SET price_breaks = ? WHERE sku = ?')
    .run(ladder === null ? null : JSON.stringify(ladder), 'NPL-9999-2MG');

const LADDER = [
  { minQuantity: 4, listPriceCents: 90, institutionalPriceCents: null },
  { minQuantity: 10, listPriceCents: 75, institutionalPriceCents: null },
];

beforeEach(async () => {
  local = localD1();
  Object.assign(env, {
    DB: local.binding,
    APP_ENV: 'staging',
    OPEN_CHECKOUT_ENABLED: 'true',
    INVENTORY_RESERVATION_MINUTES: '30',
  });
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('No external calls')));
  await seedCommerceFixture();
});

afterEach(() => {
  vi.unstubAllGlobals();
  local.sqlite.close();
  for (const key of Object.keys(env)) delete env[key];
});

describe('a cart with volume pricing', () => {
  it('charges the list price below the first threshold', async () => {
    setLadder(LADDER);
    const buyer = await syntheticBuyer(3);
    const cart = await getCart(buyer.buyer.id, visibility);
    expect(cart.lines[0].unitPriceCents).toBe(100);
    expect(cart.lines[0].listUnitPriceCents).toBeNull();
    expect(cart.subtotalCents).toBe(300);
  });

  it('charges the volume price at the threshold, and shows what it was', async () => {
    setLadder(LADDER);
    const buyer = await syntheticBuyer(4);
    const cart = await getCart(buyer.buyer.id, visibility);
    expect(cart.lines[0].unitPriceCents).toBe(90);
    expect(cart.lines[0].listUnitPriceCents).toBe(100);
    expect(cart.subtotalCents).toBe(360);
  });

  it('behaves exactly as before when no ladder is entered', async () => {
    const buyer = await syntheticBuyer(10);
    const cart = await getCart(buyer.buyer.id, visibility);
    expect(cart.lines[0].unitPriceCents).toBe(100);
    expect(cart.lines[0].listUnitPriceCents).toBeNull();
    expect(cart.subtotalCents).toBe(1000);
  });

  it('ignores a ladder row that would raise the price', async () => {
    setLadder([{ minQuantity: 2, listPriceCents: 500, institutionalPriceCents: null }]);
    const buyer = await syntheticBuyer(5);
    expect((await getCart(buyer.buyer.id, visibility)).subtotalCents).toBe(500);
  });

  it('ignores a malformed ladder rather than pricing from it', async () => {
    local.sqlite.prepare('UPDATE product_variants SET price_breaks = ? WHERE sku = ?').run('not json', 'NPL-9999-2MG');
    const buyer = await syntheticBuyer(5);
    expect((await getCart(buyer.buyer.id, visibility)).lines[0].unitPriceCents).toBe(100);
  });
});

describe('the order that comes out of it', () => {
  it('is accepted at the volume price, and the line records it', async () => {
    setLadder(LADDER);
    const buyer = await syntheticBuyer(4);
    const result = await buyer.submit();
    expect(result.ok).toBe(true);
    const detail = (await getOrderByNumber(result.ok ? result.orderNumber : ''))!;
    expect(detail.items[0].unitPriceCents).toBe(90);
    expect(detail.items[0].lineTotalCents).toBe(360);
    expect(detail.order.subtotalCents).toBe(360);
  });

  it('takes the deepest threshold reached, not the first', async () => {
    setLadder(LADDER);
    // the fixture lot holds 10 mg and a pack is 2 mg; ten packs needs more
    local.sqlite.exec("UPDATE lots SET quantity_remaining = '40 mg', quantity_received = '40 mg'");
    const buyer = await syntheticBuyer(10);
    const result = await buyer.submit();
    expect(result.ok).toBe(true);
    const detail = (await getOrderByNumber(result.ok ? result.orderNumber : ''))!;
    expect(detail.items[0].unitPriceCents).toBe(75);
    expect(detail.order.subtotalCents).toBe(750);
  });

  it('bills the ladder in force at submission, never the one that was browsed', async () => {
    // The cart is re-derived inside the accepting statement rather than carried
    // from the page, so an owner editing the ladder mid-session changes what is
    // charged — and the guard proves the two agree before the order is written.
    setLadder(LADDER);
    const buyer = await syntheticBuyer(4);
    expect((await getCart(buyer.buyer.id, visibility)).subtotalCents).toBe(360);

    setLadder([{ minQuantity: 4, listPriceCents: 95, institutionalPriceCents: null }]);
    const result = await buyer.submit();
    expect(result.ok).toBe(true);
    const detail = (await getOrderByNumber(result.ok ? result.orderNumber : ''))!;
    expect(detail.items[0].unitPriceCents).toBe(95);
    expect(detail.order.subtotalCents).toBe(380);
  });

  it('returns to the list price when the ladder is withdrawn mid-session', async () => {
    setLadder(LADDER);
    const buyer = await syntheticBuyer(4);
    expect((await getCart(buyer.buyer.id, visibility)).subtotalCents).toBe(360);
    setLadder(null);
    const result = await buyer.submit();
    expect(result.ok).toBe(true);
    const detail = (await getOrderByNumber(result.ok ? result.orderNumber : ''))!;
    expect(detail.items[0].unitPriceCents).toBe(100);
  });

  it('still accepts an ordinary order when a ladder exists but is not reached', async () => {
    setLadder(LADDER);
    const buyer = await syntheticBuyer(2);
    const result = await buyer.submit();
    expect(result.ok).toBe(true);
    const detail = (await getOrderByNumber(result.ok ? result.orderNumber : ''))!;
    expect(detail.items[0].unitPriceCents).toBe(100);
  });
});
