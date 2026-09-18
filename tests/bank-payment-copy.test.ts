import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Order } from '@/db/schema';

const { env } = vi.hoisted(() => ({ env: {} as Record<string, unknown> }));
vi.mock('cloudflare:workers', () => ({ env }));

import { availablePaymentMethods } from '@/lib/payments';
import { zelleInboxEnabled } from '@/lib/zelle-config';
import { ZellePaymentPanel } from '@/components/site/zelle-payment-panel';

const order = {
  orderNumber: 'NX-260918-0001',
  totalCents: 12540,
  currency: 'USD',
} as Order;

beforeEach(() => {
  Object.assign(env, {
    APP_ENV: 'production',
    PAYMENT_BANK_INSTRUCTIONS: 'Synthetic bank instructions; do not send money.',
    ZELLE_MODE: 'manual',
    ZELLE_RECIPIENT_EMAIL: 'recipient@example.invalid',
    ZELLE_RECIPIENT_NAME: 'Synthetic merchant',
  });
  // Instruction generation must not contact a bank, provider, or mailbox.
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network request'); }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const key of Object.keys(env)) delete env[key];
});

describe('ACH and Zelle customer instructions', () => {
  it('offers only the configured bank methods, without a pending card option', () => {
    expect(availablePaymentMethods().map(({ id }) => id)).toEqual(['zelle', 'bank_transfer']);
  });

  it('clearly describes buyer-initiated ACH with no organization-only restriction', async () => {
    const bank = availablePaymentMethods().find(({ id }) => id === 'bank_transfer')!;
    expect(bank.label).toContain('ACH');
    expect(bank.description).not.toMatch(/organi[sz]ation/i);
    const instructions = await bank.begin(order);
    expect(instructions.lines).toContain('Amount: 125.40 USD');
    expect(instructions.lines).toContain(`Reference: ${order.orderNumber}`);
    expect(instructions.lines).toContain(env.PAYMENT_BANK_INSTRUCTIONS);
    expect(instructions.lines.join(' ')).toContain('does not debit your account');
    expect(instructions.lines.join(' ')).toContain('once the transfer has cleared');
    expect(instructions.lines.join(' ')).toContain('Do not send a second transfer');
    expect(instructions.url).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(['manual', 'shadow', 'supervised', 'automatic'])(
    'does not promise a five-minute receipt check in %s mode without an inbox',
    async (mode) => {
      env.ZELLE_MODE = mode;
      expect(zelleInboxEnabled()).toBe(false);
      const zelle = availablePaymentMethods().find(({ id }) => id === 'zelle')!;
      const instructions = await zelle.begin(order);
      expect(instructions.lines.join(' ')).toContain('does not confirm receipt');
      const html = renderToStaticMarkup(createElement(ZellePaymentPanel, {
        details: instructions.zelle!,
        claimAction: '/api/orders/synthetic/zelle-claim',
        claimedAt: '2026-09-18T00:00:00.000Z',
      }));
      expect(html).toContain('Payment reported sent');
      expect(html).toContain('remains unpaid until we confirm receipt');
      expect(html).toContain('may require manual review');
      expect(html).toContain('Do not send the payment again');
      expect(html).not.toMatch(/five minutes|We are checking Chase/);
      expect(html).toContain('does not mark the order paid');
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it('keeps the simulated Zelle flow explicitly separate from sending money', async () => {
    env.APP_ENV = 'staging';
    const zelle = availablePaymentMethods().find(({ id }) => id === 'zelle')!;
    const instructions = await zelle.begin(order);
    const html = renderToStaticMarkup(createElement(ZellePaymentPanel, {
      details: instructions.zelle!,
      claimAction: '/api/orders/synthetic/zelle-claim',
      claimedAt: null,
    }));
    expect(html).toContain('Do not open your bank or send money');
    expect(html).toContain('Report simulated Zelle payment');
    expect(html).not.toContain('recipient@example.invalid');
    expect(fetch).not.toHaveBeenCalled();
  });
});