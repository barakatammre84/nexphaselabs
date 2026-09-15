import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emailRecipientAllowed, livePaymentsAllowed } from '@/lib/environment-safety';

const { env } = vi.hoisted(() => ({ env: {} as Record<string, string> }));
vi.mock('cloudflare:workers', () => ({ env }));
import { availablePaymentMethods, btcpayCheckoutUrl, invalidateBtcpayInvoice, paymentRailStatus } from '@/lib/payments';
import { sendEmail } from '@/lib/email';
import robots from '@/app/robots';
import type { Order } from '@/db/schema';

beforeEach(() => {
  for (const key of Object.keys(env)) delete env[key];
  vi.restoreAllMocks();
});

describe('environment safety', () => {
  it('permits live money movement only in explicit production', () => {
    expect(livePaymentsAllowed('production')).toBe(true);
    for (const value of ['staging', 'development', '', 'Production', undefined]) {
      expect(livePaymentsAllowed(value)).toBe(false);
    }
  });
  it('uses exact approved mailboxes, never domain or suffix matches', () => {
    expect(emailRecipientAllowed('production', 'customer@example.org', undefined)).toBe(true);
    expect(emailRecipientAllowed('staging', ' Test@Example.org ', 'other@example.org, test@example.org')).toBe(true);
    for (const recipient of ['other@example.org', 'test@example.org.evil.com', 'Test <test@example.org>', 'test@example.org\r\nBcc: other@example.org']) {
      expect(emailRecipientAllowed('staging', recipient, 'test@example.org')).toBe(false);
    }
    expect(emailRecipientAllowed(undefined, 'test@example.org', undefined)).toBe(false);
    expect(emailRecipientAllowed('staging', 'test@example.org', '*@example.org')).toBe(false);
  });
  it('blocks provider requests and checkout links even if live secrets are copied to staging', async () => {
    Object.assign(env, { APP_ENV: 'staging', BTCPAY_HOST: 'https://payments.example.org', BTCPAY_STORE_ID: 'store', BTCPAY_API_KEY: 'key', BTCPAY_WEBHOOK_SECRET: 'secret', PAYMENT_BANK_INSTRUCTIONS: 'LIVE BANK DETAILS' });
    const fetcher = vi.spyOn(globalThis, 'fetch');
    const methods = availablePaymentMethods();
    expect(methods.map((method) => method.id)).toEqual(['invoice']);
    const instructions = await methods[0].begin({ orderNumber: 'NX-260903-0001' } as Order);
    expect(instructions.title).toContain('do not send payment');
    expect(JSON.stringify(instructions)).not.toContain('LIVE BANK DETAILS');
    expect(btcpayCheckoutUrl('abcdef123')).toBeNull();
    await invalidateBtcpayInvoice('abcdef123');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('rehearses the Zelle claim workflow in staging without exposing the enrolled recipient', async () => {
    Object.assign(env, {
      APP_ENV: 'staging',
      ZELLE_MODE: 'manual',
      ZELLE_RECIPIENT_EMAIL: 'orders@nexphaselabs.net',
      ZELLE_RECIPIENT_NAME: '8486 Ventures LLC',
    });
    const fetcher = vi.spyOn(globalThis, 'fetch');
    const methods = availablePaymentMethods();
    expect(methods.map((method) => method.id)).toEqual(['zelle', 'invoice']);
    const instructions = await methods[0].begin({
      orderNumber: 'NX-260914-0001',
      totalCents: 12_540,
      currency: 'USD',
    } as Order);
    expect(instructions).toMatchObject({
      method: 'zelle',
      title: expect.stringContaining('do not send'),
      reference: 'TEST-NX-260914-0001',
      zelle: {
        recipientEmail: 'test-zelle@nexphaselabs.invalid',
        recipientName: 'TEST ONLY — NO PAYMENT',
        amountCents: 12_540,
        currency: 'USD',
        memo: 'TEST-NX-260914-0001',
        qrImagePath: null,
        simulated: true,
      },
    });
    const rendered = JSON.stringify(instructions);
    expect(rendered).not.toContain('orders@nexphaselabs.net');
    expect(rendered).not.toContain('8486 Ventures LLC');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('keeps configured production rails available', () => {
    Object.assign(env, { APP_ENV: 'production', PAYMENT_BANK_INSTRUCTIONS: 'configured' });
    expect(availablePaymentMethods().map((method) => method.id)).toEqual(['bank_transfer']);
  });
  it('refuses staging email without a mailbox allowlist, then sends labelled test email', async () => {
    Object.assign(env, { APP_ENV: 'staging', RESEND_API_KEY: 'test-key' });
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ id: 'mail-id' }));
    const message = { to: 'tester@example.org', subject: 'Verification', text: 'synthetic test' };
    expect((await sendEmail(message)).ok).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
    env.TEST_EMAIL_ALLOWLIST = message.to;
    expect((await sendEmail(message)).ok).toBe(true);
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body)).subject).toBe('[TEST] Verification');
  });
  it('disallows indexing staging but preserves production catalog indexing', () => {
    env.APP_ENV = 'staging';
    expect(robots().rules).toEqual([{ userAgent: '*', disallow: '/' }]);
    env.APP_ENV = 'production';
    // the full production rule set is asserted in tests/sitemap.test.ts
    const [rule] = robots().rules as { userAgent: string; allow: string; disallow: string[] }[];
    expect(rule.allow).toBe('/');
    expect(rule.disallow).toEqual(
      expect.arrayContaining(['/manage', '/staff', '/api', '/account']),
    );
  });
});

