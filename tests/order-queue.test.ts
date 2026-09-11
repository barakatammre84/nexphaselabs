import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localD1 } from './helpers/local-d1';
const { env } = vi.hoisted(() => ({ env: {} as { DB?: D1Database } }));
vi.mock('cloudflare:workers', () => ({ env }));
import { getDb } from '@/db';
import { accounts, orders } from '@/db/schema';
import { listOrderQueue, queuePage } from '@/lib/order-queue';
let local: ReturnType<typeof localD1>;
beforeEach(async () => {
  local = localD1();
  env.DB = local.binding;
  await getDb()
    .insert(accounts)
    .values({
      id: 'customer',
      email: 'synthetic@example.invalid',
      name: 'Synthetic',
      passwordHash: 'disabled',
    });
  for (let i = 0; i < 55; i++)
    await getDb()
      .insert(orders)
      .values({
        id: `order${String(i).padStart(3, '0')}`,
        orderNumber: `NX-260904-${String(i).padStart(4, '0')}`,
        accountId: 'customer',
        status: i === 0 ? 'paid' : 'shipped',
        paymentStatus: i === 1 ? 'refund_due' : 'paid',
        subtotalCents: 100,
        shippingCents: 0,
        totalCents: 100,
        priceTier: 'institutional',
        consigneeName: 'Synthetic',
        consigneeInstitution: i === 0 ? 'Oldest Institute' : 'Other lab',
        shipToLine1: 'Test',
        shipToCity: 'Test',
        shipToRegion: 'CA',
        shipToPostalCode: '00000',
        shipToCountry: 'US',
        submittedAt: new Date(1700000000000 + i * 1000),
      });
});
afterEach(() => {
  local.sqlite.close();
  delete env.DB;
});
describe('order queue database queries', () => {
  it('filters before pagination to find old actionable orders', async () => {
    const result = await listOrderQueue('paid', '');
    expect(result.rows.map((o) => o.id)).toEqual(['order000']);
  });
  it('paginates without overlap', async () => {
    const first = await listOrderQueue('all', '', 1);
    const second = await listOrderQueue('all', '', 2);
    expect(first.rows).toHaveLength(50);
    expect(first.hasNext).toBe(true);
    expect(second.rows).toHaveLength(5);
    expect(second.hasNext).toBe(false);
    expect(new Set([...first.rows, ...second.rows].map((o) => o.id)).size).toBe(
      55,
    );
  });
  it('searches organization names case insensitively', async () =>
    expect((await listOrderQueue('all', 'oldest institute')).rows).toHaveLength(
      1,
    ));
  it('searches order numbers', async () =>
    expect((await listOrderQueue('all', 'NX-260904-0000')).rows).toHaveLength(
      1,
    ));
  it('treats wildcard and SQL characters as literal search input', async () =>
    expect((await listOrderQueue('all', "%_' OR 1=1")).rows).toHaveLength(0));
  it('finds refunds even after shipment', async () =>
    expect(
      (await listOrderQueue('refund_due', '')).rows.map((o) => o.id),
    ).toEqual(['order001']));
  it('finds unassigned active work without treating shipped orders as work', async () => {
    expect((await listOrderQueue('unassigned', '')).rows.map((o) => o.id)).toEqual([
      'order000',
    ]);
  });
  it('normalizes invalid page values', () => {
    for (const raw of ['-1', '0', '1.5', 'NaN', 'Infinity', ''])
      expect(queuePage(raw)).toBe(1);
    expect(queuePage('2')).toBe(2);
    expect(queuePage('100001')).toBe(100000);
  });
});
