import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({ APP_ENV: 'test', OPEN_CHECKOUT_ENABLED: 'true', ACCOUNT_REQUIRED: 'true' }) as Record<string, unknown>);
vi.mock('cloudflare:workers', () => ({ env }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock('next/navigation', () => ({ redirect: vi.fn(), notFound: vi.fn() }));

const account = {
  id: 'acct_a',
  email: 'a@example.invalid',
  name: 'Synthetic Researcher',
  status: 'active',
  verificationStatus: 'none',
  termsVersion: '2026-09',
  ruoVersion: '2026-09',
  tier: 'researcher' as const,
  sessionId: 'sess_a',
};
vi.mock('@/lib/account-auth', () => ({ requireAccount: async () => account }));
vi.mock('@/lib/account-rules', () => ({ acknowledgementsCurrent: () => true }));
vi.mock('@/lib/account-details', () => ({ pendingEmailFor: async () => 'next@example.invalid' }));
vi.mock('@/lib/account-addresses', () => ({ listAddresses: async () => [] }));
vi.mock('@/lib/organizations', () => ({ getOrganizationForAccount: async () => null }));
vi.mock('@/lib/catalog-data', () => ({ loadCatalog: async (load: () => Promise<unknown>) => ({ data: await load(), unavailable: false }) }));
vi.mock('@/lib/orders', () => ({
  listOrdersForAccount: async () => [
    { id: 'o1', orderNumber: 'NX-00001', status: 'awaiting_payment', totalCents: 12345 },
    { id: 'o2', orderNumber: 'NX-00002', status: 'delivered', totalCents: 500 },
  ],
}));
vi.mock('@/lib/payments', () => ({
  availablePaymentMethods: () => [{ id: 'zelle', label: 'Zelle', description: 'Pay from your bank app.' }],
}));

import AccountPage from '@/app/account/page';
import AccountAddressesPage from '@/app/account/addresses/page';
import AccountDetailsPage from '@/app/account/details/page';
import AccountPaymentPage from '@/app/account/payment/page';

const render = async (element: Promise<React.ReactElement>) => renderToStaticMarkup(await element);

describe('account dashboard pages (owner, 16 Sep 2026)', () => {
  it('the dashboard is a hub with a card for every managed thing', async () => {
    const html = await render(AccountPage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain('Manage your account');
    for (const href of ['/account/orders', '/account/addresses', '/account/details', '/account/payment', '/contact']) expect(html).toContain(`href="${href}"`);
    expect(html).toContain('NX-00001');
    // The address book itself lives on its own page now; the hub only links to it.
    expect(html).not.toContain('Add your first address');
  });

  it('addresses have their own page', async () => {
    const html = await render(AccountAddressesPage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain('Delivery addresses');
    expect(html).toContain('Add your first address');
    expect(html).toContain('href="/account/addresses"');
  });

  it('account details show the three forms and a parked email address', async () => {
    const html = await render(AccountDetailsPage({ searchParams: Promise.resolve({ saved: 'name' }) }));
    expect(html).toContain('a@example.invalid');
    expect(html).toContain('next@example.invalid');
    expect(html).toContain('Your name has been updated.');
    for (const intent of ['name', 'email', 'password']) expect(html).toContain(`value="${intent}"`);
    expect(html).toContain('/account/forgot');
  });

  it('payment explains the methods and lists only orders still waiting', async () => {
    const html = await render(AccountPaymentPage());
    expect(html).toContain('Zelle');
    expect(html).toContain('NX-00001');
    expect(html).not.toContain('NX-00002');
    expect(html).toContain('Never send money');
  });
});
