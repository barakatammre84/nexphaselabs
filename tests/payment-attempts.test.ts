import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localD1 } from './helpers/local-d1';
const { env } = vi.hoisted(() => ({ env: {} as Record<string, unknown> }));
vi.mock('cloudflare:workers', () => ({ env }));
import { getDb } from '@/db';
import { accounts, orders } from '@/db/schema';
import { beginClaimedPayment, attachPaymentAttempt, reconcilePaymentAttempt } from '@/lib/payment-attempts';
import {
  getOrderByNumber,
  cancelOrderByCustomer,
  paymentInstructionsFor,
} from '@/lib/orders';
import type { PaymentMethod } from '@/lib/payments';

let local: ReturnType<typeof localD1>;
const order = async () => (await getOrderByNumber('NX-260904-0001'))!.order;
let method: PaymentMethod;
beforeEach(async () => {
  local = localD1(); Object.assign(env, { DB: local.binding, APP_ENV: 'staging' });
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('No network permitted')));
  await getDb().insert(accounts).values({ id: 'a', email: 'test@example.invalid', name: 'Synthetic', passwordHash: 'disabled' });
  await getDb().insert(orders).values({ id: 'o', orderNumber: 'NX-260904-0001', accountId: 'a', status: 'submitted', subtotalCents: 500, totalCents: 500, priceTier: 'list', consigneeName: 'Synthetic', shipToLine1: 'Test', shipToCity: 'Test', shipToRegion: 'CA', shipToPostalCode: '00000', shipToCountry: 'US', submittedAt: new Date() });
  method = { id: 'btcpay', label: 'Synthetic', description: 'Synthetic', enabled: () => true,
    begin: vi.fn(async () => ({ method: 'btcpay' as const, title: 'Synthetic', lines: [], url: null, reference: 'Invoice123' })) };
});
afterEach(() => { vi.unstubAllGlobals(); local.sqlite.close(); for (const k of Object.keys(env)) delete env[k]; });
describe('durable payment setup', () => {
  it('claims once before simultaneous provider creation and returns the same stored reference', async () => {
    const snapshot = await order();
    const results = await Promise.all([beginClaimedPayment(snapshot, method, 'Test'), beginClaimedPayment(snapshot, method, 'Test')]);
    expect(results.some(r => r.ok)).toBe(true); expect(method.begin).toHaveBeenCalledTimes(1);
    expect((await order()).paymentRef).toBe('Invoice123');
    expect(local.sqlite.prepare('SELECT count(*) n FROM order_events').get()!.n).toBe(1);
    expect(await beginClaimedPayment(snapshot, method, 'Test')).toMatchObject({ ok: true });
    expect(method.begin).toHaveBeenCalledTimes(1);
  });
  it('records simulated payment language instead of calling it an invoice', async () => {
    const simulated: PaymentMethod = {
      id: 'invoice',
      label: 'Simulated payment',
      description: 'Synthetic',
      enabled: () => true,
      begin: vi.fn(async () => ({
        method: 'invoice' as const,
        title: 'Synthetic',
        lines: [],
        url: null,
        reference: 'TEST-NX-260904-0001',
      })),
    };
    expect((await beginClaimedPayment(await order(), simulated, 'Test')).ok).toBe(true);
    const event = local.sqlite
      .prepare('SELECT note FROM order_events ORDER BY created_at DESC LIMIT 1')
      .get() as { note: string };
    expect(event.note).toBe('Payment method: simulated payment.');
  });
  it('does not recreate an invoice after an uncertain response, even with another method', async () => {
    vi.mocked(method.begin).mockRejectedValue(new Error('Timed out after provider commit'));
    expect((await beginClaimedPayment(await order(), method, 'Test')).ok).toBe(false);
    expect((await beginClaimedPayment(await order(), method, 'Test')).ok).toBe(false);
    const different = { ...method, id: 'invoice' as const, begin: vi.fn() };
    expect((await beginClaimedPayment(await order(), different, 'Test')).ok).toBe(false);
    expect(method.begin).toHaveBeenCalledTimes(1); expect(different.begin).not.toHaveBeenCalled();
    expect(local.sqlite.prepare('SELECT state FROM payment_attempts').get()!.state).toBe('attention');
  });
  it('keeps the provider reference recoverable when order notification fails', async () => {
    local.sqlite.exec("CREATE TRIGGER fail_notice BEFORE INSERT ON notifications BEGIN SELECT RAISE(ABORT, 'test'); END");
    await expect(beginClaimedPayment(await order(), method, 'Test')).rejects.toThrow();
    expect((await order()).status).toBe('submitted');
    expect(local.sqlite.prepare('SELECT state FROM payment_attempts').get()!.state).toBe('ready');
    local.sqlite.exec('DROP TRIGGER fail_notice');
    expect((await beginClaimedPayment(await order(), method, 'Test')).ok).toBe(true);
    expect(method.begin).toHaveBeenCalledTimes(1);
  });
  it('attaches an invoice completed during cancellation without reopening the order', async () => {
    vi.mocked(method.begin).mockImplementation(async () => {
      await cancelOrderByCustomer((await getOrderByNumber('NX-260904-0001'))!, 'Synthetic', 'Changed mind');
      return { method: 'btcpay', title: 'Synthetic', lines: [], url: null, reference: 'Invoice123' };
    });
    expect((await beginClaimedPayment(await order(), method, 'Test')).ok).toBe(false);
    expect((await order()).status).toBe('cancelled'); expect((await order()).paymentRef).toBe('Invoice123');
    expect(await attachPaymentAttempt('o')).not.toBeNull();
    expect(local.sqlite.prepare('SELECT count(*) n FROM order_events').get()!.n).toBe(2);
  });
  it('does not call the provider for a stale amount or already-cancelled order', async () => {
    const stale = await order(); local.sqlite.exec('UPDATE orders SET total_cents = 600');
    expect((await beginClaimedPayment(stale, method, 'Test')).ok).toBe(false);
    local.sqlite.exec("UPDATE orders SET status = 'cancelled'");
    expect((await beginClaimedPayment(await order(), method, 'Test')).ok).toBe(false);
    expect(method.begin).not.toHaveBeenCalled();
  });
  it('rejects an unsafe total before writing a requesting attempt', async () => {
    const unsafe = {
      ...(await order()),
      totalCents: Number.MAX_SAFE_INTEGER + 1,
    };
    expect(
      await beginClaimedPayment(unsafe, method, 'Test'),
    ).toMatchObject({ ok: false });
    expect(method.begin).not.toHaveBeenCalled();
    expect(
      local.sqlite.prepare('SELECT count(*) n FROM payment_attempts').get()!.n,
    ).toBe(0);
  });
  it('shows do-not-pay support instructions for an unsafe stored total', async () => {
    const instructions = await paymentInstructionsFor({
      ...(await order()),
      paymentMethod: 'invoice',
      paymentRef: 'StoredReference',
      totalCents: Number.MAX_SAFE_INTEGER + 1,
    });
    expect(instructions).toMatchObject({
      title: expect.stringContaining('Contact us'),
      url: null,
      reference: 'StoredReference',
    });
    expect(instructions?.lines.join(' ')).toContain('Do not pay');
    expect(instructions?.lines.join(' ')).toContain('Contact support');
  });
  it('rebuilds stored BTCPay instructions with exact large dollar text', async () => {
    Object.assign(env, {
      APP_ENV: 'production',
      BTCPAY_HOST: 'https://payments.example.org',
      BTCPAY_STORE_ID: 'store',
      BTCPAY_API_KEY: 'key',
      BTCPAY_WEBHOOK_SECRET: 'secret',
    });
    const instructions = await paymentInstructionsFor({
      ...(await order()),
      paymentMethod: 'btcpay',
      paymentRef: 'Invoice123',
      totalCents: Number.MAX_SAFE_INTEGER,
      currency: 'USD',
    });
    expect(instructions).toMatchObject({
      method: 'btcpay',
      url: 'https://payments.example.org/i/Invoice123',
    });
    expect(instructions?.lines).toContain(
      'Amount: 90071992547409.91 USD',
    );
    expect(fetch).not.toHaveBeenCalled();
  });
  it('never permits live reconciliation in staging', async () => {
    vi.mocked(method.begin).mockRejectedValue(new Error('uncertain'));
    await beginClaimedPayment(await order(), method, 'Test');
    expect((await reconcilePaymentAttempt(await order(), 'Invoice123', 'Admin')).ok).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
});
