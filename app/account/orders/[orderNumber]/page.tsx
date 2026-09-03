import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, CircleCheck } from 'lucide-react';
import { requireAccount } from '@/lib/account-auth';
import { ORDER_STATUS_LABEL, orderNumberFromParam, type OrderStatus } from '@/lib/order-rules';
import { getOrderForAccount, paymentInstructionsFor } from '@/lib/orders';
import { availablePaymentMethods } from '@/lib/payments';
import { trackingUrl } from '@/lib/tracking';
import { formatCents } from '@/lib/visibility-rules';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Order', robots: { index: false, follow: false } };

type Props = {
  params: Promise<{ orderNumber: string }>;
  searchParams: Promise<{ submitted?: string; payment?: string; error?: string; cancelled?: string; paid?: string }>;
};

export default async function OrderPage({ params, searchParams }: Props) {
  const { orderNumber } = await params;
  const { submitted, payment, error, cancelled } = await searchParams;
  const account = await requireAccount(`/account/orders/${orderNumber}`);
  const number = orderNumberFromParam(orderNumber);
  if (!number) notFound();
  const detail = await getOrderForAccount(account.id, number);
  if (!detail) notFound();
  const { order, items, events } = detail;
  const methods = order.status === 'submitted' ? availablePaymentMethods() : [];
  const instructions = order.status === 'awaiting_payment' ? await paymentInstructionsFor(order) : null;
  const cancellable = order.status === 'submitted' || order.status === 'awaiting_payment';

  return (
    <main className="bg-background text-foreground">
      <section className="mx-auto max-w-3xl px-5 py-16 sm:px-8">
        <Link href="/account/orders" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-primary">
          <ArrowLeft className="size-4" /> Orders
        </Link>
        {submitted && (
          <p role="status" className="mt-6 flex items-center gap-2 border border-border bg-secondary p-4 text-sm">
            <CircleCheck className="size-4 text-primary" />
            {submitted === 'already' ? 'This order was already submitted.' : 'Order submitted. Choose how you will pay below.'}
          </p>
        )}
        {payment === 'set' && (
          <p role="status" className="mt-6 flex items-center gap-2 border border-border bg-secondary p-4 text-sm">
            <CircleCheck className="size-4 text-primary" /> Payment instructions are below and have been emailed to you.
          </p>
        )}
        {cancelled && (
          <p role="status" className="mt-6 border border-border bg-secondary p-4 text-sm">This order has been cancelled.</p>
        )}
        {error && (
          <p role="alert" className="mt-6 border border-destructive/40 bg-secondary p-4 text-sm">
            {error === 'unavailable' ? 'That could not be completed. Try again shortly.' : error}
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
                  {it.lotNumber ? (
                    <>
                      {' · lot '}
                      <Link href={`/lots/${encodeURIComponent(it.lotNumber)}`} className="font-semibold text-primary">
                        {it.lotNumber}
                      </Link>
                    </>
                  ) : null}
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
        {order.returnedAt && (
          <p className="mt-3 text-sm text-muted-foreground">Returned material received {order.returnedAt.toISOString().slice(0, 10)}.</p>
        )}
        {(order.paymentStatus === 'refund_due' || order.paymentStatus === 'refunded') && (
          <p className="mt-2 text-sm text-muted-foreground">
            Refund: {formatCents(order.refundCents ?? 0)} sent{order.refundedAt ? ` (first on ${order.refundedAt.toISOString().slice(0, 10)})` : ''}
            {order.paymentStatus === 'refund_due' ? ' — the remainder is being processed.' : '.'}
          </p>
        )}

        {order.status === 'submitted' && (
          <form method="post" action={`/api/orders/${order.orderNumber}/pay`} className="mt-10 border border-border bg-secondary p-6">
            <h2 className="font-display text-xl font-bold tracking-tight">How will you pay?</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Card processors do not serve research-materials suppliers, so payment is by bank transfer or Bitcoin.
            </p>
            <div className="mt-4 flex flex-col gap-3">
              {methods.map((m, i) => (
                <label key={m.id} className="flex items-start gap-3 text-sm">
                  <input type="radio" name="method" value={m.id} defaultChecked={i === 0} className="mt-1" />
                  <span>
                    <span className="font-semibold">{m.label}</span>
                    <span className="block text-muted-foreground">{m.description}</span>
                  </span>
                </label>
              ))}
            </div>
            <button type="submit" className="mt-5 inline-flex h-11 items-center bg-primary px-5 text-sm font-bold text-primary-foreground hover:bg-primary/90">
              Continue
            </button>
          </form>
        )}

        {instructions && (
          <div className="mt-10 border border-border bg-secondary p-6">
            <h2 className="font-display text-xl font-bold tracking-tight">{instructions.title}</h2>
            <ul className="mt-3 space-y-1 font-mono text-sm">
              {instructions.lines.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
            {instructions.url && (
              <a href={instructions.url} className="mt-4 inline-flex h-11 items-center bg-primary px-5 text-sm font-bold text-primary-foreground hover:bg-primary/90" rel="noreferrer">
                Open payment page
              </a>
            )}
          </div>
        )}

        {cancellable && (
          <form method="post" action={`/api/orders/${order.orderNumber}/cancel`} className="mt-6 flex flex-wrap items-center gap-3 text-sm">
            <input name="reason" placeholder="Reason (optional)" maxLength={300} className="h-10 border border-foreground/20 bg-background px-3 text-sm" />
            <button type="submit" className="h-10 border border-foreground/20 px-4 font-semibold hover:border-destructive hover:text-destructive">
              Cancel order
            </button>
          </form>
        )}

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
                {trackingUrl(order.carrier, order.trackingNumber) && (
                  <>
                    {' · '}
                    <a href={trackingUrl(order.carrier, order.trackingNumber)!} className="font-semibold text-primary" rel="noreferrer">
                      Track
                    </a>
                  </>
                )}
                {order.shippedAt ? <span className="block text-xs text-muted-foreground">Shipped {order.shippedAt.toISOString().slice(0, 10)}</span> : null}
              </p>
            )}
            {order.status === 'cancelled' && order.cancelReason && (
              <p className="mt-3 text-sm text-muted-foreground">Cancelled: {order.cancelReason}</p>
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
