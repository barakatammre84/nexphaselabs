import { and, desc, eq, gte, isNull, lt, lte, notInArray, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { orders } from '@/db/schema';
import type { OrderQueue } from '@/lib/workflow-display';

export function queuePage(raw?: string): number {
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? Math.min(n, 100000) : 1;
}
function validDate(value: string | undefined, end = false): Date | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T${end ? '23:59:59.999' : '00:00:00.000'}Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? undefined : date;
}
/** Filter before pagination so older actionable records cannot disappear. */
export async function listOrderQueue(
  queue: OrderQueue,
  query: string,
  page = 1,
  staffId?: string,
  filters: OrderQueueFilters = {},
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
  const owner = filters.owner === 'mine' && staffId
    ? eq(orders.assignedTo, staffId)
    : filters.owner === 'unassigned'
      ? isNull(orders.assignedTo)
      : filters.owner && filters.owner !== 'all'
        ? eq(orders.assignedTo, filters.owner)
        : undefined;
  const due = and(
    validDate(filters.dueFrom) ? gte(orders.serviceDueAt, validDate(filters.dueFrom)!) : undefined,
    validDate(filters.dueTo, true) ? lte(orders.serviceDueAt, validDate(filters.dueTo, true)!) : undefined,
  );
  const payment = filters.payment && filters.payment !== 'all'
    ? eq(orders.paymentStatus, filters.payment)
    : undefined;
  const requestedStatus = filters.status && filters.status !== 'all'
    ? eq(orders.status, filters.status)
    : undefined;
  const rows = await getDb()
    .select()
    .from(orders)
    .where(and(status, matching, owner, due, payment, requestedStatus))
    .orderBy(desc(orders.submittedAt), desc(orders.id))
    .limit(51)
    .offset((queuePage(String(page)) - 1) * 50);
  return { rows: rows.slice(0, 50), hasNext: rows.length > 50 };
}

export type OrderQueueFilters = {
  owner?: string;
  dueFrom?: string;
  dueTo?: string;
  payment?: string;
  status?: string;
};
