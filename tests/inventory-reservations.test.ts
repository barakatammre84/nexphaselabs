import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localD1 } from './helpers/local-d1';
const { env } = vi.hoisted(() => ({ env: {} as Record<string, unknown> }));
vi.mock('cloudflare:workers', () => ({ env }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
import { seedCommerceFixture, syntheticBuyer, syntheticOrder } from './helpers/commerce-fixture';
import { beginPayment, cancelOrderByCustomer, getOrderByNumber, markOrderPaid, settleBtcpayInvoice } from '@/lib/orders';
import { recordShipment, startFulfilment } from '@/lib/fulfilment';
import { reservationEligibility, stockUnits } from '@/lib/inventory-reservations';
import type { StaffPrincipal } from '@/lib/staff-auth';
let local: ReturnType<typeof localD1>;
const staff = { id: 's', name: 'Synthetic Ops', role: 'admin' } as StaffPrincipal;
beforeEach(async () => {
  local = localD1(); Object.assign(env, { DB: local.binding, APP_ENV: 'staging', OPEN_CHECKOUT_ENABLED: 'true', INVENTORY_RESERVATION_MINUTES: '30' });
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('No external calls')));
  await seedCommerceFixture();
});
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); local.sqlite.close(); for (const k of Object.keys(env)) delete env[k]; });
describe('inventory allocation transactions', () => {
  it('allows only one of two competing orders to reserve the same stock', async () => {
    const a = await syntheticBuyer(4); const b = await syntheticBuyer(4);
    const results = await Promise.all([a.submit(), b.submit()]);
    expect(results.filter(r => r.ok)).toHaveLength(1);
    expect(local.sqlite.prepare('SELECT count(*) n FROM inventory_reservations').get()!.n).toBe(1);
    expect(local.sqlite.prepare('SELECT quantity_remaining FROM lots').get()!.quantity_remaining).toBe('10 mg');
  });
  it('releases unpaid expired holds without a cron dependency; payment setup is then refused', async () => {
    const first = await syntheticOrder(4);
    local.sqlite.exec('UPDATE inventory_reservations SET expires_at = 0');
    expect((await beginPayment(first.detail, 'invoice', '', 'Test')).ok).toBe(false);
    expect((await (await syntheticBuyer(4)).submit()).ok).toBe(true);
  });
  it('releases cancelled orders atomically', async () => {
    const first = await syntheticOrder(4);
    expect((await cancelOrderByCustomer(first.detail, 'Synthetic', 'Changed mind')).ok).toBe(true);
    expect((await (await syntheticBuyer(4)).submit()).ok).toBe(true);
  });
  it('retains paid allocations beyond expiry and consumes exactly once on shipment', async () => {
    const first = await syntheticOrder(4);
    await beginPayment(first.detail, 'invoice', '', 'Test');
    let detail = (await getOrderByNumber(first.detail.order.orderNumber))!;
    expect(await markOrderPaid(detail, 'Test', 'SYNTHETIC')).toMatchObject({ ok: true, outcome: 'paid' });
    local.sqlite.exec('UPDATE inventory_reservations SET expires_at = 0');
    expect((await (await syntheticBuyer(4)).submit()).ok).toBe(false);
    detail = (await getOrderByNumber(detail.order.orderNumber))!;
    expect((await startFulfilment(detail, staff)).ok).toBe(true);
    detail = (await getOrderByNumber(detail.order.orderNumber))!;
    const input = { picks: { [detail.items[0].id]: 'l' }, carrier: 'Test', trackingNumber: 'SYNTHETIC', shippedOn: new Date().toISOString().slice(0, 10) };
    expect((await recordShipment(detail, input, staff)).ok).toBe(true);
    expect((await recordShipment(detail, input, staff)).ok).toBe(false);
    expect(local.sqlite.prepare('SELECT quantity_remaining FROM lots').get()!.quantity_remaining).toBe('2 mg');
  });
  it('records late received payment as a refund obligation, not authorization to ship', async () => {
    const first = await syntheticOrder(4); await beginPayment(first.detail, 'invoice', '', 'Test');
    local.sqlite.exec('UPDATE inventory_reservations SET expires_at = 0');
    const detail = (await getOrderByNumber(first.detail.order.orderNumber))!;
    expect(await markOrderPaid(detail, 'Test admin', 'MONEY-RECEIVED')).toMatchObject({ ok: true, outcome: 'cancelled' });
    expect((await getOrderByNumber(detail.order.orderNumber))!.order).toMatchObject({ status: 'cancelled', paymentStatus: 'refund_due', refundDueCents: 400 });
  });
  it('handles a matched webhook after reservation expiry without overselling', async () => {
    const first = await syntheticOrder(4);
    local.sqlite.exec("UPDATE orders SET status = 'awaiting_payment', payment_method = 'btcpay', payment_ref = 'Invoice123', payment_status = 'pending'; UPDATE inventory_reservations SET expires_at = 0");
    expect((await settleBtcpayInvoice(first.detail.order.orderNumber, 'Invoice123')).ok).toBe(true);
    expect((await getOrderByNumber(first.detail.order.orderNumber))!.order).toMatchObject({ status: 'cancelled', paymentStatus: 'refund_due' });
  });
  it('refuses stock/retest changes between review and acceptance, preserving the cart', async () => {
    const buyer = await syntheticBuyer(4);
    local.beforeNextBatch(() => local.sqlite.exec("UPDATE lots SET status = 'on_hold'"));
    expect((await buyer.submit()).ok).toBe(false);
    expect(local.sqlite.prepare('SELECT count(*) n FROM orders').get()!.n).toBe(0);
    expect(local.sqlite.prepare('SELECT count(*) n FROM cart_items').get()!.n).toBe(1);
  });
  it('rolls back allocations and the order when the durable notice cannot be queued', async () => {
    const buyer = await syntheticBuyer(4);
    local.sqlite.exec("CREATE TRIGGER fail_notice BEFORE INSERT ON notifications BEGIN SELECT RAISE(ABORT, 'test'); END");
    await expect(buyer.submit()).rejects.toThrow();
    expect(local.sqlite.prepare('SELECT count(*) n FROM inventory_reservations').get()!.n).toBe(0);
    expect(local.sqlite.prepare('SELECT count(*) n FROM orders').get()!.n).toBe(0);
  });
  it('refuses due retest and ambiguous count-tracked pack sizes', async () => {
    local.sqlite.exec('UPDATE lots SET retest_date = 1');
    expect((await (await syntheticBuyer()).submit()).ok).toBe(false);
    local.sqlite.exec("UPDATE lots SET retest_date = NULL, quantity_remaining = '10 vials'");
    expect((await (await syntheticBuyer()).submit()).ok).toBe(false);
  });
  it('invalidates payment eligibility if QC holds a reserved lot', async () => {
    const first = await syntheticOrder(); local.sqlite.exec("UPDATE lots SET status = 'on_hold'");
    expect((await reservationEligibility(first.detail.order.id)).valid).toBe(false);
  });
  it('normalizes mass units without rounding away a fractional container or mass', () => {
    expect(stockUnits('0.01 g')).toEqual({ units: 10000, unit: 'ug' });
    expect(stockUnits('0.5 vials')).toBeNull(); expect(stockUnits('0.001 ug')).toBeNull();
  });
});
