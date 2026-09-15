import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.stubGlobal('React', React);

const { env, buyer, cart, organization } = vi.hoisted(() => ({
  env: {} as Record<string, unknown>,
  buyer: {
    id: 'acct_cart',
    email: 'synthetic@example.invalid',
    name: 'Synthetic buyer',
    tier: 'institutional',
    status: 'active',
    verificationStatus: 'approved',
  },
  cart: {
    lines: [
      {
        itemId: 'item1',
        quantity: 1,
        unitPriceCents: 2900,
        listUnitPriceCents: null,
        problem: null,
        product: { name: 'Synthetic material', slug: 'synthetic-material' },
        variant: { sku: 'NPL-TEST-50MG', quantity: '50 mg', presentation: 'Lyophilized solid' },
      },
    ],
    subtotalCents: 2900,
    orderable: true,
  },
  organization: {
    verificationStatus: 'approved',
    receivingParty: 'Synthetic receiver',
    legalName: 'Synthetic institution',
    addressLine1: '1 Receiving Dock',
    addressLine2: null,
    city: 'Test City',
    region: 'CA',
    postalCode: '00000',
    country: 'US',
  },
}));
vi.mock('cloudflare:workers', () => ({ env }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock('next/navigation', () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock('@/lib/account-auth', () => ({ requireAccount: async () => buyer }));
vi.mock('@/lib/buyer-session', () => ({ getBuyer: async () => buyer }));
vi.mock('@/lib/visibility', () => ({
  currentViewer: async () => ({ account: buyer, visibility: { pricing: 'institutional', availability: true } }),
}));
vi.mock('@/lib/cart', () => ({ getCart: async () => cart }));
vi.mock('@/lib/account-addresses', () => ({ listAddresses: async () => [] }));
vi.mock('@/lib/organizations', () => ({ getOrganizationForAccount: async () => organization }));

import CartPage from '@/app/account/cart/page';
import { onlineOrderingOpen } from '@/lib/checkout-quotes';
import { STOREFRONT_COPY } from '@/lib/storefront-copy';

/**
 * Friday's launch is catalog-only: production has no live shipping or tax yet, and every order
 * needs a quote. A buyer who reaches the cart is told ordering is not open, instead of filling in
 * checkout and getting setting names meant for staff back from the quote request.
 */
const SIMULATED_QUOTING = {
  SHIPPING_PROVIDER: 'simulated',
  SHIPPING_SIMULATION_ENABLED: 'true',
  SHIPPING_FROM_JSON: JSON.stringify({
    name: 'Test origin',
    street1: '1 Origin Way',
    city: 'Oakland',
    state: 'CA',
    zip: '94612',
    country: 'US',
    is_residential: false,
  }),
  TAX_PROVIDER: 'simulated',
  TAX_SIMULATED_RATE_BPS: '825',
};

async function renderCart(): Promise<string> {
  return renderToStaticMarkup(await CartPage({ searchParams: Promise.resolve({}) }));
}

afterEach(() => {
  for (const key of Object.keys(env)) delete env[key];
});

describe('the cart while online ordering is not open', () => {
  it('tells an approved wholesale buyer ordering is not open instead of offering checkout', async () => {
    Object.assign(env, { APP_ENV: 'production' });
    const html = await renderCart();
    expect(html).toContain('Synthetic material');
    expect(html).toContain(STOREFRONT_COPY.orderingNotOpen);
    expect(html).not.toContain('Continue to payment');
    expect(html).not.toMatch(/shippo|taxjar|not configured/i);
  });

  it('offers checkout once shipping and tax quoting work', async () => {
    Object.assign(env, { APP_ENV: 'staging', CHECKOUT_QUOTES_REQUIRED: 'true', ...SIMULATED_QUOTING });
    const html = await renderCart();
    expect(html).toContain('Continue to payment');
    expect(html).not.toContain(STOREFRONT_COPY.orderingNotOpen);
  });
});

describe('whether online ordering is open', () => {
  it('needs both shipping and tax quoting where an order needs a quote', () => {
    Object.assign(env, { APP_ENV: 'production' });
    expect(onlineOrderingOpen()).toBe(false);
    Object.assign(env, { APP_ENV: 'staging', CHECKOUT_QUOTES_REQUIRED: 'true', ...SIMULATED_QUOTING });
    expect(onlineOrderingOpen()).toBe(true);
    delete env.TAX_PROVIDER;
    expect(onlineOrderingOpen()).toBe(false);
  });

  it('does not wait for quoting where orders do not need a quote', () => {
    Object.assign(env, { APP_ENV: 'production', CHECKOUT_QUOTES_REQUIRED: 'false' });
    expect(onlineOrderingOpen()).toBe(true);
    Object.assign(env, { APP_ENV: 'staging' });
    delete env.CHECKOUT_QUOTES_REQUIRED;
    expect(onlineOrderingOpen()).toBe(true);
  });
});
