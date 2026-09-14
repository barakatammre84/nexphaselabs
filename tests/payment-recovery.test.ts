import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localD1 } from './helpers/local-d1';
const { env } = vi.hoisted(() => ({ env: {} as { DB?: D1Database; APP_ENV?: string; BTCPAY_STORE_ID?: string; BTCPAY_WEBHOOK_SECRET?: string } }));
vi.mock('cloudflare:workers', () => ({ env }));
import { getDb } from '@/db';
import { accounts, orders } from '@/db/schema';
import { paymentAttempts } from '@/db/commerce-schema';
import { cancelOrderByCustomer, getOrderByNumber, recordRefund, settleBtcpayInvoice } from '@/lib/orders';
import { POST } from '@/app/api/payments/btcpay/webhook/route';

let local: ReturnType<typeof localD1>;
const number = 'NX-260904-0001';
const invoice = 'TestInvoice123';
const detail = async () => (await getOrderByNumber(number))!;
const count = (table: string) => local.sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get()!.n;
async function request(body: Record<string, unknown>, valid = true) {
  const raw = JSON.stringify(body);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(valid ? 'synthetic-secret' : 'wrong-secret'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = [...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw)))].map((b) => b.toString(16).padStart(2, '0')).join('');
  return POST(new Request('https://example.invalid/api/payments/btcpay/webhook', { method: 'POST', body: raw, headers: { 'BTCPay-Sig': `sha256=${signature}` } }));
}
const event = () => ({ type: 'InvoiceSettled', invoiceId: invoice, storeId: 'synthetic-store', metadata: { orderId: number } });
beforeEach(async () => {
  local = localD1(); Object.assign(env, { DB: local.binding, APP_ENV: 'production', BTCPAY_STORE_ID: 'synthetic-store', BTCPAY_WEBHOOK_SECRET: 'synthetic-secret' });
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('No provider calls allowed')));
  await getDb().insert(accounts).values({ id: 'customer', email: 'synthetic@example.invalid', name: 'Synthetic customer', passwordHash: 'disabled' });
  await getDb().insert(orders).values({ id: 'order1', orderNumber: number, accountId: 'customer', status: 'awaiting_payment', paymentStatus: 'pending', paymentMethod: 'btcpay', paymentRef: invoice, subtotalCents: 200, totalCents: 200, priceTier: 'institutional', consigneeName: 'Synthetic', shipToLine1: 'Test', shipToCity: 'Test', shipToRegion: 'CA', shipToPostalCode: '00000', shipToCountry: 'US', submittedAt: new Date() });
});
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); local.sqlite.close();
  for (const key of Object.keys(env)) delete env[key as keyof typeof env];
});

