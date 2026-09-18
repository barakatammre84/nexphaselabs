import { and, eq, or, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { orderEvents, orders, staffUsers, type Order } from '@/db/schema';
import { canFulfil, type StaffPrincipal } from '@/lib/staff-auth';
import { randomToken } from '@/lib/staff-auth-core';

export type OrderHandoffInput = {
  assignedTo?: string | null;
  serviceDueAt?: string | null;
  note?: string | null;
};

export type OrderHandoffResult = { ok: true } | { ok: false; error: string };
export const BULK_ORDER_ASSIGNMENT_LIMIT = 50;
export type BulkOrderAssignmentRecord = Pick<Order, 'id' | 'orderNumber' | 'status' | 'lastTransitionId'>;
export type BulkOrderAssignmentResult =
  | { ok: true; changed: string[]; unchanged: [] }
  | { ok: false; error: string; changed: []; unchanged: string[] };

const actor = (staff: StaffPrincipal) => `${staff.name} (${staff.id})`;
const id = (prefix: string) => `${prefix}_${randomToken().slice(0, 24)}`;

function parseDue(value: string | null | undefined): Date | null | 'bad' {
  const text = (value ?? '').trim();
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? 'bad' : date;
}

/**
 * Claim, reassign, reschedule or clear one order owner. An unassigned order can
 * be self-claimed; after that the current owner can hand it to another active
 * teammate. Administrators can resolve any handoff.
 *
 * Owning an order is fulfilment work: the order queue is the operations seat's
 * (docs/THREE_PERSON_OPERATING_MODEL_2026-09-09.md) and QC holds no order
 * permission, so only a role that can fulfil claims or hands one off.
 */
export async function handoffOrder(
  current: Order,
  input: OrderHandoffInput,
  staff: StaffPrincipal,
  now = new Date(),
): Promise<OrderHandoffResult> {
  if (!canFulfil(staff)) return { ok: false, error: 'Only operations and administrators can claim or hand off an order.' };
  if (current.status === 'cancelled') return { ok: false, error: 'A cancelled order cannot be assigned.' };
  const targetId = (input.assignedTo ?? '').trim() || null;
  const note = (input.note ?? '').trim().slice(0, 1000) || null;
  const due = parseDue(input.serviceDueAt);
  if (due === 'bad') return { ok: false, error: 'Choose a valid service due date and time.' };
  if (targetId && !due) return { ok: false, error: 'Set a service due date when assigning an order.' };
  if (due && due.getTime() <= now.getTime()) return { ok: false, error: 'The service due date must be in the future.' };
  if (due && due.getTime() > now.getTime() + 366 * 24 * 60 * 60 * 1000) return { ok: false, error: 'The service due date must be within one year.' };
  const admin = staff.role === 'admin';
  if (!admin) {
    if (!current.assignedTo && targetId !== staff.id) return { ok: false, error: 'Claim an unassigned order for yourself.' };
    if (current.assignedTo && current.assignedTo !== staff.id) return { ok: false, error: 'Only the current owner or an administrator can hand off this order.' };
  }
  if (!targetId && !note) return { ok: false, error: 'Record why the order is being unassigned.' };
  let target: { id: string; name: string } | null = null;
  if (targetId) {
    [target] = await getDb()
      .select({ id: staffUsers.id, name: staffUsers.name })
      .from(staffUsers)
      .where(and(eq(staffUsers.id, targetId), eq(staffUsers.active, true)))
      .limit(1);
    if (!target) return { ok: false, error: 'Choose an active staff owner.' };
  }
  if (
    current.assignedTo === target?.id &&
    current.serviceDueAt?.getTime() === due?.getTime()
  ) return { ok: false, error: 'Nothing changed.' };

  const marker = id('otr');
  const eventNote = [
    target ? `Assigned to ${target.name}.` : 'Assignment cleared.',
    due ? `Service due ${due.toISOString()}.` : null,
    note,
  ].filter(Boolean).join(' ');
  const [changed] = await getDb().batch([
    getDb()
      .update(orders)
      .set({
        assignedTo: target?.id ?? null,
        assignedName: target?.name ?? null,
        serviceDueAt: target ? due : null,
        lastTransitionId: marker,
        updatedAt: now,
      })
      .where(
        and(
          eq(orders.id, current.id),
          eq(orders.status, current.status),
          sql`${orders.lastTransitionId} IS ${current.lastTransitionId}`,
        ),
      )
      .returning({ id: orders.id }),
    getDb().insert(orderEvents).select(
      getDb()
        .select({
          id: sql<string>`${id('oev')}`.as('id'),
          orderId: orders.id,
          fromStatus: orders.status,
          toStatus: orders.status,
          note: sql<string>`${eventNote}`.as('note'),
          actor: sql<string>`${actor(staff)}`.as('actor'),
          // Internal: who owns the order is not the customer's business, and
          // notifying them about it would say nothing (drizzle/0060).
          internal: sql<number>`1`.as('internal'),
          createdAt: sql<number>`${Math.floor(now.getTime() / 1000)}`.as('created_at'),
        })
        .from(orders)
        .where(and(eq(orders.id, current.id), eq(orders.lastTransitionId, marker))),
    ),
  ]);
  if (!changed || changed.length === 0) return { ok: false, error: 'The order changed while you were working. Reload and try again.' };
  return { ok: true };
}

/**
 * Operations-approved bulk policy: administrators may assign up to one queue
 * page (50 orders) to one active fulfilment owner, with one mandatory due time.
 * The operation is all-or-nothing: every row must still match the version that
 * was rendered, otherwise the guarded update changes nothing.
 */
export async function bulkAssignOrders(
  selected: BulkOrderAssignmentRecord[],
  input: Pick<OrderHandoffInput, 'assignedTo' | 'serviceDueAt' | 'note'>,
  staff: StaffPrincipal,
  now = new Date(),
): Promise<BulkOrderAssignmentResult> {
  const unchanged = selected.map((record) => record.orderNumber);
  const fail = (error: string): BulkOrderAssignmentResult => ({ ok: false, error, changed: [], unchanged });
  if (staff.role !== 'admin') return fail('Only administrators can assign multiple orders.');
  if (selected.length === 0) return fail('Select at least one order.');
  if (selected.length > BULK_ORDER_ASSIGNMENT_LIMIT) return fail(`Select no more than ${BULK_ORDER_ASSIGNMENT_LIMIT} orders.`);
  if (new Set(selected.map((record) => record.id)).size !== selected.length) return fail('Each order may be selected only once.');
  if (selected.some((record) => record.status === 'cancelled')) return fail('Cancelled orders cannot be assigned.');
  const targetId = (input.assignedTo ?? '').trim();
  if (!targetId) return fail('Choose an owner.');
  const due = parseDue(input.serviceDueAt);
  if (due === 'bad' || !due) return fail('Choose a valid service due date and time.');
  if (due.getTime() <= now.getTime()) return fail('The service due date must be in the future.');
  if (due.getTime() > now.getTime() + 366 * 24 * 60 * 60 * 1000) return fail('The service due date must be within one year.');
  const [target] = await getDb()
    .select({ id: staffUsers.id, name: staffUsers.name })
    .from(staffUsers)
    .where(and(eq(staffUsers.id, targetId), eq(staffUsers.active, true), or(eq(staffUsers.role, 'admin'), eq(staffUsers.role, 'ops'))))
    .limit(1);
  if (!target) return fail('Choose an active operations or administrator owner.');

  const expectedJson = JSON.stringify(selected.map(({ id, status, lastTransitionId }) => ({
    id,
    status,
    lastTransitionId,
  })));
  const marker = id('obulk');
  const note = (input.note ?? '').trim().slice(0, 1000);
  const eventNote = `Bulk assigned to ${target.name}. Service due ${due.toISOString()}.${note ? ` ${note}` : ''}`;
  const [changed] = await getDb().batch([
    getDb().update(orders).set({
      assignedTo: target.id,
      assignedName: target.name,
      serviceDueAt: due,
      lastTransitionId: marker,
      updatedAt: now,
    }).where(sql`
      EXISTS (
        SELECT 1 FROM json_each(${expectedJson}) item
        WHERE json_extract(item.value, '$.id') = ${orders.id}
          AND json_extract(item.value, '$.status') = ${orders.status}
          AND json_extract(item.value, '$.lastTransitionId') IS ${orders.lastTransitionId}
      )
      AND (
        SELECT count(*) FROM ${orders} expected_orders
        JOIN json_each(${expectedJson}) item
          ON json_extract(item.value, '$.id') = expected_orders.id
         AND json_extract(item.value, '$.status') = expected_orders.status
         AND json_extract(item.value, '$.lastTransitionId') IS expected_orders.last_transition_id
      ) = ${selected.length}
    `).returning({ orderNumber: orders.orderNumber }),
    getDb().insert(orderEvents).select(
      getDb().select({
        id: sql<string>`'oev_' || lower(hex(randomblob(12)))`.as('id'),
        orderId: orders.id,
        fromStatus: orders.status,
        toStatus: orders.status,
        note: sql<string>`${eventNote}`.as('note'),
        actor: sql<string>`${actor(staff)}`.as('actor'),
        internal: sql<number>`1`.as('internal'),
        createdAt: sql<number>`${Math.floor(now.getTime() / 1000)}`.as('created_at'),
      }).from(orders).where(eq(orders.lastTransitionId, marker)),
    ),
  ]);
  if (!changed || changed.length !== selected.length) {
    return fail('No orders changed because at least one selected order was updated by someone else. Reload and try again.');
  }
  return { ok: true, changed: changed.map((record) => record.orderNumber), unchanged: [] };
}
