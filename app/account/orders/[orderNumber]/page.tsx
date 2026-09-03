import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, CircleCheck } from 'lucide-react';
import { requireAccount } from '@/lib/account-auth';
import { ORDER_STATUS_LABEL, orderNumberFromParam, type OrderStatus } from '@/lib/order-rules';
import { getOrderForAccount } from '@/lib/orders';
import { formatCents } from '@/lib/visibility-rules';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Order', robots: { index: false, follow: false } };

type Props = { params: Promise<{ orderNumber: string }>; searchParams: Promise<{ submitted?: string }> };

export default async function OrderPage({ params, searchParams }: Props) {
  const { orderNumber } = await params;
  const { submitted } = await searchParams;
  const account = await requireAccount(`/account/orders/${orderNumber}`);
  const number = orderNumberFromParam(orderNumber);
  if (!number) notFound();
  const detail = await getOrderForAccount(account.id, number);
  if (!detail) notFound();
  const { order, items, events } = detail;

  return (
    <main className="bg-background text-foreground">
      <section className="mx-auto max-w-3xl px-5 py-16 sm:px-8">
        <Link href="/account/orders" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-primary">
          <ArrowLeft className="size-4" /> Orders
        </Link>
        {submitted && (
          <p role="status" className="mt-6 flex items-center gap-2 border border-border bg-secondary p-4 text-sm">
            <CircleCheck className="size-4 text-primary" />
            {submitted === 'already' ? 'This order was already submitted.' : 'Order submitted. Payment instructions follow in the next stage of the build.'}
          </p>
        )}
        <p className="mt-6 font-mono text-xs text-muted-foreground">
          {ORDER_STATUS_LABEL[order.status as OrderStatus] ?? order.status} &middot; submitted {order.submittedAt.toISOString().slice(0, 10)}
        </p>
        <h1 className="mt-2 font-display text-4xl font-extrabold tracking-[-0.05em]">{order.orderNumber}</h1>

        <ul className="mt-10 divide-y divide-border border border-border">
          {items.map((it) => (
            <li key={it.id} className="grid gap-2 p-4 text-sm sm:grid-cols-[1fr_auto_auto] sm:items-center">
              <div>
                <p className="font-semibold">
                  {it.productName} <span className="font-mono text-xs text-muted-foreground">{it.sku}</span>
                </p>
                <p className="font-mono text-xs text-muted-foreground">
                  {it.packSize} &middot; {it.presentation}
                  {it.lotNumber ? ` · lot ${it.lotNumber}` : ''}
                </p>
              </div>
              <span className="font-mono text-xs">{it.quantity} × {formatCents(it.unitPriceCents)}</span>
              <span className="font-mono">{formatCents(it.lineTotalCents)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-right font-mono text-sm">
          Total <span className="font-semibold">{formatCents(order.totalCents)}</span>
        </p>

        <div className="mt-10 grid gap-8 sm:grid-cols-2">
          <div>
            <p className="utility-label text-primary">Ships to</p>
            <p className="mt-3 text-sm leading-6">
              {order.consigneeName}
              {order.consigneeInstitution ? `, ${order.consigneeInstitution}` : ''}
              <br />
              {[order.shipToLine1, order.shipToLine2, order.shipToCity, order.shipToRegion, order.shipToPostalCode, order.shipToCountry].filter(Boolean).join(', ')}
            </p>
            {order.trackingNumber && (
              <p className="mt-3 font-mono text-sm">
                {order.carrier} {order.trackingNumber}
              </p>
            )}
          </div>
          <div>
            <p className="utility-label text-primary">History</p>
            <ul className="mt-3 space-y-2 text-sm">
              {events.map((e) => (
                <li key={e.id}>
                  <span className="font-mono text-xs text-muted-foreground">{e.createdAt.toISOString().slice(0, 10)}</span>{' '}
                  {ORDER_STATUS_LABEL[e.toStatus as OrderStatus] ?? e.toStatus}
                  {e.note ? <span className="text-muted-foreground"> — {e.note}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        </div>
        {order.customerNote && (
          <p className="mt-8 border border-border bg-secondary p-4 text-sm">
            <span className="font-semibold">Your note:</span> {order.customerNote}
          </p>
        )}
      </section>
    </main>
  );
}