describe('payment recovery with no external money movement', () => {
  it('records a signed settlement once, including redelivery', async () => {
    expect((await request(event())).status).toBe(200);
    expect((await request(event())).status).toBe(200);
    expect((await detail()).order.paymentStatus).toBe('paid');
    expect(count('order_events')).toBe(1); expect(count('notifications')).toBe(1);
  });
  it('records money arriving after cancellation as a refund obligation without reopening the order', async () => {
    expect((await cancelOrderByCustomer(await detail(), 'Synthetic customer', 'No longer required')).ok).toBe(true);
    expect((await settleBtcpayInvoice(number, invoice)).ok).toBe(true);
    const order = (await detail()).order;
    expect(order.status).toBe('cancelled'); expect(order.paymentStatus).toBe('refund_due');
    expect(order.refundDueCents).toBe(200); expect(order.paidAt).not.toBeNull();
    expect((await settleBtcpayInvoice(number, invoice)).ok).toBe(true);
    expect(count('order_events')).toBe(2); expect(count('notifications')).toBe(2);
    expect((await recordRefund(await detail(), 200, 'SYNTHETIC-REFUND', 'Synthetic admin')).ok).toBe(true);
    expect((await settleBtcpayInvoice(number, invoice)).ok).toBe(true);
    expect((await detail()).order.paymentStatus).toBe('refunded'); expect(count('order_events')).toBe(3);
  });
  it('recovers when cancellation lands between settlement review and commit', async () => {
    local.beforeNextBatch(() => local.sqlite.exec("UPDATE orders SET status = 'cancelled', payment_status = 'failed', last_transition_id = 'cancelled-first'"));
    expect((await settleBtcpayInvoice(number, invoice)).ok).toBe(true);
    expect((await detail()).order.status).toBe('cancelled'); expect((await detail()).order.paymentStatus).toBe('refund_due');
    expect(count('order_events')).toBe(1);
  });
  it('does not allow a stale cancellation to discard a payment', async () => {
    const stale = await detail(); await settleBtcpayInvoice(number, invoice);
    expect((await cancelOrderByCustomer(stale, 'Synthetic customer', 'Stale form')).ok).toBe(false);
    expect((await detail()).order.paymentStatus).toBe('paid');
  });
  it('permits only one settlement winner under simultaneous delivery', async () => {
    const results = await Promise.all([settleBtcpayInvoice(number, invoice), settleBtcpayInvoice(number, invoice)]);
    expect(results.every((r) => r.ok)).toBe(true); expect(count('order_events')).toBe(1);
  });
  it('never settles a replacement invoice using an older signed event', async () => {
    local.beforeNextBatch(() => local.sqlite.exec("UPDATE orders SET payment_ref = 'Replacement123'"));
    expect((await settleBtcpayInvoice(number, invoice)).ok).toBe(false);
    expect((await detail()).order.paymentStatus).toBe('pending'); expect(count('order_events')).toBe(0);
  });
  it('rolls back settlement if its durable notification cannot be queued, and requests retry', async () => {
    local.sqlite.exec("CREATE TRIGGER fail_notice BEFORE INSERT ON notifications BEGIN SELECT RAISE(ABORT, 'test failure'); END");
    expect((await request(event())).status).toBe(500);
    expect((await detail()).order.paymentStatus).toBe('pending'); expect(count('order_events')).toBe(0);
  });
  it('requests retry rather than acknowledging an unrecorded settlement', async () => {
    local.sqlite.exec("UPDATE orders SET status = 'submitted'");
    expect((await request(event())).status).toBe(503); expect(count('order_events')).toBe(0);
  });
  it('requests webhook redelivery while an uncertain invoice is waiting for reconciliation', async () => {
    await getDb().insert(paymentAttempts).values({ orderId: 'order1', id: 'pat1', method: 'btcpay', state: 'attention', amountCents: 200, currency: 'USD', actor: 'Synthetic' });
    local.sqlite.exec('UPDATE orders SET payment_method = NULL, payment_ref = NULL, status = \'submitted\'');
    const result = await settleBtcpayInvoice(number, invoice);
    expect(result).toMatchObject({ ok: false, retryable: true });
  });
  it('attaches a ready durable attempt before recording its signed settlement', async () => {
    await getDb().insert(paymentAttempts).values({ orderId: 'order1', id: 'pat1', method: 'btcpay', state: 'ready', reference: invoice, amountCents: 200, currency: 'USD', actor: 'Synthetic' });
    local.sqlite.exec('UPDATE orders SET payment_method = NULL, payment_ref = NULL, status = \'submitted\'');
    expect((await settleBtcpayInvoice(number, invoice)).ok).toBe(true);
    expect((await detail()).order).toMatchObject({ paymentRef: invoice, paymentStatus: 'paid', status: 'paid' });
  });
  it('rejects invalid signatures and other stores', async () => {
    expect((await request(event(), false)).status).toBe(401);
    expect((await request({ ...event(), storeId: 'different-store' })).status).toBe(400);
    expect(count('order_events')).toBe(0);
  });
  it('keeps the webhook disabled in staging even with provider settings present', async () => {
    env.APP_ENV = 'staging'; expect((await request(event())).status).toBe(404); expect(count('order_events')).toBe(0);
  });
  it('requires a fresh refund review if the amount owed changes before recording', async () => {
    local.sqlite.exec("UPDATE orders SET status = 'cancelled', payment_status = 'refund_due', refund_due_cents = 200");
    local.beforeNextBatch(() => local.sqlite.exec('UPDATE orders SET refund_due_cents = 100'));
    expect((await recordRefund(await detail(), 200, 'SYNTHETIC-REFUND', 'Synthetic admin')).ok).toBe(false);
    expect(count('order_events')).toBe(0); expect((await detail()).order.refundCents ?? 0).toBe(0);
  });
});
