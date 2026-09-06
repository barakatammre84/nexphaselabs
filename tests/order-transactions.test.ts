import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localD1 } from './helpers/local-d1';
const { env } = vi.hoisted(() => ({ env: {} as { DB?: D1Database } }));
vi.mock('cloudflare:workers', () => ({ env }));
vi.mock('next/headers', () => ({ cookies: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
import { getDb } from '@/db';
import { accounts, lots, orderItems, orders, organizations } from '@/db/schema';
import { getOrderByNumber, markOrderPaid, recordRefund } from '@/lib/orders';
import { recordReturn, recordShipment, startFulfilment } from '@/lib/fulfilment';
import type { StaffPrincipal } from '@/lib/staff-auth';

let local: ReturnType<typeof localD1>;
const staff = { id: 'staff_test', name: 'Synthetic Ops', role: 'admin' } as StaffPrincipal;
const detail = async () => (await getOrderByNumber('LOCAL-ORDER'))!;
const shipment = { picks: { line1: 'lot1' }, carrier: 'Test carrier', trackingNumber: 'TEST-ONLY', shippedOn: '2026-09-04' };
const returns = { packs: { line1: 1 }, receivedOn: '2026-09-05', condition: 'Sealed test container', note: 'Synthetic return' };
const count = (table: string) => local.sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get()!.n;
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-05T12:00:00Z'));
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('No external services permitted in this test')));
  local = localD1(); env.DB = local.binding;
  await getDb().insert(accounts).values({ id: 'customer', email: 'test@example.invalid', name: 'Synthetic customer', passwordHash: 'disabled', tier: 'institutional', status: 'active', verificationStatus: 'approved' });
  await getDb().insert(organizations).values({ id: 'org1', accountId: 'customer', legalName: 'Synthetic institution', website: 'https://example.invalid', emailDomain: 'example.invalid', organizationType: 'analytical_lab', addressLine1: 'Test', city: 'Test', region: 'CA', postalCode: '00000', country: 'US', researchContext: 'Synthetic', receivingParty: 'Synthetic', verificationStatus: 'approved', submittedAt: new Date('2026-09-01') });
  await getDb().insert(lots).values({ id: 'lot1', lotNumber: 'LOCAL-LOT', productCode: 'LOCAL-PRODUCT', productName: 'Synthetic material', casNumber: '50-00-0', status: 'released', quantityReceived: '10 mg', quantityRemaining: '10 mg', receivedAt: new Date('2026-09-01') });
  await getDb().insert(orders).values({ id: 'order1', orderNumber: 'LOCAL-ORDER', accountId: 'customer', status: 'awaiting_payment', paymentStatus: 'pending', subtotalCents: 200, totalCents: 200, priceTier: 'institutional', consigneeName: 'Synthetic', shipToLine1: 'Test', shipToCity: 'Test', shipToRegion: 'CA', shipToPostalCode: '00000', shipToCountry: 'US', submittedAt: new Date('2026-09-01') });
  await getDb().insert(orderItems).values({ id: 'line1', orderId: 'order1', productId: 'product1', productCode: 'LOCAL-PRODUCT', productName: 'Synthetic', variantId: 'variant1', sku: 'LOCAL-SKU', packSize: '2 mg', presentation: 'powder', quantity: 2, unitPriceCents: 100, lineTotalCents: 200 });
  await getDb().update(orders).set({ organizationId: 'org1' });
});
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); vi.useRealTimers(); local.sqlite.close(); delete env.DB; });
async function readyToShip() {
  expect((await markOrderPaid(await detail(), 'Test admin', 'SYNTHETIC-PAYMENT', 'test@example.invalid')).ok).toBe(true);
  expect((await startFulfilment(await detail(), staff)).ok).toBe(true);
}

