import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { CatalogUnavailable } from '@/components/site/catalog-unavailable';
import { requireBuyer } from '@/lib/buyer-session';
import { loadCatalog } from '@/lib/catalog-data';
import { ORDER_STATUS_LABEL, type OrderStatus } from '@/lib/order-rules';
import { listOrdersForAccount } from '@/lib/orders';
import { formatCents } from '@/lib/visibility-rules';

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
    <main className="bg-background text-foreground">
      <section className="mx-auto max-w-3xl px-5 py-16 sm:px-8">
        <Link
          href={account.status === 'guest' ? '/catalog' : '/account'}
          className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-primary"
        >
          <ArrowLeft className="size-4" />{' '}
          {account.status === 'guest' ? 'Catalog' : 'Your account'}
        </Link>
        <h1 className="mt-6 font-display text-4xl font-extrabold tracking-[-0.05em]">
          Orders
        </h1>
        {loaded.unavailable ? (
          <div className="mt-10">
            <CatalogUnavailable />
          </div>
        ) : list.length === 0 ? (
          <p className="mt-10 border border-border bg-secondary p-6 text-sm">
            No orders yet.
          </p>
        ) : (
          <ul className="mt-10 divide-y divide-border border border-border">
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
      </section>
    </main>
  );
}
