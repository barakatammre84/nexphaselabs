import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.stubGlobal('React', React);
const { state } = vi.hoisted(() => ({
  state: { status: 'submitted', paymentStatus: 'unpaid' },
}));
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
vi.mock('@/lib/account-auth', () => ({
  requireAccount: async () => ({ id: 'local' }),
}));
vi.mock('@/lib/orders', () => ({
  getOrderForAccount: async () => ({
    order: {
      ...state,
      orderNumber: 'NX-260904-0001',
      submittedAt: new Date('2026-09-04'),
      totalCents: 100,
    },
    items: [],
    events: [],
  }),
  paymentInstructionsFor: async () => null,
}));
vi.mock('@/lib/payments', () => ({ availablePaymentMethods: () => [] }));
import OrderPage from '@/app/account/orders/[orderNumber]/page';
async function render() {
  return renderToStaticMarkup(
    await OrderPage({
      params: Promise.resolve({ orderNumber: 'NX-260904-0001' }),
      searchParams: Promise.resolve({}),
    }),
  );
}
beforeEach(() => {
  state.status = 'submitted';
  state.paymentStatus = 'unpaid';
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
});
