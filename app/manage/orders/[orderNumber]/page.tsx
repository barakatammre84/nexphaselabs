import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AlertCircle, ArrowLeft, CircleCheck } from 'lucide-react';
import { ORDER_STATUS_LABEL, orderNumberFromParam, type OrderStatus } from '@/lib/order-rules';
import { pickableLots, type PickableLot } from '@/lib/fulfilment';
import { getOrderByNumber } from '@/lib/orders';
import { canFulfil, canVerifyAccounts, requireStaff } from '@/lib/staff-auth';
import { trackingUrl } from '@/lib/tracking';
import { formatCents } from '@/lib/visibility-rules';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Order', robots: { index: false, follow: false } };

type Props = {
  params: Promise<{ orderNumber: string }>;
  searchParams: Promise<{ paid?: string; error?: string; shipped?: string; fulfilling?: string; cancelled?: string }>;
};

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="grid gap-1 border-b border-border py-3 sm:grid-cols-[200px_1fr] sm:gap-6">
      <dt className="text-sm font-semibold text-muted-foreground">{label}</dt>
      <dd className="break-words text-sm leading-6">{value || <span className="text-muted-foreground">—</span>}</dd>
    </div>
  );
}

export default async function ManageOrderPage({ params, searchParams }: Props) {
  const { orderNumber } = await params;
  const { paid, error, shipped, fulfilling, cancelled } = await searchParams;
  const staff = await requireStaff(`/manage/orders/${orderNumber}`);
  const number = orderNumberFromParam(orderNumber);
  if (!number) notFound();
  const detail = await getOrderByNumber(number);
  if (!detail) notFound();
  const { order, items, events } = detail;
  const lotsByProduct = new Map<string, PickableLot[]>();
  if (order.status === 'fulfilling') {
    for (const code of new Set(items.map((it) => it.productCode))) lotsByProduct.set(code, await pickableLots(code));
  }

  return (
    <main className="bg-background text-foreground">
      <section className="mx-auto max-w-[1200px] px-5 py-12 sm:px-8 lg:px-12">
        <Link href="/manage/orders" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-primary">
          <ArrowLeft className="size-4" /> Orders
        </Link>
        {paid && (
          <p role="status" className="mt-6 flex items-center gap-2 border border-border bg-secondary p-4 text-sm">
            <CircleCheck className="size-4 text-primary" /> Payment recorded. The customer has been emailed.
          </p>
        )}
        {fulfilling && (
          <p role="status" className="mt-6 flex items-center gap-2 border border-border bg-secondary p-4 text-sm">
            <CircleCheck className="size-4 text-primary" /> Fulfilment started. Choose a released lot for each line and record the shipment.
          </p>
        )}
        {cancelled && (
          <p role="status" className="mt-6 border border-border bg-secondary p-4 text-sm">Order cancelled. The customer has been emailed the reason.</p>
        )}
        {shipped && (
          <p role="status" className="mt-6 flex items-center gap-2 border border-border bg-secondary p-4 text-sm">
            <CircleCheck className="size-4 text-primary" /> Shipment recorded in the movement ledger. The customer has been emailed the tracking number and lot links.
          </p>
        )}
        {error && (
          <p role="alert" className="mt-6 flex items-center gap-2 border border-destructive/40 bg-secondary p-4 text-sm">
            <AlertCircle className="size-4 text-destructive" /> {error === 'unavailable' ? 'That could not be recorded. Try again shortly.' : error}
          </p>
        )}
        <p className="mt-6 font-mono text-xs text-muted-foreground">
          {ORDER_STATUS_LABEL[order.status as OrderStatus] ?? order.status} &middot; submitted {order.submittedAt.toISOString().slice(0, 10)} &middot; {order.channel}
        </p>
        <h1 className="mt-2 font-display text-4xl font-extrabold tracking-[-0.05em]">{order.orderNumber}</h1>

        <div className="mt-10 grid gap-12 lg:grid-cols-2">
          <div>
            <h2 className="utility-label text-primary">Lines</h2>
            <ul className="mt-4 divide-y divide-border border border-border">
              {items.map((it) => (
                <li key={it.id} className="grid gap-1 p-4 text-sm sm:grid-cols-[1fr_auto]">
                  <div>
                    <p className="font-semibold">
                      {it.productName} <span className="font-mono text-xs text-muted-foreground">{it.sku}</span>
                    </p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {it.quantity} × {it.packSize} &middot; {it.presentation}
                      {it.lotNumber ? ` · lot ${it.lotNumber}` : ' · lot not yet assigned'}
                    </p>
                  </div>
                  <span className="font-mono">{formatCents(it.lineTotalCents)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-right font-mono text-sm">
              Total <span className="font-semibold">{formatCents(order.totalCents)}</span> &middot; {order.priceTier} pricing
            </p>

            <h2 className="mt-10 utility-label text-primary">Ship to</h2>
            <dl className="mt-4 border-t border-border">
              <Row label="Consignee" value={order.consigneeName} />
              <Row label="Institution" value={order.consigneeInstitution} />
              <Row label="Address" value={[order.shipToLine1, order.shipToLine2, order.shipToCity, order.shipToRegion, order.shipToPostalCode, order.shipToCountry].filter(Boolean).join(', ')} />
              <Row label="Phone" value={order.shipToPhone} />
              <Row label="Customer note" value={order.customerNote} />
            </dl>
          </div>
          <div>
            <h2 className="utility-label text-primary">Payment</h2>
            <dl className="mt-4 border-t border-border">
              <Row label="Method" value={order.paymentMethod} />
              <Row label="Reference" value={order.paymentRef} />
              <Row label="Status" value={order.paymentStatus === 'refund_due' ? 'Refund due (not yet returned)' : order.paymentStatus} />
              <Row label="Paid at" value={order.paidAt ? order.paidAt.toISOString().slice(0, 10) : null} />
            </dl>
            {order.status === 'awaiting_payment' && (
              canVerifyAccounts(staff) ? (
                <form method="post" action={`/api/manage/orders/${order.orderNumber}/paid`} className="mt-5 flex flex-col gap-3 border border-border bg-secondary p-5">
                  <p className="text-sm font-semibold">Record payment received</p>
                  <label className="flex flex-col gap-1.5 text-sm">
                    Bank or provider reference
                    <input name="reference" className="h-11 border border-foreground/20 bg-background px-3 font-mono text-sm" />
                  </label>
                  <button type="submit" className="inline-flex h-11 w-fit items-center bg-primary px-5 text-sm font-bold text-primary-foreground hover:bg-primary/90">
                    Mark paid
                  </button>
                  <p className="text-xs text-muted-foreground">Only after the funds have cleared. This moves the order to paid and emails the customer.</p>
                </form>
              ) : (
                <p className="mt-5 border border-border bg-secondary p-4 text-sm text-muted-foreground">Only an admin can record a payment.</p>
              )
            )}

            <h2 className="mt-10 utility-label text-primary">Fulfilment</h2>
            {order.status === 'paid' && (
              canFulfil(staff) ? (
                <form method="post" action={`/api/manage/orders/${order.orderNumber}/fulfil`} className="mt-4">
                  <button type="submit" className="inline-flex h-11 items-center bg-primary px-5 text-sm font-bold text-primary-foreground hover:bg-primary/90">
                    Start fulfilment
                  </button>
                </form>
              ) : (
                <p className="mt-4 border border-border bg-secondary p-4 text-sm text-muted-foreground">Only admin and ops roles pick and ship.</p>
              )
            )}
            {order.status === 'fulfilling' && canFulfil(staff) && (
              <form method="post" action={`/api/manage/orders/${order.orderNumber}/ship`} className="mt-4 flex flex-col gap-4 border border-border bg-secondary p-5">
                <p className="text-sm font-semibold">Record shipment</p>
                {items.map((it) => {
                  const options = lotsByProduct.get(it.productCode) ?? [];
                  return (
                    <label key={it.id} className="flex flex-col gap-1.5 text-sm">
                      <span>
                        {it.productName} &middot; {it.quantity} × {it.packSize} <span className="font-mono text-xs text-muted-foreground">{it.sku}</span>
                      </span>
                      <select name={`lot_${it.id}`} required className="h-11 border border-foreground/20 bg-background px-3 font-mono text-sm">
                        <option value="">Choose a released lot…</option>
                        {options.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.lotNumber} — {l.quantityRemaining} on hand{l.retestDate ? ` · retest ${l.retestDate.toISOString().slice(0, 10)}` : ''}
                          </option>
                        ))}
                      </select>
                      {options.length === 0 && <span className="text-xs text-destructive">No released lot with quantity on hand for {it.productCode}.</span>}
                    </label>
                  );
                })}
                <div className="grid gap-4 sm:grid-cols-3">
                  <label className="flex flex-col gap-1.5 text-sm">
                    Carrier
                    <input name="carrier" required className="h-11 border border-foreground/20 bg-background px-3 text-sm" />
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm">
                    Tracking number
                    <input name="tracking" required className="h-11 border border-foreground/20 bg-background px-3 font-mono text-sm" />
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm">
                    Actual ship date
                    <input name="shippedOn" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className="h-11 border border-foreground/20 bg-background px-3 font-mono text-sm" />
                  </label>
                </div>
                <label className="flex flex-col gap-1.5 text-sm">
                  Note (optional)
                  <input name="note" maxLength={300} className="h-11 border border-foreground/20 bg-background px-3 text-sm" />
                </label>
                <button type="submit" className="inline-flex h-11 w-fit items-center bg-primary px-5 text-sm font-bold text-primary-foreground hover:bg-primary/90">
                  Record shipment
                </button>
                <p className="text-xs leading-5 text-muted-foreground">
                  Writes one movement per lot with the consignee and this ship date, decrements each lot, and emails the customer.
                </p>
              </form>
            )}
            {order.status === 'shipped' && (
              <dl className="mt-4 border-t border-border">
                <Row label="Carrier" value={order.carrier} />
                <Row label="Tracking" value={order.trackingNumber} />
                <Row label="Shipped on" value={order.shippedAt ? order.shippedAt.toISOString().slice(0, 10) : null} />
                {trackingUrl(order.carrier, order.trackingNumber) && (
                  <div className="py-3">
                    <a href={trackingUrl(order.carrier, order.trackingNumber)!} className="text-sm font-semibold text-primary" rel="noreferrer">
                      Track shipment
                    </a>
                  </div>
                )}
              </dl>
            )}
            {(order.status === 'submitted' || order.status === 'awaiting_payment' || order.status === 'paid' || order.status === 'fulfilling') && canVerifyAccounts(staff) && (
              <form method="post" action={`/api/manage/orders/${order.orderNumber}/cancel`} className="mt-6 flex flex-wrap items-center gap-3 text-sm">
                <input name="reason" required maxLength={300} placeholder="Reason sent to the customer" className="h-10 min-w-[18rem] border border-foreground/20 bg-background px-3 text-sm" />
                <button type="submit" className="h-10 border border-foreground/20 px-4 font-semibold hover:border-destructive hover:text-destructive">
                  Cancel order
                </button>
              </form>
            )}

            <h2 className="mt-10 utility-label text-primary">History</h2>
            <ul className="mt-4 divide-y divide-border border border-border text-sm">
              {events.map((e) => (
                <li key={e.id} className="p-3">
                  <span className="font-mono text-xs">{e.createdAt.toISOString().slice(0, 10)}</span> &middot; {e.fromStatus} &rarr; <span className="font-semibold">{e.toStatus}</span> &middot; {e.actor}
                  {e.note && <p className="mt-1 text-muted-foreground">{e.note}</p>}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </main>
  );
}
