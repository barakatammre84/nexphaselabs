import type { Metadata } from 'next';
import Link from 'next/link';
import { Lock } from 'lucide-react';
import { CatalogUnavailable } from '@/components/site/catalog-unavailable';
import { loadCatalog } from '@/lib/catalog-data';
import { ORDER_STATUS_LABEL, type OrderStatus } from '@/lib/order-rules';
import { listAllOrders } from '@/lib/orders';
import { requireStaff } from '@/lib/staff-auth';
import { formatCents } from '@/lib/visibility-rules';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Orders', robots: { index: false, follow: false } };

export default async function ManageOrdersPage() {
  await requireStaff('/manage/orders');
  const loaded = await loadCatalog(listAllOrders);
  const list = loaded.data ?? [];
  return (
    <main className="bg-background text-foreground">
      <section className="mx-auto max-w-[1500px] px-5 py-14 sm:px-8 lg:px-12">
        <p className="utility-label flex items-center gap-3 text-primary">
          <Lock className="size-4" /> Internal &middot; orders
        </p>
        <h1 className="mt-6 font-display text-[clamp(2.2rem,4.2vw,3.6rem)] font-extrabold leading-[0.95] tracking-[-0.05em]">Orders</h1>
        {loaded.unavailable ? (
          <div className="mt-10">
            <CatalogUnavailable />
          </div>
        ) : list.length === 0 ? (
          <p className="mt-10 border border-border bg-secondary p-6 text-sm">No orders yet.</p>
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
                  <th className="p-4 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {list.map((o) => (
                  <tr key={o.id} className="border-b border-border last:border-b-0">
                    <td className="p-4 font-mono text-xs">
                      <Link href={`/manage/orders/${o.orderNumber}`} className="font-semibold text-primary">
                        {o.orderNumber}
                      </Link>
                    </td>
                    <td className="p-4 font-mono text-xs">{o.submittedAt.toISOString().slice(0, 10)}</td>
                    <td className="p-4">
                      {o.consigneeName}
                      {o.consigneeInstitution ? <span className="block text-xs text-muted-foreground">{o.consigneeInstitution}</span> : null}
                    </td>
                    <td className="p-4 font-mono">{formatCents(o.totalCents)}</td>
                    <td className="p-4 text-muted-foreground">
                      {o.paymentMethod ?? '—'} &middot; {o.paymentStatus}
                    </td>
                    <td className="p-4">{ORDER_STATUS_LABEL[o.status as OrderStatus] ?? o.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
