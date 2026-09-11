import type { Metadata } from 'next';
import Link from 'next/link';
import { Lock } from 'lucide-react';
import { CatalogUnavailable } from '@/components/site/catalog-unavailable';
import { loadCatalog } from '@/lib/catalog-data';
import { ORDER_STATUS_LABEL, type OrderStatus } from '@/lib/order-rules';
import { listOrderQueue, queuePage } from '@/lib/order-queue';
import {
  orderNextStep,
  orderQueue,
  ORDER_QUEUES,
  searchQuery,
} from '@/lib/workflow-display';
import { requireStaff } from '@/lib/staff-auth';
import { formatCents } from '@/lib/visibility-rules';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Orders',
  robots: { index: false, follow: false },
};

export default async function ManageOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ queue?: string; q?: string; page?: string }>;
}) {
  const staff = await requireStaff('/manage/orders');
  const params = await searchParams;
  const queue = orderQueue(params.queue);
  const query = searchQuery(params.q);
  const page = queuePage(params.page);
  const loaded = await loadCatalog(() =>
    listOrderQueue(queue, query, page, staff.id),
  );
  const list = loaded.data?.rows ?? [];
  const pageHref = (n: number) =>
    '/manage/orders?' +
    new URLSearchParams({ queue, q: query, page: String(n) });
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
            <table className="w-full min-w-[900px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary text-left">
                  <th className="p-4 font-semibold">Order</th>
                  <th className="p-4 font-semibold">Submitted</th>
                  <th className="p-4 font-semibold">Consignee</th>
                  <th className="p-4 font-semibold">Total</th>
                  <th className="p-4 font-semibold">Payment</th>
                  <th className="p-4 font-semibold">Owner / due</th>
                  <th className="p-4 font-semibold">Status / next action</th>
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
                        {orderNextStep(o, true)}
                      </p>
                      {o.returnedAt && (
                        <span className="ml-2 font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                          returned
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
