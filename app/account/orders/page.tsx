import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { CatalogUnavailable } from '@/components/site/catalog-unavailable';
import { requireBuyer } from '@/lib/buyer-session';
import { loadCatalog } from '@/lib/catalog-data';
import { ORDER_STATUS_LABEL, type OrderStatus } from '@/lib/order-rules';
import { listOrdersForAccount } from '@/lib/orders';
import { formatCents } from '@/lib/visibility-rules';
import { CustomerNav } from '@/components/site/customer-nav';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Orders',
  robots: { index: false, follow: false },
};

export default async function OrdersPage() {
  const account = await requireBuyer('/account/orders');
  const loaded = await loadCatalog(() => listOrdersForAccount(account.id));
  const list = loaded.data ?? [];
  return (
    <main className="text-foreground">
      <section className="mx-auto max-w-[1080px] px-4 py-10 sm:px-6">
        <div className="ion-page-hero p-7 sm:p-10">
        <Link
          href={account.status === 'guest' ? '/catalog' : '/account'}
          className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-primary"
        >
          <ArrowLeft className="size-4" />{' '}
          {account.status === 'guest' ? 'Catalog' : 'Your account'}
        </Link>
        <p className="ion-kicker mt-6">Manage your account</p>
        <h1 className="ion-heading mt-5 text-4xl sm:text-5xl">
          Your orders
        </h1>
        <div className="relative z-10 mt-7"><CustomerNav current="/account/orders" guest={account.status === 'guest'} /></div>
        </div>
        <div className="ion-panel mt-6 px-6 py-8 sm:px-10">
        {loaded.unavailable ? (
          <div className="mt-10">
            <CatalogUnavailable />
          </div>
        ) : list.length === 0 ? (
          <p className="mt-10 border border-border bg-secondary p-6 text-sm">
            No orders yet.
          </p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-[1.4rem] border border-border">
            {list.map((o) => (
              <li
                key={o.id}
                className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm"
              >
                <Link
                  href={`/account/orders/${o.orderNumber}`}
                  className="font-mono font-semibold text-primary"
                >
                  {o.orderNumber}
                </Link>
                <span className="font-mono text-xs text-muted-foreground">
                  {o.submittedAt.toISOString().slice(0, 10)}
                </span>
                <span>
                  {ORDER_STATUS_LABEL[o.status as OrderStatus] ?? o.status}
                  {o.trackingNumber ? (
                    <span className="block font-mono text-xs text-muted-foreground">
                      {o.carrier} {o.trackingNumber}
                    </span>
                  ) : null}
                </span>
                <span className="font-mono">{formatCents(o.totalCents)}</span>
              </li>
            ))}
          </ul>
        )}
        </div>
      </section>
    </main>
  );
}
