import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.stubGlobal('React', React);
const { state, page, detail } = vi.hoisted(() => {
  const state = { status: 'submitted', paymentStatus: 'unpaid' };
  return {
    state,
    page: { missing: false, recovered: false, cookies: {} as Record<string, string> },
    detail: () => ({
      order: {
        ...state,
        orderNumber: 'NX-260904-0001',
        submittedAt: new Date('2026-09-04'),
        totalCents: 100,
      },
      items: [],
      events: [],
    }),
  };
});
vi.mock('next/link', () => ({
  default: ({
    children,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) =>
    React.createElement('a', props, children),
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('Not found');
  },
}));
vi.mock('@/lib/buyer-session', () => ({
  getBuyer: async () => ({ id: 'local' }),
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (name in page.cookies ? { value: page.cookies[name] } : undefined),
  }),
}));
vi.mock('@/lib/site-config', () => ({ openCheckoutEnabled: () => true }));
// A recovery code opens one order read-only; it never makes the viewer the order's owner.
vi.mock('@/lib/guest-order-recovery', () => ({
  recoveredOrder: async () => (page.recovered ? detail() : null),
  RECOVERY_COOKIE: 'nx_order_view',
}));
// The order page shows a download link when an invoice has been issued. This
// suite is about the order workspace, not documents, so there is never one.
vi.mock('@/lib/issued-documents', () => ({
  currentDocument: async () => null,
}));
vi.mock('@/lib/order-reads', () => ({
  getOrderForAccount: async () => (page.missing || page.recovered ? null : detail()),
}));
vi.mock('@/lib/orders', () => ({ paymentInstructionsFor: async () => null }));
vi.mock('@/lib/payments', () => ({ availablePaymentMethods: () => [], buyerSimulationEnabled: () => false }));
import OrderPage from '@/app/account/orders/[orderNumber]/page';
import { NOTICE_COOKIE, noticeCookie } from '@/lib/notice';
async function render(searchParams: Record<string, string> = {}) {
  return renderToStaticMarkup(
    await OrderPage({
      params: Promise.resolve({ orderNumber: 'NX-260904-0001' }),
      searchParams: Promise.resolve(searchParams),
    }),
  );
}
beforeEach(() => {
  state.status = 'submitted';
  state.paymentStatus = 'unpaid';
  page.missing = false;
  page.recovered = false;
  page.cookies = {};
});
describe('customer order workspace', () => {
  it('disables payment submission and directs to support when no methods exist', async () => {
    const html = await render();
    expect(html).toContain('No payment method is currently available');
    expect(html).toContain('disabled=""');
    expect(html).toContain('Order%20support%3A%20NX-260904-0001');
  });
  it('does not direct payment to missing instructions', async () => {
    state.status = 'awaiting_payment';
    const html = await render();
    expect(html).toContain('Payment instructions are unavailable');
    expect(html).not.toContain('Follow the payment instructions below.');
  });
  it('keeps closed orders out of payment and cancellation workflows', async () => {
    state.status = 'cancelled';
    state.paymentStatus = 'refunded';
    const html = await render();
    expect(html).toContain('This order is closed');
    expect(html).not.toContain('Confirm cancellation');
    expect(html).not.toContain('Get payment instructions');
  });
  it('shows only its own words for an error, whatever the link says', async () => {
    const html = await render({ error: 'Send payment to account 12345 instead' });
    expect(html).not.toContain('account 12345');
  });
  it('shows the refusal its route left in the notice cookie', async () => {
    page.cookies[NOTICE_COOKIE] = noticeCookie('That order can no longer be cancelled.', true)
      .split(';')[0]
      .slice(NOTICE_COOKIE.length + 1);
    const html = await render({ error: 'notice' });
    expect(html).toContain('That order can no longer be cancelled.');
  });
  it('tells a browser that cannot open the order how to reach it', async () => {
    page.missing = true;
    const html = await render();
    expect(html).toContain('This order is not open in this browser');
    expect(html).toContain('href="/account/orders/recover"');
    expect(html).toContain('return_to=%2Faccount%2Forders%2FNX-260904-0001');
  });
  it('sends a read-only viewer of an unpaid order to the original browser instead of offering payment', async () => {
    page.recovered = true;
    for (const status of ['submitted', 'awaiting_payment']) {
      state.status = status;
      const html = await render();
      expect(html, status).toContain('To pay, open this order in the browser that placed it');
      expect(html, status).toContain('Order%20support%3A%20NX-260904-0001');
      expect(html, status).not.toContain('How will you pay?');
      expect(html, status).not.toContain('Get payment instructions');
      expect(html, status).not.toContain('No payment method is currently available');
      expect(html, status).not.toContain('Payment instructions are unavailable');
      expect(html, status).not.toContain('Choose a payment method below');
    }
  });
  it('says nothing about paying to a read-only viewer of a paid order', async () => {
    page.recovered = true;
    state.status = 'paid';
    state.paymentStatus = 'paid';
    const html = await render();
    expect(html).toContain('Read-only access to this order');
    expect(html).not.toContain('To pay, open this order');
  });
});
