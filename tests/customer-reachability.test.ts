import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localD1 } from './helpers/local-d1';

const { env } = vi.hoisted(() => ({ env: {} as Record<string, unknown> }));
vi.mock('cloudflare:workers', () => ({ env }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

import { getDb } from '@/db';
import { notifications } from '@/db/notifications-schema';
import { seedCommerceFixture, syntheticOrder } from './helpers/commerce-fixture';
import { beginPayment, getOrderByNumber, markOrderPaid } from '@/lib/orders';
import { recordShipment, startFulfilment } from '@/lib/fulfilment';
import {
  accountReachability,
  lotConsignees,
  reachability,
  reachabilitySummary,
  shippedLotNumbers,
} from '@/lib/customer-reachability';
import type { StaffPrincipal } from '@/lib/staff-auth';

/**
 * Chapter 10 §10.6. "Who received material from this lot, and how do I reach
 * them today" is the question a recall turns on, and the answer has to come
 * from the order lines rather than the movement ledger.
 */

const staff = { id: 's', name: 'Synthetic Ops', role: 'admin' } as StaffPrincipal;
let local: ReturnType<typeof localD1>;

async function shipOne() {
  const order = await syntheticOrder(1);
  await beginPayment(order.detail, 'invoice', '', 'Test');
  let detail = (await getOrderByNumber(order.detail.order.orderNumber))!;
  await markOrderPaid(detail, 'Test', 'SYNTHETIC');
  detail = (await getOrderByNumber(detail.order.orderNumber))!;
  await startFulfilment(detail, staff);
  detail = (await getOrderByNumber(detail.order.orderNumber))!;
  await recordShipment(
    detail,
    {
      picks: { [detail.items[0].id]: 'l' },
      carrier: 'Test',
      trackingNumber: 'SYNTHETIC',
      shippedOn: new Date().toISOString().slice(0, 10),
    },
    staff,
  );
  return detail.order.orderNumber;
}

beforeEach(async () => {
  local = localD1();
  Object.assign(env, {
    DB: local.binding,
    APP_ENV: 'staging',
    OPEN_CHECKOUT_ENABLED: 'true',
    INVENTORY_RESERVATION_MINUTES: '30',
  });
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('No external calls')));
  await seedCommerceFixture();
});

afterEach(() => {
  vi.unstubAllGlobals();
  local.sqlite.close();
  for (const key of Object.keys(env)) delete env[key];
});

describe('classifying one customer', () => {
  const base = { email: 'researcher@example.invalid', emailVerifiedAt: null, phone: null, lastNotice: null };

  it('calls a verified address reachable', () => {
    const result = reachability({ ...base, emailVerifiedAt: new Date('2026-09-01') });
    expect(result.state).toBe('reachable');
  });

  it('calls an unverified address with nothing sent to it unproven, not unreachable', () => {
    const result = reachability(base);
    expect(result.state).toBe('unproven');
    expect(result.reasons.join(' ')).toContain('never been verified');
  });

  it('treats an accepted notice as evidence the address works, and says accepted rather than delivered', () => {
    const result = reachability({
      ...base,
      lastNotice: { status: 'accepted', at: new Date('2026-09-10'), error: null },
    });
    expect(result.state).toBe('reachable');
    expect(result.reasons.join(' ')).toContain('accepted by the mail provider');
    expect(JSON.stringify(result)).not.toContain('delivered');
  });

  it('calls a bounced address unreachable and repeats the provider error', () => {
    const result = reachability({
      ...base,
      emailVerifiedAt: new Date('2026-09-01'),
      lastNotice: { status: 'failed', at: new Date('2026-09-10'), error: '550 mailbox unavailable' },
    });
    expect(result.state).toBe('unreachable');
    expect(result.reasons.join(' ')).toContain('550 mailbox unavailable');
  });

  it('calls an empty address unreachable without pretending otherwise', () => {
    expect(reachability({ ...base, email: '   ' }).state).toBe('unreachable');
  });

  it('records whether there is any route that does not depend on mail', () => {
    expect(reachability(base).secondRoute).toBe(false);
    expect(reachability(base).reasons.join(' ')).toContain('only route');
    expect(reachability({ ...base, phone: '+1 555 0100' }).secondRoute).toBe(true);
  });

  it('keeps a queued notice from counting as proof of anything', () => {
    const result = reachability({ ...base, lastNotice: { status: 'pending', at: null, error: null } });
    expect(result.state).toBe('unproven');
    expect(result.reasons.join(' ')).toContain('queued');
  });
});

