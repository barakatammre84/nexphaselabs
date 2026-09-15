import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { localD1 } from './helpers/local-d1';

const { env } = vi.hoisted(() => ({ env: {} as Record<string, unknown> }));
vi.mock('cloudflare:workers', () => ({ env }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

import { seedCommerceFixture, syntheticOrder } from './helpers/commerce-fixture';
import { requestContactVerification } from '@/lib/order-contact-verification';
import { GET as verify } from '@/app/api/orders/verify/route';
import ConfirmEmailPage from '@/app/account/orders/confirm-email/page';

/**
 * The "confirm your email" link is usually opened on a device that never saw the
 * order. It used to redirect to the order page (a 404 without that browser's
 * session) or to the home page (which ignores the result).
 */

const ORIGIN = 'https://staging.example.invalid';
let local: ReturnType<typeof localD1>;

const tokenFromNotice = () => {
  const row = local.sqlite
    .prepare("SELECT action_path FROM notifications WHERE id LIKE 'verify:%' ORDER BY rowid DESC LIMIT 1")
    .get() as { action_path: string } | undefined;
  return row?.action_path?.split('token=')[1] ?? '';
};

const follow = async (token: string) => {
  const response = await verify(new Request(`${ORIGIN}/api/orders/verify?token=${encodeURIComponent(token)}`));
  expect(response.status).toBe(303);
  return new URL(response.headers.get('location') ?? '');
};

const render = async (searchParams: Record<string, string>) =>
  renderToStaticMarkup(await ConfirmEmailPage({ searchParams: Promise.resolve(searchParams) }));

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
  await seedCommerceFixture();
});

afterEach(() => {
  vi.unstubAllGlobals();
  local.sqlite.close();
  for (const key of Object.keys(env)) delete env[key];
});

describe('order email confirmation link', () => {
  it('lands on a page that needs no session and names the confirmed order', async () => {
    const order = await syntheticOrder(1);
    await requestContactVerification(order.detail.order.id);

    const landing = await follow(tokenFromNotice());
    expect(landing.pathname).toBe('/account/orders/confirm-email');
    expect(landing.searchParams.get('order')).toBe(order.detail.order.orderNumber);

    const html = await render(Object.fromEntries(landing.searchParams));
    expect(html).toContain('Email confirmed');
    expect(html).toContain(order.detail.order.orderNumber);
  });

  it('explains a link it cannot use instead of dropping the visitor on the home page', async () => {
    const landing = await follow('not-a-token');
    expect(landing.pathname).toBe('/account/orders/confirm-email');
    expect(landing.searchParams.get('verify')).toBe('unknown');

    expect(await render({ verify: 'unknown' })).toContain('recognise this confirmation link');
    expect(await render({ verify: 'expired' })).toContain('has expired');
  });

  it('never shows text from the address bar', async () => {
    const html = await render({ order: 'Resend payment to someone@example.invalid', verify: 'constructor' });
    expect(html).not.toContain('someone@example.invalid');
    expect(html).not.toContain('Email confirmed');
    expect(html).toContain('recognise this confirmation link');
  });
});
