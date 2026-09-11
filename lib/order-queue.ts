import { and, desc, eq, isNull, lt, notInArray, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { orders } from '@/db/schema';
import type { OrderQueue } from '@/lib/workflow-display';

export function queuePage(raw?: string): number {
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? Math.min(n, 100000) : 1;
}
/** Filter before pagination so older actionable records cannot disappear. */
export async function listOrderQueue(
  queue: OrderQueue,
  query: string,
  page = 1,
  staffId?: string,
) {
  const search = query.trim().slice(0, 120).toLowerCase();
  const status =
    queue === 'all'
      ? undefined
      : queue === 'mine'
        ? staffId
          ? eq(orders.assignedTo, staffId)
          : sql`0 = 1`
        : queue === 'overdue'
          ? and(
              lt(orders.serviceDueAt, new Date()),
              notInArray(orders.status, ['cancelled']),
            )
          : queue === 'unassigned'
            ? and(
                isNull(orders.assignedTo),
                notInArray(orders.status, ['shipped', 'cancelled']),
              )
      : queue === 'refund_due'
        ? eq(orders.paymentStatus, queue)
        : eq(orders.status, queue);
  const matching = search
    ? sql`instr(lower(${orders.orderNumber} || ' ' || ${orders.consigneeName} || ' ' || coalesce(${orders.consigneeInstitution}, '')), ${search}) > 0`
    : undefined;
  const rows = await getDb()
    .select()
    .from(orders)
    .where(and(status, matching))
    .orderBy(desc(orders.submittedAt), desc(orders.id))
    .limit(51)
    .offset((queuePage(String(page)) - 1) * 50);
  return { rows: rows.slice(0, 50), hasNext: rows.length > 50 };
}
