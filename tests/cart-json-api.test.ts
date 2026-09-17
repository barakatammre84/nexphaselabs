import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localD1 } from './helpers/local-d1';

const { env } = vi.hoisted(() => ({ env: {} as Record<string, unknown> }));
vi.mock('cloudflare:workers', () => ({ env }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(to);
  },
}));

import { getDb } from '@/db';
import { accounts, accountSessions, cartItems, lots, products, productVariants } from '@/db/schema';
import { GET as read, POST as add } from '@/app/api/cart/route';
import { POST as update } from '@/app/api/cart/update/route';
import { cartSummary } from '@/lib/cart-summary';
import { hashPassword, sha256Hex } from '@/lib/staff-auth-core';

let local: ReturnType<typeof localD1>;
const origin = 'https://test.example.invalid';
const TOKEN = 'e'.repeat(64);
const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(values)) data.set(k, v);
  return data;
};
const post = (path: string, values: Record<string, string>, { json = true, signedIn = true } = {}) =>
  new Request(`${origin}${path}`, {
    method: 'POST',
    headers: {
      Origin: origin,
      Host: new URL(origin).host,
      ...(signedIn ? { Cookie: `nx_account=${TOKEN}` } : {}),
      ...(json ? { Accept: 'application/json' } : {}),
    },
    body: form(values),
  });
const get = (signedIn = true) =>
  new Request(`${origin}/api/cart`, {
    headers: { Accept: 'application/json', ...(signedIn ? { Cookie: `nx_account=${TOKEN}` } : {}) },
  });

