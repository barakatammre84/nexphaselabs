import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localD1 } from './helpers/local-d1';

const { env, reconcile, admin } = vi.hoisted(() => ({
  env: {} as Record<string, unknown>,
  reconcile: vi.fn(),
  admin: {
    id: 'stf_admin',
    email: 'admin@example.invalid',
    name: 'Synthetic admin',
    role: 'admin' as const,
    sessionId: 'ses_admin',
    mustChangePassword: false,
  },
}));
vi.mock('cloudflare:workers', () => ({ env }));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => new Headers(),
}));
vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  notFound: () => {
    throw new Error('Not found');
  },
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/staff-auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/staff-auth')>()),
  sameOrigin: () => true,
  getStaffFromRequest: async () => admin,
  requireStaff: async () => admin,
}));
// The provider lookup is not under test; the question is what staff see once it has answered.
vi.mock('@/lib/payment-attempts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/payment-attempts')>()),
  reconcilePaymentAttempt: reconcile,
}));

import { seedCommerceFixture, syntheticOrder } from './helpers/commerce-fixture';
import { POST } from '@/app/api/manage/orders/[orderNumber]/reconcile-payment/route';
import ManageOrderPage from '@/app/manage/orders/[orderNumber]/page';

/**
 * Readiness → "Check and attach existing invoice" redirected to the order page with
 * nothing to say when it worked, so staff could not tell a match from a no-op.
 */

const ORIGIN = 'https://staging.example.invalid';
let local: ReturnType<typeof localD1>;

async function reconcileFromReadiness(orderNumber: string): Promise<URL> {
  const response = await POST(
    new Request(`${ORIGIN}/api/manage/orders/${orderNumber}/reconcile-payment`, {
      method: 'POST',
      body: new URLSearchParams({ reference: 'SyntheticInvoice1' }),
    }),
    { params: Promise.resolve({ orderNumber }) },
  );
  expect(response.status).toBe(303);
  return new URL(response.headers.get('location') ?? '');
}

const render = async (orderNumber: string, landing: URL) =>
  renderToStaticMarkup(
    await ManageOrderPage({
      params: Promise.resolve({ orderNumber }),
      searchParams: Promise.resolve(Object.fromEntries(landing.searchParams)),
    }),
  );

beforeEach(async () => {
  local = localD1();
  Object.assign(env, {
    DB: local.binding,
    APP_ENV: 'staging',
    OPEN_CHECKOUT_ENABLED: 'true',
    INVENTORY_RESERVATION_MINUTES: '30',
    PUBLIC_ORIGIN: ORIGIN,
  });
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('No external calls')));
  reconcile.mockReset();
  await seedCommerceFixture();
});

afterEach(() => {
  vi.unstubAllGlobals();
  local.sqlite.close();
  for (const key of Object.keys(env)) delete env[key];
});

describe('payment reconciliation confirmation', () => {
  it('lands on the order with a status message when the invoice is attached', async () => {
    const { detail } = await syntheticOrder(1);
    const number = detail.order.orderNumber;
    reconcile.mockResolvedValue({ ok: true });

    const landing = await reconcileFromReadiness(number);
    expect(landing.pathname).toBe(`/manage/orders/${number}`);
    expect(landing.searchParams.get('reconciled')).toBe('1');

    const html = await render(number, landing);
    expect(html).toContain('Provider invoice matched and attached to this order.');
    expect(html).toContain('Nothing was marked paid');
  });

  it('shows the refusal and no confirmation when the invoice does not match', async () => {
    const { detail } = await syntheticOrder(1);
    const number = detail.order.orderNumber;
    reconcile.mockResolvedValue({
      ok: false,
      error: 'Provider invoice does not match this order, amount, currency and request.',
    });

    const landing = await reconcileFromReadiness(number);
    expect(landing.searchParams.get('reconciled')).toBeNull();

    const html = await render(number, landing);
    expect(html).toContain('Provider invoice does not match this order');
    expect(html).not.toContain('Provider invoice matched and attached');
  });
});
