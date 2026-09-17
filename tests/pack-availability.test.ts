import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localD1 } from './helpers/local-d1';

const { env, recordCommerceEvent } = vi.hoisted(() => ({
  env: {} as Record<string, unknown>,
  recordCommerceEvent: vi.fn(),
}));
vi.mock('cloudflare:workers', () => ({ env }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }), headers: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@/lib/commerce-events', () => ({ recordCommerceEvent }));

import { getDb } from '@/db';
import { productVariants } from '@/db/schema';
import { createGuestBuyer } from '@/lib/buyer-session';
import { addToCart, clearCart, getCart, setCartQuantity } from '@/lib/cart';
import { packAvailable } from '@/lib/storefront';
import { visibilityFor } from '@/lib/visibility-rules';
import { seedCommerceFixture } from './helpers/commerce-fixture';

let local: ReturnType<typeof localD1>;

beforeEach(async () => {
  local = localD1();
  Object.assign(env, { DB: local.binding, APP_ENV: 'staging', OPEN_CHECKOUT_ENABLED: 'true' });
  recordCommerceEvent.mockClear();
  await seedCommerceFixture();
  // A pack size the 10 mg fixture lot cannot fill.
  await getDb().insert(productVariants).values({ id: 'v50', productId: 'p', sku: 'NPL-9999-50MG', quantity: '50 mg', presentation: 'powder', listPriceCents: 1500, active: true });
});

afterEach(() => {
  local.sqlite.close();
  for (const key of Object.keys(env)) delete env[key];
});

describe('pack sizes no released lot can supply', () => {
  it('agrees with the pack table about which sizes are in stock', async () => {
    expect(await packAvailable('NPL-9999', '2 mg')).toBe(true);
    expect(await packAvailable('NPL-9999', '50 mg')).toBe(false);
  });

  it('refuses to add an out-of-stock pack size to the cart', async () => {
    const { buyer } = await createGuestBuyer(true);
    const visibility = visibilityFor(null, false, true);
    expect(await addToCart(buyer.id, 'NPL-9999-50MG', 1, visibility)).toMatchObject({
      ok: false,
      error: expect.stringContaining('out of stock'),
    });
    expect(await addToCart(buyer.id, 'NPL-9999-2MG', 1, visibility)).toMatchObject({ ok: true });
    expect(local.sqlite.prepare('SELECT count(*) AS n FROM cart_items').get()!.n).toBe(1);
    expect(recordCommerceEvent).toHaveBeenCalledOnce();
    expect(recordCommerceEvent).toHaveBeenCalledWith('cart_item_added', {
      quantity: 1,
      source: 'storefront',
    });
  });

  it('records only committed cart deltas and transitions', async () => {
    const { buyer } = await createGuestBuyer(true);
    const visibility = visibilityFor(null, false, true);
    await addToCart(buyer.id, 'NPL-9999-2MG', 2, visibility);
    await addToCart(buyer.id, 'NPL-9999-2MG', 3, visibility);
    const [line] = (await getCart(buyer.id, visibility)).lines;

    await setCartQuantity(buyer.id, line.itemId, 5, visibility);
    await setCartQuantity(buyer.id, line.itemId, 4, visibility);
    await setCartQuantity(buyer.id, line.itemId, 0, visibility);
    await setCartQuantity(buyer.id, line.itemId, 0, visibility);

    expect(recordCommerceEvent.mock.calls).toEqual([
      ['cart_item_added', { quantity: 2, source: 'storefront' }],
      ['cart_item_added', { quantity: 3, source: 'storefront' }],
      ['cart_quantity_updated', { quantity: 4, source: 'storefront' }],
      ['cart_item_removed', { quantity: 4, source: 'storefront' }],
    ]);
  });

  it('records each line removed by a multi-line cart clear', async () => {
    const { buyer } = await createGuestBuyer(true);
    const visibility = visibilityFor(null, false, true);
    await getDb().insert(productVariants).values({
      id: 'v4',
      productId: 'p',
      sku: 'NPL-9999-4MG',
      quantity: '4 mg',
      presentation: 'powder',
      listPriceCents: 400,
      active: true,
    });
    await addToCart(buyer.id, 'NPL-9999-2MG', 2, visibility);
    await addToCart(buyer.id, 'NPL-9999-4MG', 1, visibility);

    recordCommerceEvent.mockClear();
    await clearCart(buyer.id);
    await clearCart(buyer.id);

    expect(recordCommerceEvent).toHaveBeenCalledTimes(2);
    expect(recordCommerceEvent.mock.calls).toEqual(expect.arrayContaining([
      ['cart_item_removed', { quantity: 2, source: 'storefront' }],
      ['cart_item_removed', { quantity: 1, source: 'storefront' }],
    ]));
  });
});
