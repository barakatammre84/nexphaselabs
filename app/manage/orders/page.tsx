import type { Metadata } from 'next';
import Link from 'next/link';
import { Lock } from 'lucide-react';
import { CatalogUnavailable } from '@/components/site/catalog-unavailable';
import { loadCatalog } from '@/lib/catalog-data';
import { ORDER_STATUS_LABEL, type OrderStatus } from '@/lib/order-rules';
import { listOrderQueue, queuePage, type OrderQueueFilters } from '@/lib/order-queue';
import {
  orderNextStep,
  orderQueue,
  ORDER_QUEUES,
  searchQuery,
} from '@/lib/workflow-display';
import { requireStaff } from '@/lib/staff-auth';
import { formatCents } from '@/lib/visibility-rules';
import { getDb } from '@/db';
import { staffUsers } from '@/db/schema';
import { and, asc, eq, or } from 'drizzle-orm';
import { BulkAssignmentForm } from './bulk-assignment-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Orders',
  robots: { index: false, follow: false },
};

export default async function ManageOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ queue?: string; q?: string; page?: string; owner?: string; dueFrom?: string; dueTo?: string; payment?: string; status?: string }>;
}) {
  const staff = await requireStaff('/manage/orders');
  const params = await searchParams;
  const queue = orderQueue(params.queue);
  const query = searchQuery(params.q);
  const page = queuePage(params.page);
  const filters: OrderQueueFilters = {
    owner: params.owner, dueFrom: params.dueFrom, dueTo: params.dueTo,
    payment: params.payment, status: params.status,
  };
  const loaded = await loadCatalog(() =>
    listOrderQueue(queue, query, page, staff.id, filters),
  );
  const owners = staff.role === 'admin' ? await getDb()
    .select({ id: staffUsers.id, name: staffUsers.name })
    .from(staffUsers)
    .where(and(eq(staffUsers.active, true), or(eq(staffUsers.role, 'admin'), eq(staffUsers.role, 'ops'))))
    .orderBy(asc(staffUsers.name)) : [];
  const list = loaded.data?.rows ?? [];
  const filterParams = Object.fromEntries(
    Object.entries(filters).filter(
      (entry): entry is [string, string] =>
        typeof entry[1] === 'string' && Boolean(entry[1]),
    ),
  );
  const pageHref = (n: number) =>
    '/manage/orders?' +
    new URLSearchParams({ queue, q: query, page: String(n), ...filterParams });
  return (
    <main className="bg-background text-foreground">
      <section className="mx-auto max-w-[1500px] px-5 py-14 sm:px-8 lg:px-12">
        <p className="utility-label flex items-center gap-3 text-primary">
          <Lock className="size-4" /> Internal &middot; orders
        </p>
        <h1 className="mt-6 font-display text-[clamp(2.2rem,4.2vw,3.6rem)] font-extrabold leading-[0.95] tracking-[-0.05em]">
          Orders
        </h1>
        <form
          method="get"
          action="/manage/orders"
          className="mt-6 flex flex-wrap items-end gap-3"
        >
          <label className="grid gap-2 text-sm font-semibold">
            Queue
            <select
              name="queue"
              defaultValue={queue}
              className="min-h-11 rounded-md border border-input bg-background px-3"
            >
              {Object.entries(ORDER_QUEUES).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid min-w-0 flex-1 basis-64 gap-2 text-sm font-semibold">
            Order, recipient, or organization
            <input
              type="search"
              name="q"
              defaultValue={query}
              maxLength={120}
              className="min-h-11 rounded-md border border-input px-3"
            />
          </label>
          <label className="grid gap-2 text-sm font-semibold">Owner
            <select name="owner" defaultValue={filters.owner ?? 'all'} className="min-h-11 rounded-md border border-input bg-background px-3">
              <option value="all">All owners</option><option value="mine">Mine</option><option value="unassigned">Unassigned</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm font-semibold">Due from<input type="date" name="dueFrom" defaultValue={filters.dueFrom} className="min-h-11 rounded-md border border-input px-3" /></label>
          <label className="grid gap-2 text-sm font-semibold">Due to<input type="date" name="dueTo" defaultValue={filters.dueTo} className="min-h-11 rounded-md border border-input px-3" /></label>
          <label className="grid gap-2 text-sm font-semibold">Payment
            <select name="payment" defaultValue={filters.payment ?? 'all'} className="min-h-11 rounded-md border border-input bg-background px-3">
              <option value="all">All payments</option><option value="paid">Paid</option><option value="pending">Pending</option><option value="refund_due">Refund due</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm font-semibold">Status
            <select name="status" defaultValue={filters.status ?? 'all'} className="min-h-11 rounded-md border border-input bg-background px-3">
              <option value="all">All statuses</option>{Object.entries(ORDER_STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <button type="submit" className="action-primary">
            Apply filters
          </button>
          <Link href="/manage/orders" className="action-secondary">
            Clear filters
          </Link>
        </form>
        <p className="mt-4 text-sm text-muted-foreground">
          {ORDER_QUEUES[queue]} · Page {page} · Up to 50 orders per page
        </p>
        {staff.role === 'admin' && list.length > 0 && (
          <BulkAssignmentForm
            owners={owners}
            rows={list.map(({ id, orderNumber, status, lastTransitionId }) => ({ id, orderNumber, status, lastTransitionId }))}
          />
        )}
        {loaded.unavailable ? (
          <div className="mt-10">
            <CatalogUnavailable />
          </div>
        ) : list.length === 0 ? (
          <p className="mt-10 border border-border bg-secondary p-6 text-sm">
            No orders match this view. Change the filters or return to the first
            page.
          </p>
        ) : (
          <div className="mt-10 overflow-x-auto border border-border">
            <table className="hidden w-full border-collapse text-sm md:table">
              <thead>
                <tr className="border-b border-border bg-secondary text-left">
                  <th className="p-4 font-semibold">Order</th>
                  <th className="p-4 font-semibold">Submitted</th>
                  <th className="p-4 font-semibold">Consignee</th>
                  <th className="p-4 font-semibold">Total</th>
                  <th className="p-4 font-semibold">Payment</th>
                  <th className="p-4 font-semibold">Owner / due</th>
                  <th className="p-4 font-semibold">Status / blocker / next action</th>
                  <th className="p-4 font-semibold">Latest evidence</th>
                </tr>
              </thead>
              <tbody>
                {list.map((o) => (
                  <tr
                    key={o.id}
                    className="border-b border-border last:border-b-0"
                  >
                    <td className="p-4 font-mono text-xs">
                      <Link
                        href={`/manage/orders/${o.orderNumber}`}
                        className="font-semibold text-primary"
                      >
                        {o.orderNumber}
                      </Link>
                    </td>
                    <td className="p-4 font-mono text-xs">
                      {o.submittedAt.toISOString().slice(0, 10)}
                    </td>
                    <td className="p-4">
                      {o.consigneeName}
                      {o.consigneeInstitution ? (
                        <span className="block text-xs text-muted-foreground">
                          {o.consigneeInstitution}
                        </span>
                      ) : null}
                    </td>
                    <td className="p-4 font-mono">
                      {formatCents(o.totalCents)}
                    </td>
                    <td className="p-4 text-muted-foreground">
                      {o.paymentMethod ?? '—'} &middot;{' '}
                      {o.paymentStatus === 'refund_due'
                        ? 'refund due'
                        : o.paymentStatus}
                    </td>
                    <td className="p-4">
                      {o.assignedName ?? 'Unassigned'}
                      {o.serviceDueAt && (
                        <span
                          className={`mt-1 block font-mono text-xs ${
                            o.status !== 'cancelled' && o.serviceDueAt < new Date()
                              ? 'font-semibold text-destructive'
                              : 'text-muted-foreground'
                          }`}
                        >
                          due {o.serviceDueAt.toISOString().slice(0, 16).replace('T', ' ')} UTC
                        </span>
                      )}
                    </td>
                    <td className="p-4">
                      {ORDER_STATUS_LABEL[o.status as OrderStatus] ?? o.status}
                      <p className="mt-2 max-w-xs text-xs leading-5 text-muted-foreground">
                        Blocker: {o.paymentStatus === 'refund_due' ? 'Refund due' : o.status === 'cancelled' ? 'Cancelled' : 'None recorded'}<br />
                        Next: {orderNextStep(o, true)}
                      </p>
                      {o.returnedAt && (
                        <span className="ml-2 font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                          returned
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-xs text-muted-foreground">
                      {o.returnedAt ? 'Return recorded' : 'Order record'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="grid divide-y divide-border md:hidden">
              {list.map((o) => (
                <article key={o.id} className="grid gap-2 p-4 text-sm">
                  <Link href={`/manage/orders/${o.orderNumber}`} className="font-semibold text-primary">{o.orderNumber}</Link>
                  <span>{o.consigneeName} · {formatCents(o.totalCents)} · {o.paymentStatus}</span>
                  <span className="text-muted-foreground">Owner: {o.assignedName ?? 'Unassigned'} · Due: {o.serviceDueAt?.toISOString().slice(0, 16).replace('T', ' ') ?? '—'} UTC</span>
                  <span>Status: {ORDER_STATUS_LABEL[o.status as OrderStatus] ?? o.status} · Next: {orderNextStep(o, true)}</span>
                  <span className="text-xs text-muted-foreground">Latest evidence: {o.returnedAt ? 'Return recorded' : 'Order record'}</span>
                </article>
              ))}
            </div>
          </div>
        )}
        {!loaded.unavailable && (
          <nav aria-label="Order pages" className="mt-6 flex gap-3">
            {page > 1 && (
              <Link href={pageHref(page - 1)} className="action-secondary">
                Previous page
              </Link>
            )}
            {loaded.data?.hasNext && (
              <Link href={pageHref(page + 1)} className="action-secondary">
                Next page
              </Link>
            )}
          </nav>
        )}
      </section>
    </main>
  );
}