describe('order, shipment, return and refund transactions', () => {
  it('completes payment → pick → ship → partial return → refund with conserved stock and queued notices', async () => {
    await readyToShip();
    expect(await recordShipment(await detail(), shipment, staff)).toEqual({ ok: true });
    expect(local.sqlite.prepare('SELECT quantity_remaining FROM lots').get()!.quantity_remaining).toBe('6 mg');
    expect((await detail()).items[0].lotId).toBe('lot1');
    expect(await recordReturn(await detail(), returns, staff)).toEqual({ ok: true });
    expect(local.sqlite.prepare('SELECT quantity_remaining FROM lots').get()!.quantity_remaining).toBe('6 mg');
    expect((await detail()).order.refundDueCents).toBe(100);
    expect(await recordRefund(await detail(), 100, 'SYNTHETIC-REFUND', 'Test admin', 'test@example.invalid')).toEqual({ ok: true });
    expect((await detail()).order.paymentStatus).toBe('refunded');
    expect(count('lot_movements')).toBe(2);
    expect(count('order_events')).toBe(5);
    expect(count('notifications')).toBe(5);
  });
  it('refuses a shipment if stock changes between review and commit', async () => {
    await readyToShip();
    local.beforeNextBatch(() => local.sqlite.exec("UPDATE lots SET quantity_remaining = '8 mg'"));
    expect((await recordShipment(await detail(), shipment, staff)).ok).toBe(false);
    expect(local.sqlite.prepare('SELECT quantity_remaining FROM lots').get()!.quantity_remaining).toBe('8 mg');
    expect((await detail()).order.status).toBe('fulfilling');
    expect(count('lot_movements')).toBe(0);
    expect(count('notifications')).toBe(2);
  });
  it('refuses shipment if QC holds the lot before commit', async () => {
    await readyToShip();
    local.beforeNextBatch(() => local.sqlite.exec("UPDATE lots SET status = 'on_hold'"));
    expect((await recordShipment(await detail(), shipment, staff)).ok).toBe(false);
    expect(count('lot_movements')).toBe(0);
  });
  it.each(["UPDATE accounts SET status = 'suspended'", "UPDATE organizations SET verification_status = 'revoked'"])(
    'refuses shipment when approval is revoked during picking: %s', async (change) => {
      await readyToShip();
      local.beforeNextBatch(() => local.sqlite.exec(change));
      expect((await recordShipment(await detail(), shipment, staff)).ok).toBe(false);
      expect(count('lot_movements')).toBe(0);
      expect(local.sqlite.prepare('SELECT quantity_remaining FROM lots').get()!.quantity_remaining).toBe('10 mg');
    });
  it('explains why an already-suspended account cannot be shipped', async () => {
    await readyToShip(); local.sqlite.exec("UPDATE accounts SET status = 'suspended'");
    expect(await recordShipment(await detail(), shipment, staff)).toMatchObject({ ok: false, error: expect.stringContaining('no longer approved') });
  });
  it('rolls back stock, line assignment and shipment when the notification insert fails', async () => {
    await readyToShip();
    local.sqlite.exec("CREATE TRIGGER reject_notice BEFORE INSERT ON notifications BEGIN SELECT RAISE(ABORT, 'test failure'); END;");
    await expect(recordShipment(await detail(), shipment, staff)).rejects.toThrow();
    expect(local.sqlite.prepare('SELECT quantity_remaining FROM lots').get()!.quantity_remaining).toBe('10 mg');
    expect((await detail()).order.status).toBe('fulfilling');
    expect((await detail()).items[0].lotId).toBeNull();
    expect(count('lot_movements')).toBe(0);
  });
  it('does not double-decrement stock for a repeated shipment submission', async () => {
    await readyToShip(); const stale = await detail();
    expect((await recordShipment(stale, shipment, staff)).ok).toBe(true);
    expect((await recordShipment(stale, shipment, staff)).ok).toBe(false);
    expect(local.sqlite.prepare('SELECT quantity_remaining FROM lots').get()!.quantity_remaining).toBe('6 mg');
    expect(count('lot_movements')).toBe(1);
  });
  it('does not double-receive a return or record two simultaneous refunds', async () => {
    await readyToShip(); await recordShipment(await detail(), shipment, staff);
    const beforeReturn = await detail();
    expect((await recordReturn(beforeReturn, returns, staff)).ok).toBe(true);
    expect((await recordReturn(beforeReturn, returns, staff)).ok).toBe(false);
    const stale = await detail();
    const results = await Promise.all([recordRefund(stale, 100, 'REF-A', 'Admin A', ''), recordRefund(stale, 100, 'REF-B', 'Admin B', '')]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect((await detail()).order.refundCents).toBe(100);
    expect(count('notifications')).toBe(5);
  });
  it('rejects a shipment date tomorrow and one before the order existed', async () => {
    await readyToShip();
    expect((await recordShipment(await detail(), { ...shipment, shippedOn: '2026-09-06' }, staff)).ok).toBe(false);
    expect((await recordShipment(await detail(), { ...shipment, shippedOn: '2026-08-31' }, staff)).ok).toBe(false);
  });
  it('rejects a return dated before the shipment or tomorrow', async () => {
    await readyToShip(); await recordShipment(await detail(), shipment, staff);
    expect((await recordReturn(await detail(), { ...returns, receivedOn: '2026-09-03' }, staff)).ok).toBe(false);
    expect((await recordReturn(await detail(), { ...returns, receivedOn: '2026-09-06' }, staff)).ok).toBe(false);
  });
  it.each([-1, 0, 0.5, Number.NaN, Number.POSITIVE_INFINITY])('rejects invalid refund cents at the transaction boundary: %s', async (amount) => {
    local.sqlite.exec("UPDATE orders SET status = 'cancelled', payment_status = 'refund_due', refund_due_cents = 200");
    expect((await recordRefund(await detail(), amount, 'TEST-REF', 'Test admin', '')).ok).toBe(false);
    expect(count('order_events')).toBe(0);
  });
  it('requires a refund reference even for direct service calls', async () => {
    local.sqlite.exec("UPDATE orders SET status = 'cancelled', payment_status = 'refund_due', refund_due_cents = 200");
    expect((await recordRefund(await detail(), 100, ' ', 'Test admin', '')).ok).toBe(false);
  });
  it('ships 20 distinct lots without exceeding D1 parameter limits', async () => {
    const picks: Record<string, string> = { line1: 'lot1' };
    for (let i = 2; i <= 20; i++) {
      await getDb().insert(lots).values({ id: `lot${i}`, lotNumber: `LOCAL-LOT-${i}`, productCode: 'LOCAL-PRODUCT', productName: 'Synthetic', casNumber: '50-00-0', status: 'released', quantityReceived: '10 mg', quantityRemaining: '10 mg', receivedAt: new Date('2026-09-01') });
      await getDb().insert(orderItems).values({ id: `line${i}`, orderId: 'order1', productId: 'product1', productCode: 'LOCAL-PRODUCT', productName: 'Synthetic', variantId: `variant${i}`, sku: `LOCAL-SKU-${i}`, packSize: '2 mg', presentation: 'powder', quantity: 2, unitPriceCents: 100, lineTotalCents: 200 });
      picks[`line${i}`] = `lot${i}`;
    }
    await getDb().update(orders).set({ subtotalCents: 4000, totalCents: 4000 });
    await readyToShip();
    expect(await recordShipment(await detail(), { ...shipment, picks }, staff)).toEqual({ ok: true });
    expect(count('lot_movements')).toBe(20);
    expect(local.sqlite.prepare("SELECT count(*) AS n FROM lots WHERE quantity_remaining = '6 mg'").get()!.n).toBe(20);
  });
});
