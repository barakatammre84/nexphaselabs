import { and, eq, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { orderEvents, orders, staffUsers, type Order } from '@/db/schema';
import type { StaffPrincipal } from '@/lib/staff-auth';
import { randomToken } from '@/lib/staff-auth-core';

export type OrderHandoffInput = {
  assignedTo?: string | null;
  serviceDueAt?: string | null;
  note?: string | null;
};

export type OrderHandoffResult = { ok: true } | { ok: false; error: string };

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
 */
export async function handoffOrder(
  current: Order,
  input: OrderHandoffInput,
  staff: StaffPrincipal,
  now = new Date(),
): Promise<OrderHandoffResult> {
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
          createdAt: sql<number>`${Math.floor(now.getTime() / 1000)}`.as('created_at'),
        })
        .from(orders)
        .where(and(eq(orders.id, current.id), eq(orders.lastTransitionId, marker))),
    ),
  ]);
  if (!changed || changed.length === 0) return { ok: false, error: 'The order changed while you were working. Reload and try again.' };
  return { ok: true };
}