describe('which payment rails are live', () => {
  it('reports every rail off outside production, whatever is configured', () => {
    Object.assign(env, {
      APP_ENV: 'staging',
      PAYMENT_BANK_INSTRUCTIONS: 'LIVE BANK DETAILS',
      BTCPAY_HOST: 'https://pay.example.org',
      BTCPAY_STORE_ID: 'store',
      BTCPAY_API_KEY: 'key',
      BTCPAY_WEBHOOK_SECRET: 'secret',
    });
    const rails = paymentRailStatus();
    expect(rails.find((rail) => rail.id === 'bank_transfer')!.live).toBe(false);
    expect(rails.find((rail) => rail.id === 'btcpay')!.live).toBe(false);
    expect(rails.find((rail) => rail.id === 'bank_transfer')!.note).toContain('APP_ENV=staging');
  });

  it('names what each rail is still waiting for, without printing any of it', () => {
    Object.assign(env, { APP_ENV: 'production', BTCPAY_HOST: 'https://pay.example.org' });
    const rails = paymentRailStatus();
    expect(rails.find((rail) => rail.id === 'bank_transfer')!.missing).toEqual([
      'PAYMENT_BANK_INSTRUCTIONS',
    ]);
    expect(rails.find((rail) => rail.id === 'btcpay')!.missing).toEqual([
      'BTCPAY_STORE_ID',
      'BTCPAY_API_KEY',
      'BTCPAY_WEBHOOK_SECRET',
    ]);
    expect(JSON.stringify(rails)).not.toContain('pay.example.org');
  });

  it('turns a rail on when production has everything it needs', () => {
    Object.assign(env, {
      APP_ENV: 'production',
      PAYMENT_BANK_INSTRUCTIONS: 'Bank: Example\nAccount: 123',
      BTCPAY_HOST: 'https://pay.example.org',
      BTCPAY_STORE_ID: 'store',
      BTCPAY_API_KEY: 'key',
      BTCPAY_WEBHOOK_SECRET: 'secret',
    });
    const rails = paymentRailStatus();
    expect(rails.filter((rail) => rail.live).map((rail) => rail.id)).toEqual([
      'bank_transfer',
      'btcpay',
      'invoice',
    ]);
    expect(JSON.stringify(rails)).not.toContain('Account: 123');
  });

  it('always leaves the invoice fallback available, so an order is never stranded', () => {
    Object.assign(env, { APP_ENV: 'production' });
    const invoice = paymentRailStatus().find((rail) => rail.id === 'invoice')!;
    expect(invoice.live).toBe(true);
    expect(invoice.note).toContain('records the payment by hand');
  });
});
