import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localD1 } from './helpers/local-d1';
const { env } = vi.hoisted(() => ({ env: {} as Record<string, unknown> }));
vi.mock('cloudflare:workers', () => ({ env }));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(to);
  },
}));
import { getDb } from '@/db';
import { lots, products, productVariants } from '@/db/schema';
import { getAccountFromRequest } from '@/lib/account-auth';
import {
  createGuestBuyer,
  getBuyerFromRequest,
  guestForToken,
} from '@/lib/buyer-session';
import { addToCart, getCart, setCartQuantity } from '@/lib/cart';
import { validateCheckout } from '@/lib/checkout-input';
import { createOrderFromCart, getOrderForAccount } from '@/lib/orders';
import { startFulfilment, recordShipment } from '@/lib/fulfilment';
import { visibilityFor } from '@/lib/visibility-rules';
import { POST as add } from '@/app/api/cart/route';
import { POST as submit } from '@/app/api/orders/route';
import { POST as pay } from '@/app/api/orders/[orderNumber]/pay/route';
import { POST as simulate } from '@/app/api/orders/[orderNumber]/simulate-payment/route';
import { getStaffFromRequest, type StaffPrincipal } from '@/lib/staff-auth';

let local: ReturnType<typeof localD1>;
const origin = 'https://test.example.invalid';
const visibility = visibilityFor(null, false, true);
const fields = {
  email: 'guest@example.invalid',
  name: 'Synthetic Guest',
  company: '',
  line1: '1 Test Street',
  line2: '',
  city: 'Test City',
  region: 'CA',
  postalCode: '00000',
  country: 'US',
  phone: '',
  confirm_ruo: 'on',
  confirm_age: 'on',
  token: 'a'.repeat(32),
};
const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(values)) data.set(k, v);
  return data;
};
const request = (
  path: string,
  cookie = '',
  values: Record<string, string> = {},
) =>
  new Request(`${origin}${path}`, {
    method: 'POST',
    headers: { Origin: origin, Host: new URL(origin).host, Cookie: cookie },
    body: form(values),
  });
const cookieFor = (result: { cookie: string }) => result.cookie.split(';')[0];
const params = (orderNumber: string) => ({
  params: Promise.resolve({ orderNumber }),
});
const count = (table: string) =>
  local.sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get()!.n;

beforeEach(async () => {
  local = localD1();
  Object.assign(env, {
    DB: local.binding,
    APP_ENV: 'staging',
    OPEN_CHECKOUT_ENABLED: 'true',
    PUBLIC_ORIGIN: origin,
  });
  vi.stubGlobal(
    'fetch',
    vi.fn().mockRejectedValue(new Error('No external services in tests')),
  );
  await getDb()
    .insert(products)
    .values({
      id: 'p1',
      code: 'NPL-9999',
      slug: 'synthetic-test',
      name: 'Synthetic test only',
      formalName: 'Test',
      chemicalClass: 'Test',
      casNumber: '50-00-0',
      molecularFormula: 'Test',
      molecularWeight: 'Test',
      purity: 'Test',
      form: 'Test',
      saltForm: 'Test',
      storageSolid: 'Test',
      storageStock: 'Test',
      stability: 'Test',
      shipping: 'Test',
      description: 'Synthetic fixture, never published externally',
      visibility: 'published',
    });
  await getDb()
    .insert(productVariants)
    .values({
      id: 'v1',
      productId: 'p1',
      sku: 'NPL-9999-2MG',
      quantity: '2 mg',
      presentation: 'Test',
      listPriceCents: 125,
      institutionalPriceCents: 100,
      active: true,
    });
  await getDb()
    .insert(lots)
    .values({
      id: 'lot1',
      lotNumber: 'TEST-ONLY-LOT',
      productCode: 'NPL-9999',
      productName: 'Synthetic',
      casNumber: '50-00-0',
      status: 'released',
      analyticalLab: 'Fixture lab', accessionNumber: 'ACC-FIXTURE', testingStandard: 'Fixture panel v1',
      receivedAt: new Date(),
      quantityReceived: '20 mg',
      quantityRemaining: '20 mg',
    });
});
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
  local.sqlite.close();
  for (const key of Object.keys(env)) delete env[key];
});

