import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localD1 } from './helpers/local-d1';

const { env } = vi.hoisted(() => ({ env: {} as Record<string, unknown> }));
vi.mock('cloudflare:workers', () => ({ env }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }), headers: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

import { getDb } from '@/db';
import { productVariants } from '@/db/schema';
import { createGuestBuyer } from '@/lib/buyer-session';
import { addToCart } from '@/lib/cart';
import { packAvailable } from '@/lib/storefront';
import { visibilityFor } from '@/lib/visibility-rules';
import { seedCommerceFixture } from './helpers/commerce-fixture';

let local: ReturnType<typeof localD1>;

beforeEach(async () => {
  local = localD1();
  Object.assign(env, { DB: local.binding, APP_ENV: 'staging', OPEN_CHECKOUT_ENABLED: 'true' });
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
  });
});