/** Force both requests to validate the same real SQLite snapshot before either writes. */
function synchronizeCartReads() {
  const prepare = local.binding.prepare.bind(local.binding);
  let reads = 0;
  let release!: () => void;
  const bothRead = new Promise<void>((resolve) => { release = resolve; });
  vi.spyOn(local.binding, 'prepare').mockImplementation((query) => {
    function wrap(statement: D1PreparedStatement): D1PreparedStatement {
      return new Proxy(statement, {
        get(target, property) {
          if (property === 'bind') return (...values: unknown[]) => wrap(target.bind(...values));
          if (property === 'raw' && /^select "id", "variant_id", "quantity" from "cart_items"/i.test(query)) {
            return async () => {
              const result = await target.raw();
              if (reads++ < 2) {
                if (reads === 2) release();
                await bothRead;
              }
              return result;
            };
          }
          const value = Reflect.get(target, property);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    }
    return wrap(prepare(query));
  });
}

beforeEach(async () => {
  local = localD1();
  Object.assign(env, {
    DB: local.binding,
    APP_ENV: 'staging',
    OPEN_CHECKOUT_ENABLED: 'true',
    ACCOUNT_REQUIRED: 'true',
    RESEARCHER_TIER_ENABLED: 'true',
    PUBLIC_ORIGIN: origin,
  });
  await getDb().insert(accounts).values({
    id: 'acct_cart',
    email: 'cart@example.invalid',
    name: 'Synthetic',
    passwordHash: await hashPassword('Synthetic-password-1'),
    status: 'active',
    tier: 'researcher',
    termsVersion: '2026-09-14',
    ruoVersion: '2026-09-14',
  } as never);
  await getDb().insert(accountSessions).values({
    id: 'sess_cart',
    accountId: 'acct_cart',
    tokenHash: await sha256Hex(TOKEN),
    expiresAt: new Date(Date.now() + 3600_000),
  } as never);
  await getDb().insert(products).values({
    id: 'p1', code: 'NPL-9999', slug: 'synthetic-test', name: 'Synthetic test only', formalName: 'Test',
    chemicalClass: 'Test', casNumber: '50-00-0', molecularFormula: 'Test', molecularWeight: 'Test', purity: 'Test',
    form: 'Test', saltForm: 'Test', storageSolid: 'Test', storageStock: 'Test', stability: 'Test', shipping: 'Test',
    description: 'Synthetic fixture, never published externally', visibility: 'published',
  } as never);
  await getDb().insert(productVariants).values({
    id: 'v1', productId: 'p1', sku: 'NPL-9999-2MG', quantity: '2 mg', presentation: 'Test',
    listPriceCents: 125, institutionalPriceCents: 100, active: true,
  } as never);
  await getDb().insert(lots).values({
    id: 'lot1', lotNumber: 'TEST-ONLY-LOT', productCode: 'NPL-9999', productName: 'Synthetic', casNumber: '50-00-0',
    status: 'released', analyticalLab: 'Fixture lab', accessionNumber: 'ACC-FIXTURE', testingStandard: 'Fixture panel v1',
    receivedAt: new Date(), quantityReceived: '20 mg', quantityRemaining: '20 mg',
  } as never);
});
afterEach(() => {
  local.sqlite.close();
  for (const key of Object.keys(env)) delete env[key];
});

describe('cart JSON API for the side drawer (owner, 16 Sep 2026)', () => {
  it('tells a stranger to sign in, in JSON, without creating anything', async () => {
    const anonymous = await read(get(false));
    expect(anonymous.status).toBe(401);
    expect(await anonymous.json()).toMatchObject({ ok: false, signIn: '/account/sign-in?return_to=%2Faccount%2Fcart' });
    const refused = await add(post('/api/cart', { sku: 'NPL-9999-2MG', quantity: '1', return_to: '/catalog/synthetic-test' }, { signedIn: false }));
    expect(refused.status).toBe(401);
    expect(await refused.json()).toMatchObject({ ok: false, signIn: '/account/sign-in?return_to=%2Fcatalog%2Fsynthetic-test' });
    expect(local.sqlite.prepare('SELECT count(*) AS n FROM accounts').get()!.n).toBe(1);
  });

  it('adds, reads, changes and removes a line for a signed-in account', async () => {
    expect(await (await read(get())).json()).toMatchObject({ ok: true, count: 0, lines: [] });
    const added = await add(post('/api/cart', { sku: 'NPL-9999-2MG', quantity: '2', return_to: '/catalog/synthetic-test' }));
    expect(added.status).toBe(200);
    const body = (await added.json()) as { ok: boolean; count: number; subtotalCents: number; lines: Array<Record<string, unknown>> };
    expect(body).toMatchObject({ ok: true, count: 2, subtotalCents: 250 });
    expect(body.lines[0]).toMatchObject({ sku: 'NPL-9999-2MG', pack: '2 mg', productSlug: 'synthetic-test', quantity: 2, unitPriceCents: 125, lineTotalCents: 250, problem: null });
    const itemId = body.lines[0].itemId as string;

    const more = await update(post('/api/cart/update', { item: itemId, quantity: '3' }));
    expect(await more.json()).toMatchObject({ ok: true, count: 3, subtotalCents: 375 });
    const gone = await update(post('/api/cart/update', { item: itemId, quantity: '0', remove: '1' }));
    expect(await gone.json()).toMatchObject({ ok: true, count: 0, lines: [] });
  });

  it('adds and updates quantities above 50 without clamping them', async () => {
    const added = await add(post('/api/cart', {
      sku: 'NPL-9999-2MG',
      quantity: '60',
      return_to: '/catalog/synthetic-test',
    }));
    const addedBody = (await added.json()) as { count: number; lines: Array<{ itemId: string; quantity: number }> };
    expect(addedBody).toMatchObject({ count: 60 });
    expect(addedBody.lines[0]).toMatchObject({ quantity: 60 });

    const changed = await update(post('/api/cart/update', {
      item: addedBody.lines[0].itemId,
      quantity: '75',
    }));
    expect(changed.status).toBe(200);
    expect(await changed.json()).toMatchObject({
      ok: true,
      count: 75,
      subtotalCents: 9375,
      lines: [{ quantity: 75 }],
    });
  });

  it('rejects unsafe and malformed API quantities explicitly', async () => {
    for (const quantity of ['9007199254740992', '1.5', '1e2', '']) {
      const response = await add(post('/api/cart', {
        sku: 'NPL-9999-2MG',
        quantity,
        return_to: '/catalog/synthetic-test',
      }));
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        ok: false,
        error: 'That pack size or quantity is not valid.',
      });
    }

    const added = await add(post('/api/cart', {
      sku: 'NPL-9999-2MG',
      quantity: '1',
      return_to: '/catalog/synthetic-test',
    }));
    const itemId = ((await added.json()) as { lines: Array<{ itemId: string }> }).lines[0].itemId;
    const response = await update(post('/api/cart/update', {
      item: itemId,
      quantity: '9007199254740992',
    }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false, error: 'That change was not valid.' });
  });

  it('rejects combined quantity overflow instead of silently replacing the quantity', async () => {
    await getDb().insert(cartItems).values({
      id: 'cit_overflow1',
      accountId: 'acct_cart',
      variantId: 'v1',
      quantity: Number.MAX_SAFE_INTEGER,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const response = await add(post('/api/cart', {
      sku: 'NPL-9999-2MG',
      quantity: '1',
      return_to: '/catalog/synthetic-test',
    }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: 'The combined quantity is too large.',
    });
    expect(local.sqlite.prepare('SELECT quantity FROM cart_items WHERE id = ?').get('cit_overflow1')!.quantity)
      .toBe(Number.MAX_SAFE_INTEGER);
  });

  it.each([0, 3])('preserves both concurrent additions with an initial quantity of %i', async (initial) => {
    local.sqlite.prepare('UPDATE product_variants SET price_breaks = ?').run(JSON.stringify([
      { minQuantity: 7, listPriceCents: 100, institutionalPriceCents: 80 },
    ]));
    await getDb().insert(cartItems).values({
      id: 'cit_other_owner', accountId: 'acct_other', variantId: 'v1', quantity: Number.MAX_SAFE_INTEGER,
    });
    if (initial) {
      await getDb().insert(cartItems).values({
        id: 'cit_concurrent', accountId: 'acct_cart', variantId: 'v1', quantity: initial,
      });
    }
    synchronizeCartReads();
    const responses = await Promise.all([2, 5].map((quantity) =>
      add(post('/api/cart', { sku: 'NPL-9999-2MG', quantity: String(quantity) })),
    ));
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(await (await read(get())).json()).toMatchObject({
      ok: true, count: initial + 7, subtotalCents: (initial + 7) * 100,
      lines: [{ quantity: initial + 7, unitPriceCents: 100 }],
    });
    expect(local.sqlite.prepare("SELECT count(*) AS n FROM cart_items WHERE account_id = 'acct_cart'").get()!.n).toBe(1);
    expect(local.sqlite.prepare("SELECT quantity FROM cart_items WHERE id = 'cit_other_owner'").get()!.quantity)
      .toBe(Number.MAX_SAFE_INTEGER);
  });

  it.each([
    { price: 0, initial: Number.MAX_SAFE_INTEGER - 1, error: 'The combined quantity is too large.' },
    {
      price: 125,
      initial: Math.floor(Number.MAX_SAFE_INTEGER / 125) - 1,
      error: 'This cart total is too large to calculate safely. Remove an item or reduce a quantity.',
    },
  ])('rechecks concurrent additions before overflowing quantity or price ($price cents)', async ({ price, initial, error }) => {
    local.sqlite.prepare('UPDATE product_variants SET list_price_cents = ?').run(price);
    await getDb().insert(cartItems).values({
      id: 'cit_concurrent', accountId: 'acct_cart', variantId: 'v1', quantity: initial,
    });
    synchronizeCartReads();
    const responses = await Promise.all([1, 1].map((quantity) =>
      add(post('/api/cart', { sku: 'NPL-9999-2MG', quantity: String(quantity) })),
    ));
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(await responses.find((response) => response.status === 409)!.json())
      .toMatchObject({ ok: false, error });
    expect(local.sqlite.prepare('SELECT quantity FROM cart_items WHERE id = ?').get('cit_concurrent')!.quantity)
      .toBe(initial + 1);
  });

  it('keeps the combined cart count safe when concurrent additions target different lines', async () => {
    local.sqlite.prepare('UPDATE product_variants SET list_price_cents = 0').run();
    await getDb().insert(productVariants).values({
      id: 'v2', productId: 'p1', sku: 'NPL-9999-1MG', quantity: '1 mg', presentation: 'Test',
      listPriceCents: 0, active: true,
    });
    await getDb().insert(cartItems).values([
      { id: 'cit_count1', accountId: 'acct_cart', variantId: 'v1', quantity: Number.MAX_SAFE_INTEGER - 2 },
      { id: 'cit_count2', accountId: 'acct_cart', variantId: 'v2', quantity: 1 },
    ]);
    synchronizeCartReads();
    const responses = await Promise.all(['NPL-9999-2MG', 'NPL-9999-1MG'].map((sku) =>
      add(post('/api/cart', { sku, quantity: '1' })),
    ));
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(await responses.find((response) => response.status === 409)!.json())
      .toMatchObject({ ok: false, error: 'The cart item count is too large.' });
    expect(await (await read(get())).json()).toMatchObject({ ok: true, count: Number.MAX_SAFE_INTEGER });
  });

  it.each([0, -1, 1.5])('refuses to add to an invalid stored quantity of %s', async (quantity) => {
    await getDb().insert(cartItems).values({
      id: 'cit_invalid', accountId: 'acct_cart', variantId: 'v1', quantity,
    });
    const response = await add(post('/api/cart', { sku: 'NPL-9999-2MG', quantity: '1' }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      ok: false, error: 'This cart line has an invalid quantity. Remove it and add the pack size again.',
    });
    expect(local.sqlite.prepare("SELECT quantity FROM cart_items WHERE id = 'cit_invalid'").get()!.quantity)
      .toBe(quantity);
  });

  it('rejects a safe integer whose priced line total would be unsafe', async () => {
    const response = await add(post('/api/cart', {
      sku: 'NPL-9999-2MG',
      quantity: String(Number.MAX_SAFE_INTEGER),
      return_to: '/catalog/synthetic-test',
    }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: 'This cart total is too large to calculate safely. Remove an item or reduce a quantity.',
    });
    expect(local.sqlite.prepare('SELECT count(*) AS n FROM cart_items').get()!.n).toBe(0);
  });

  it('keeps the plain-form answer for a browser without JavaScript', async () => {
    const added = await add(post('/api/cart', { sku: 'NPL-9999-2MG', quantity: '1', return_to: '/catalog/synthetic-test' }, { json: false }));
    expect(added.status).toBe(303);
    expect(added.headers.get('location')).toBe(`${origin}/account/cart?added=1`);
  });

  it('serialises exactly what the drawer shows', () => {
    const summary = cartSummary({
      subtotalCents: 250,
      orderable: true,
      lines: [
        {
          itemId: 'cit_x', quantity: 2, unitPriceCents: 125, listUnitPriceCents: null, problem: null,
          variant: { sku: 'NPL-9999-2MG', quantity: '2 mg' } as never,
          product: { name: 'Synthetic', slug: 'synthetic-test' } as never,
        },
      ],
    });
    expect(summary).toEqual({
      count: 2, subtotalCents: 250, orderable: true, freeShipping: null,
      lines: [{ itemId: 'cit_x', sku: 'NPL-9999-2MG', productName: 'Synthetic', productSlug: 'synthetic-test', pack: '2 mg', quantity: 2, unitPriceCents: 125, lineTotalCents: 250, problem: null }],
    });
  });
});