describe('guest purchase end to end', () => {
  it('adds without registration, submits delivery details, completes test payment and can be fulfilled', async () => {
    const added = await add(
      request('/api/cart', '', { sku: 'NPL-9999-2MG', quantity: '2' }),
    );
    expect(added.status).toBe(303);
    const cookie = added.headers.get('set-cookie')!.split(';')[0];
    expect(added.headers.get('set-cookie')).toContain('HttpOnly');
    expect(added.headers.get('set-cookie')).toContain('Secure');
    expect(await getStaffFromRequest(request('/', cookie.replace('nx_guest=', 'nx_staff=')))).toBeNull();
    const buyer = (await getBuyerFromRequest(request('/', cookie)))!;
    expect(buyer.status).toBe('guest');
    expect(buyer.verificationStatus).toBe('none');
    expect(
      await getAccountFromRequest(
        request('/', cookie.replace('nx_guest=', 'nx_account=')),
      ),
    ).toBeNull();
    // The age statement is a required box in its own right: without it the order is refused
    // with a message, and nothing is written.
    const { confirm_age: _omitted, ...withoutAge } = fields;
    const refused = await submit(request('/api/orders', cookie, withoutAge));
    expect(refused.status).toBe(303);
    expect(decodeURIComponent(refused.headers.get('location')!)).toContain('21 years of age');
    expect(count('orders')).toBe(0);
    const submitted = await submit(request('/api/orders', cookie, fields));
    const location = new URL(submitted.headers.get('location')!);
    const number = location.pathname.split('/').at(-1)!;
    expect(location.pathname).toMatch(/^\/account\/orders\/NX-/);
    const detail = (await getOrderForAccount(buyer.id, number))!;
    expect(detail.order.totalCents).toBe(250);
    expect(
      local.sqlite.prepare('SELECT age_confirmed AS a, ruo_version AS v FROM orders').get()!,
    ).toEqual({ a: 1, v: '2026-09-14' });
    expect(detail.order.contactEmail).toBe(fields.email);
    expect(detail.order.organizationId).toBeNull();
    expect(count('cart_items')).toBe(0);
    expect(
      local.sqlite.prepare('SELECT recipient FROM notifications').get()!
        .recipient,
    ).toBe(fields.email);
    expect(count('email_tokens')).toBe(0);
    expect(count('organizations')).toBe(0);
    expect(
      (await submit(request('/api/orders', cookie, fields))).headers.get(
        'location',
      ),
    ).toContain(number);
    expect(count('orders')).toBe(1);
    expect(
      (await pay(request('/', cookie, { method: 'invoice' }), params(number)))
        .status,
    ).toBe(303);
    expect(
      (await simulate(request('/', cookie), params(number))).headers.get(
        'location',
      ),
    ).toContain('paid=simulated');
    expect(
      (await simulate(request('/', cookie), params(number))).headers.get(
        'location',
      ),
    ).toContain('paid=simulated');
    expect(count('order_events')).toBe(3);
    const staff = {
      id: 'staff_test',
      name: 'Test Ops',
      role: 'admin',
    } as StaffPrincipal;
    expect(
      (
        await startFulfilment(
          (await getOrderForAccount(buyer.id, number))!,
          staff,
        )
      ).ok,
    ).toBe(true);
    const ready = (await getOrderForAccount(buyer.id, number))!;
    expect(
      await recordShipment(
        ready,
        {
          picks: { [ready.items[0].id]: 'lot1' },
          carrier: 'Test',
          trackingNumber: 'TEST-ONLY',
          shippedOn: new Date().toISOString().slice(0, 10),
        },
        staff,
      ),
    ).toEqual({ ok: true });
    expect(
      local.sqlite.prepare('SELECT quantity_remaining FROM lots').get()!
        .quantity_remaining,
    ).toBe('16 mg');
  });
  it('keeps carts, orders, and payment actions isolated between two guests', async () => {
    const a = await createGuestBuyer(true);
    const b = await createGuestBuyer(true);
    await addToCart(a.buyer.id, 'NPL-9999-2MG', 1, visibility);
    const cart = await getCart(a.buyer.id, visibility);
    await setCartQuantity(b.buyer.id, cart.lines[0].itemId, 0);
    expect((await getCart(a.buyer.id, visibility)).lines).toHaveLength(1);
    expect((await getCart(b.buyer.id, visibility)).lines).toHaveLength(0);
    const response = await submit(request('/', cookieFor(a), fields));
    const number = new URL(response.headers.get('location')!).pathname
      .split('/')
      .at(-1)!;
    expect(await getOrderForAccount(b.buyer.id, number)).toBeNull();
    expect(
      (
        await pay(
          request('/', cookieFor(b), { method: 'invoice' }),
          params(number),
        )
      ).status,
    ).toBe(404);
    expect(
      (await simulate(request('/', cookieFor(b)), params(number))).status,
    ).toBe(404);
    expect((await simulate(request('/'), params(number))).status).toBe(401);
  });
  it.each(['production', 'preview', '', undefined])(
    'never allows buyer settlement for environment %s',
    async (value) => {
      env.APP_ENV = value;
      expect(
        (await simulate(request('/'), params('NX-260904-0001'))).status,
      ).toBe(403);
    },
  );
  it('refuses cross-origin mutations before creating a session', async () => {
    const req = request('/api/cart', '', { sku: 'NPL-9999-2MG' });
    req.headers.set('origin', 'https://attacker.invalid');
    expect((await add(req)).status).toBe(403);
    expect(count('accounts')).toBe(0);
  });
  it.each([
    'UPDATE account_sessions SET revoked_at=unixepoch()',
    'UPDATE account_sessions SET expires_at=unixepoch()-1',
    "UPDATE accounts SET status='suspended'",
  ])('invalidates guest access: %s', async (change) => {
    const guest = await createGuestBuyer(true);
    local.sqlite.exec(change);
    expect(
      await getBuyerFromRequest(request('/', cookieFor(guest))),
    ).toBeNull();
  });
  it('disables guest sessions when the rollout switch is off', async () => {
    const guest = await createGuestBuyer(true);
    env.OPEN_CHECKOUT_ENABLED = 'false';
    expect(await guestForToken(cookieFor(guest).split('=')[1])).toBeNull();
    await expect(createGuestBuyer(true)).rejects.toThrow('disabled');
    expect(
      (await add(request('/', '', { sku: 'NPL-9999-2MG' }))).headers.get(
        'location',
      ),
    ).toContain('/account/sign-in');
  });
  it.each([
    'UPDATE product_variants SET list_price_cents=999',
    "UPDATE lots SET status='on_hold'",
    'UPDATE account_sessions SET revoked_at=unixepoch()',
    'UPDATE cart_items SET quantity=2',
  ])(
    'rechecks the offer and session at transaction commit: %s',
    async (change) => {
      const guest = await createGuestBuyer(true);
      await addToCart(guest.buyer.id, 'NPL-9999-2MG', 1, visibility);
      const input = validateCheckout(form(fields));
      if (!input.ok) throw Error(input.error);
      local.beforeNextBatch(() => local.sqlite.exec(change));
      expect(
        (
          await createOrderFromCart(
            guest.buyer,
            visibility,
            input.details.shipTo,
            null,
            null,
            fields.token,
            fields.email,
          )
        ).ok,
      ).toBe(false);
      expect(count('orders')).toBe(0);
      expect(count('notifications')).toBe(0);
      expect(count('cart_items')).toBe(1);
    },
  );
  it('validates required contact and delivery fields without verifying identity', () => {
    expect(validateCheckout(form(fields)).ok).toBe(true);
    for (const missing of [
      'email',
      'name',
      'line1',
      'city',
      'region',
      'postalCode',
      'country',
    ])
      expect(validateCheckout(form({ ...fields, [missing]: '' })).ok).toBe(
        false,
      );
    expect(
      validateCheckout(form({ ...fields, email: 'bad\nemail@example.invalid' }))
        .ok,
    ).toBe(false);
    expect(validateCheckout(form({ ...fields, country: 'CA' })).ok).toBe(false);
  });
});
