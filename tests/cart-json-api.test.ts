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
import { accounts, accountSessions, lots, products, productVariants } from '@/db/schema';
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