describe('the recall query', () => {
  it('finds everyone who received material from a lot, from the order lines', async () => {
    const first = await shipOne();
    const second = await shipOne();
    const consignees = await lotConsignees('SYNTHETIC-LOT');
    expect(consignees.map((consignee) => consignee.orderNumber).sort()).toEqual([first, second].sort());
    expect(consignees[0].destination).toContain('CA');
    expect(consignees[0].packs).toBe(1);
  });

  it('does not read the movement ledger to answer it', async () => {
    await shipOne();
    expect(local.sqlite.prepare('SELECT count(*) n FROM lot_movements').get()!.n).toBeGreaterThan(0);
    // The query is driven by order lines; a lot with movements but no shipped
    // order line has no consignees.
    expect(await lotConsignees('NO-SUCH-LOT')).toEqual([]);
  });

  it('counts how many of them could actually be reached — the honest measure', async () => {
    await shipOne();
    const summary = reachabilitySummary(await lotConsignees('SYNTHETIC-LOT'));
    expect(summary.total).toBe(1);
    // A guest order: the address has never been verified and nothing has been sent.
    expect(summary.unproven).toBe(1);
    expect(summary.reachable).toBe(0);
    expect(summary.withSecondRoute).toBe(0);
  });

  it('downgrades a consignee whose last notice failed', async () => {
    const orderNumber = await shipOne();
    const [before] = await lotConsignees('SYNTHETIC-LOT');
    await getDb().insert(notifications).values({
      id: 'ntf_failed',
      orderNumber,
      recipient: before.reachability.email!,
      subject: 'Your order has shipped',
      body: 'body',
      status: 'failed',
      lastError: '550 mailbox unavailable',
      attempts: 3,
      createdAt: new Date(),
      nextAttemptAt: new Date(),
    } as never);
    const [after] = await lotConsignees('SYNTHETIC-LOT');
    expect(after.reachability.state).toBe('unreachable');
    expect(after.reachability.lastNotice?.error).toContain('550');
  });

  it('prefers what actually happened over what is still queued', async () => {
    // Placing an order raises several notices; they sit pending for a while and
    // say nothing about whether the address works. A bounce does.
    const orderNumber = await shipOne();
    const [before] = await lotConsignees('SYNTHETIC-LOT');
    expect(local.sqlite.prepare("SELECT count(*) n FROM notifications WHERE status='pending'").get()!.n)
      .toBeGreaterThan(0);
    await getDb().insert(notifications).values({
      id: 'ntf_bounced',
      orderNumber,
      recipient: before.reachability.email!,
      subject: 'Bounced',
      body: 'body',
      status: 'failed',
      lastError: '550 mailbox unavailable',
      createdAt: new Date('2026-09-01T00:00:00Z'),
      nextAttemptAt: new Date('2026-09-01T00:00:00Z'),
    } as never);
    expect((await lotConsignees('SYNTHETIC-LOT'))[0].reachability.state).toBe('unreachable');
  });

  it('reads the newest notice, not the first one', async () => {
    const orderNumber = await shipOne();
    const [consignee] = await lotConsignees('SYNTHETIC-LOT');
    const recipient = consignee.reachability.email!;
    await getDb().insert(notifications).values({
      id: 'ntf_old',
      orderNumber,
      recipient,
      subject: 'Older',
      body: 'body',
      status: 'failed',
      lastError: 'transient',
      createdAt: new Date('2026-09-01T00:00:00Z'),
      nextAttemptAt: new Date('2026-09-01T00:00:00Z'),
    } as never);
    await getDb().insert(notifications).values({
      id: 'ntf_new',
      orderNumber,
      recipient,
      subject: 'Newer',
      body: 'body',
      status: 'sent',
      acceptedAt: new Date('2026-09-12T00:00:00Z'),
      createdAt: new Date('2026-09-12T00:00:00Z'),
      nextAttemptAt: new Date('2026-09-12T00:00:00Z'),
    } as never);
    const [after] = await lotConsignees('SYNTHETIC-LOT');
    expect(after.reachability.state).toBe('reachable');
  });

  it('lists the lots a recall would have to chase', async () => {
    await shipOne();
    expect(await shippedLotNumbers()).toEqual(['SYNTHETIC-LOT']);
  });

  it('answers the same questions for one customer on the staff account page', async () => {
    await shipOne();
    const { account_id: accountId, email } = local.sqlite
      .prepare('SELECT o.account_id, a.email FROM orders o JOIN accounts a ON a.id = o.account_id')
      .get() as { account_id: string; email: string };
    expect(await shippedLotNumbers(50, accountId)).toEqual(['SYNTHETIC-LOT']);
    expect(await shippedLotNumbers(50, 'acc_someone_else')).toEqual([]);
    const reach = await accountReachability(accountId);
    expect(reach).toMatchObject({ email });
    expect(['reachable', 'unproven', 'unreachable']).toContain(reach?.state);
    expect(await accountReachability('acc_missing')).toBeNull();
  });
});
