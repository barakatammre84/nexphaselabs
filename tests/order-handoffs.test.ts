import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localD1 } from './helpers/local-d1';

const { env } = vi.hoisted(() => ({ env: {} as { DB?: D1Database } }));
vi.mock('cloudflare:workers', () => ({ env }));
// handoffOrder checks canFulfil from lib/staff-auth, which imports the framework's request helpers.
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

import { getDb } from '@/db';
import { accounts, orderEvents, orders, staffUsers } from '@/db/schema';
import { handoffOrder } from '@/lib/order-handoffs';
import { listOrderQueue } from '@/lib/order-queue';
import type { StaffPrincipal } from '@/lib/staff-auth';

let local: ReturnType<typeof localD1>;
const now = new Date('2026-09-08T12:00:00Z');
const admin = { id: 'admin', name: 'Admin', role: 'admin' } as StaffPrincipal;
const first = { id: 'first', name: 'First owner', role: 'ops' } as StaffPrincipal;
const second = { id: 'second', name: 'Second owner', role: 'qc' } as StaffPrincipal;

async function order() {
  await getDb().insert(accounts).values({
    id: 'account',
    email: 'synthetic@example.invalid',
    name: 'Synthetic',
    passwordHash: 'unused',
  });
  await getDb().insert(orders).values({
    id: 'order',
    orderNumber: 'NX-260908-0001',
    accountId: 'account',
    status: 'paid',
    subtotalCents: 100,
    totalCents: 100,
    priceTier: 'institutional',
    consigneeName: 'Synthetic',
    shipToLine1: 'Test',
    shipToCity: 'Test',
    shipToRegion: 'CA',
    shipToPostalCode: '00000',
    shipToCountry: 'US',
    submittedAt: now,
  });
  return (await getDb().select().from(orders))[0];
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(now);
  local = localD1();
  env.DB = local.binding;
  for (const person of [admin, first, second]) {
    await getDb().insert(staffUsers).values({
      id: person.id,
      email: `${person.id}@example.invalid`,
      name: person.name,
      role: person.role,
      passwordHash: 'unused',
    });
  }
});

afterEach(() => {
  local.sqlite.close();
  delete env.DB;
  vi.useRealTimers();
});

describe('order ownership and handoffs', () => {
  it('lets staff self-claim an unassigned order with a future target', async () => {
    const current = await order();
    expect(
      (
        await handoffOrder(
          current,
          {
            assignedTo: first.id,
            serviceDueAt: '2026-09-09T12:00:00Z',
            note: 'Prepare released-lot allocation.',
          },
          first,
          now,
        )
      ).ok,
    ).toBe(true);
    const saved = (await getDb().select().from(orders))[0];
    expect(saved).toMatchObject({ assignedTo: first.id, assignedName: first.name });
    expect(await getDb().select().from(orderEvents)).toHaveLength(1);
    expect((await listOrderQueue('mine', '', 1, first.id)).rows).toHaveLength(1);
  });

  it('records the handoff in the audit trail without emailing the customer', async () => {
    const current = await order();
    expect(
      (
        await handoffOrder(
          current,
          {
            assignedTo: first.id,
            serviceDueAt: '2026-09-09T12:00:00Z',
            note: 'Prepare released-lot allocation.',
          },
          first,
          now,
        )
      ).ok,
    ).toBe(true);

    // The event is still written: who held the order is part of its history.
    const events = await getDb().select().from(orderEvents);
    expect(events).toHaveLength(1);
    expect(events[0].internal).toBe(true);
    expect(events[0].note).toContain('Assigned to First owner.');

    // But the customer hears nothing. A handoff changes no status, no payment
    // and no shipment, so the notification trigger must not fire (drizzle/0060).
    expect(
      local.sqlite.prepare('SELECT count(*) AS n FROM notifications').get()!.n,
    ).toBe(0);
  });

  it('still notifies the customer about a real order event', async () => {
    await order();
    await getDb().insert(orderEvents).values({
      id: 'shipped',
      orderId: 'order',
      fromStatus: 'paid',
      toStatus: 'fulfilling',
      actor: 'staff',
    });
    expect(
      local.sqlite.prepare('SELECT count(*) AS n FROM notifications').get()!.n,
    ).toBe(1);
  });

  it('prevents staff assigning an unowned order to somebody else', async () => {
    const current = await order();
    expect(
      (
        await handoffOrder(
          current,
          { assignedTo: second.id, serviceDueAt: '2026-09-09T12:00:00Z' },
          first,
          now,
        )
      ).ok,
    ).toBe(false);
  });

  it('lets the current owner hand off with an attributed same-status event', async () => {
    const current = await order();
    await handoffOrder(
      current,
      { assignedTo: first.id, serviceDueAt: '2026-09-09T12:00:00Z' },
      admin,
      now,
    );
    const assigned = (await getDb().select().from(orders))[0];
    expect(
      (
        await handoffOrder(
          assigned,
          {
            assignedTo: second.id,
            serviceDueAt: '2026-09-10T12:00:00Z',
            note: 'Quality review requested.',
          },
          first,
          now,
        )
      ).ok,
    ).toBe(true);
    const events = await getDb().select().from(orderEvents);
    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({ fromStatus: 'paid', toStatus: 'paid' });
    expect(events[1].note).toContain(second.name);
  });

  it('requires a future due time and a reason when clearing ownership', async () => {
    const current = await order();
    expect((await handoffOrder(current, { assignedTo: first.id }, admin, now)).ok).toBe(false);
    expect((await handoffOrder(current, { assignedTo: first.id, serviceDueAt: '2026-09-08T11:00:00Z' }, admin, now)).ok).toBe(false);
    const claimed = await handoffOrder(current, { assignedTo: first.id, serviceDueAt: '2026-09-09T12:00:00Z' }, admin, now);
    expect(claimed.ok).toBe(true);
    const assigned = (await getDb().select().from(orders))[0];
    expect((await handoffOrder(assigned, { assignedTo: '' }, first, now)).ok).toBe(false);
    expect((await handoffOrder(assigned, { assignedTo: '', note: 'Returned to shared queue.' }, first, now)).ok).toBe(true);
  });

  it('detects stale handoffs without adding an orphan history row', async () => {
    const stale = await order();
    await handoffOrder(stale, { assignedTo: first.id, serviceDueAt: '2026-09-09T12:00:00Z' }, admin, now);
    expect((await handoffOrder(stale, { assignedTo: second.id, serviceDueAt: '2026-09-10T12:00:00Z' }, admin, now)).ok).toBe(false);
    expect(await getDb().select().from(orderEvents)).toHaveLength(1);
  });

  it('keeps quality staff, who hold no order permission, from claiming an order', async () => {
    const current = await order();
    expect(
      await handoffOrder(current, { assignedTo: second.id, serviceDueAt: '2026-09-09T12:00:00Z' }, second, now),
    ).toEqual({ ok: false, error: 'Only operations and administrators can claim or hand off an order.' });
    expect((await getDb().select().from(orders))[0].assignedTo).toBeNull();
    expect(await getDb().select().from(orderEvents)).toHaveLength(0);
  });
});
