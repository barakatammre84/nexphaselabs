import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, CircleCheck } from 'lucide-react';
import { OrderHelp } from '@/components/site/order-help';
import { orderNextStep } from '@/lib/workflow-display';
import { currentDocument } from '@/lib/issued-documents';
import { getBuyer } from '@/lib/buyer-session';
import { cookies } from 'next/headers';
import { NOTICE_COOKIE, readNotice } from '@/lib/notice';
import { recoveredOrder, RECOVERY_COOKIE } from '@/lib/guest-order-recovery';
import { OrderRecoveryCode } from '@/components/site/order-recovery-code';
import { OrderNotOpenHere } from '@/components/site/order-not-open-here';
import { openCheckoutEnabled } from '@/lib/site-config';
import {
  ORDER_STATUS_LABEL,
  orderNumberFromParam,
  type OrderStatus,
} from '@/lib/order-rules';
import { getOrderForAccount } from '@/lib/order-reads';
import {
  availablePaymentMethods,
  buyerSimulationEnabled,
} from '@/lib/payments';
import { trackingUrl } from '@/lib/tracking';
import { formatCents } from '@/lib/visibility-rules';
import { OrderProgress } from '@/components/site/order-progress';
import { ZellePaymentPanel } from '@/components/site/zelle-payment-panel';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Order',
  robots: { index: false, follow: false },
};

type Props = {
  params: Promise<{ orderNumber: string }>;
  searchParams: Promise<{
    submitted?: string;
    payment?: string;
    error?: string;
    cancelled?: string;
    paid?: string;
    zelle?: string;
  }>;
};

export default async function OrderPage({ params, searchParams }: Props) {
  const { orderNumber } = await params;
  const { submitted, payment, error, cancelled, paid, zelle } = await searchParams;
  // Fixed words for known codes; a refusal's own words come from the cookie its route set,
  // never from the link (lib/notice.ts). Anything else in `error` shows nothing.
  const errorText =
    error === 'unavailable'
      ? 'That could not be completed. Try again shortly.'
      : error === 'notice'
        ? (readNotice((await cookies()).get(NOTICE_COOKIE)?.value) ??
          'That could not be completed. Try again shortly.')
        : null;
  const account = await getBuyer();
  const number = orderNumberFromParam(orderNumber);
  if (!number) notFound();
  const owned = account ? await getOrderForAccount(account.id, number) : null;
  const detail =
    owned ??
    (await recoveredOrder(
      (await cookies()).get(RECOVERY_COOKIE)?.value,
      number,
    ));
  if (!detail) {
    // The same answer whether or not the order exists, so it confirms nothing, but a
    // customer following an order email on another device learns how to open it.
    return <OrderNotOpenHere orderNumber={number} openCheckout={openCheckoutEnabled()} />;
  }
  const { order, items, events } = detail;
  const invoice = await currentDocument('invoice', 'order', order.orderNumber);
  const methods =
    owned && order.status === 'submitted' ? availablePaymentMethods() : [];
  const instructions =
    owned && order.status === 'awaiting_payment'
      ? await (await import('@/lib/orders')).paymentInstructionsFor(order)
      : null;
  const zelleClaim =
    owned && order.paymentMethod === 'zelle'
      ? await (await import('@/lib/zelle')).zelleClaimForOrder(order.id)
      : null;
  const cancellable =
    Boolean(owned) &&
    (order.status === 'submitted' || order.status === 'awaiting_payment') &&
    !zelleClaim;
  // A recovery code opens the order read-only. Payment is chosen and its instructions
  // shown only in the browser that placed the order, so this viewer is told where to go.
  const payElsewhere =
    !owned && (order.status === 'submitted' || order.status === 'awaiting_payment');

  return (
    <main className="bg-background text-foreground">
      <section className="mx-auto max-w-3xl px-5 py-16 sm:px-8">
        <Link
          href="/account/orders"
          className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-primary"
        >
          <ArrowLeft className="size-4" /> Orders
        </Link>
        {submitted && (
          <p
            role="status"
            className="mt-6 flex items-center gap-2 border border-border bg-secondary p-4 text-sm"
          >
            <CircleCheck className="size-4 text-primary" />
            {submitted === 'already'
              ? 'This order was already submitted.'
              : 'Order submitted. Choose how you will pay below.'}
          </p>
        )}
        {payment === 'set' && (
          <p
            role="status"
            className="mt-6 flex items-center gap-2 border border-border bg-secondary p-4 text-sm"
          >
            <CircleCheck className="size-4 text-primary" /> Payment method
            saved. Use the instructions below; an email notification has been
            queued.
          </p>
        )}
        {zelle === 'claimed' && zelleClaim && (
          <p
            role="status"
            className="mt-6 flex items-center gap-2 border border-border bg-secondary p-4 text-sm"
          >
            <CircleCheck className="size-4 text-primary" /> Payment reported sent. We are checking Chase; do not send it again.
          </p>
        )}
        {paid === 'simulated' &&
          order.paymentStatus === 'paid' &&
          order.paymentRef === `TEST-${order.orderNumber}` &&
          buyerSimulationEnabled() && (
            <p
              role="status"
              className="mt-6 rounded-lg border border-border bg-secondary p-5 text-sm"
            >
              Test purchase complete. Simulated payment recorded; no money was
              charged.
            </p>
          )}
        {account?.status === 'guest' && owned && (
          <p className="mt-5 text-sm text-muted-foreground">
            Guest order · save this order number and return in this browser. No
            account or email verification is needed.
          </p>
        )}
        {account?.status === 'guest' && owned && (
          <OrderRecoveryCode number={number} />
        )}
        {!owned && (
          <p className="mt-5 border border-border p-4 text-sm">
            Read-only access to this order. Use your original browser or contact
            support for payment or changes. This access expires within 24 hours.
          </p>
        )}
        {cancelled && (
          <p
            role="status"
            className="mt-6 border border-border bg-secondary p-4 text-sm"
          >
            This order has been cancelled.
          </p>
        )}
        {errorText && (
          <p
            role="alert"
            className="mt-6 border border-destructive/40 bg-secondary p-4 text-sm"
          >
            {errorText}
          </p>
        )}
        <p className="mt-6 font-mono text-xs text-muted-foreground">
          {ORDER_STATUS_LABEL[order.status as OrderStatus] ?? order.status}{' '}
          &middot; submitted {order.submittedAt.toISOString().slice(0, 10)}
        </p>
        <h1 className="mt-2 break-words font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          {order.orderNumber}
        </h1>
        <OrderProgress
          status={order.status}
          delivered={Boolean(order.deliveredAt)}
        />

        <div className="mt-6 rounded-lg bg-secondary p-5">
          <h2 className="font-semibold">What happens next</h2>
          <p className="mt-2 text-sm leading-6">
            {payElsewhere
              ? 'This order is waiting for payment. Preparation begins after payment is confirmed.'
              : order.status === 'awaiting_payment' && !instructions
                ? 'Payment instructions are unavailable. Contact order support below before sending payment.'
                : orderNextStep(order)}
          </p>
          {order.status === 'submitted' && methods.length > 0 && (
            <a href="#order-payment" className="action-primary mt-4">
              Choose payment method
            </a>
          )}
        </div>
        <nav aria-label="Order sections" className="mt-5 flex flex-wrap gap-3">
          <a href="#order-materials" className="action-secondary">
            Materials & lot records
          </a>
          {cancellable && (
            <a href="#order-payment" className="action-secondary">
              Payment
            </a>
          )}
          <a href="#order-delivery" className="action-secondary">
            Delivery & history
          </a>
        </nav>
        <h2
          id="order-materials"
          className="mt-10 font-display text-xl font-semibold"
        >
          Materials & lot records
        </h2>
        <ul className="mt-4 divide-y divide-border border border-border">
          {items.map((it) => (
            <li
              key={it.id}
              className="grid gap-2 p-4 text-sm sm:grid-cols-[1fr_auto_auto] sm:items-center"
            >
              <div>
                <p className="font-semibold">
                  {it.productName}{' '}
                  <span className="font-mono text-xs text-muted-foreground">
                    {it.sku}
                  </span>
                </p>
                <p className="font-mono text-xs text-muted-foreground">
                  {it.packSize} &middot; {it.presentation}
                  {it.lotNumber ? (
                    <>
                      {' · lot '}
                      <Link
                        href={`/lots/${encodeURIComponent(it.lotNumber)}`}
                        className="font-semibold text-primary"
                      >
                        {it.lotNumber}
                      </Link>
                    </>
                  ) : null}
                </p>
                {it.coaDocumentId || it.sdsDocumentId ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Documents as shipped:{' '}
                    {it.coaDocumentId ? (
                      <a
                        href={`/api/orders/${encodeURIComponent(order.orderNumber)}/items/${encodeURIComponent(it.id)}/documents/coa`}
                        className="font-semibold text-primary"
                      >
                        Certificate of analysis
                      </a>
                    ) : null}
                    {it.coaDocumentId && it.sdsDocumentId ? ' · ' : null}
                    {it.sdsDocumentId ? (
                      <a
                        href={`/api/orders/${encodeURIComponent(order.orderNumber)}/items/${encodeURIComponent(it.id)}/documents/sds`}
                        className="font-semibold text-primary"
                      >
                        Safety data sheet
                      </a>
                    ) : null}
                    {it.coaSha256 ? (
                      <span className="block font-mono text-[10px] text-muted-foreground/80">
                        COA SHA-256 {it.coaSha256.slice(0, 16)}… — the copy served here is the one recorded at dispatch, even if the lot record is later updated.
                      </span>
                    ) : null}
                  </p>
                ) : null}
              </div>
              <span className="font-mono text-xs">
                {it.quantity} × {formatCents(it.unitPriceCents)}
              </span>
              <span className="font-mono">
                {formatCents(it.lineTotalCents)}
              </span>
            </li>
          ))}
        </ul>
        <dl className="ml-auto mt-5 max-w-xs space-y-2 text-sm">
          <div className="flex justify-between gap-5">
            <dt className="text-muted-foreground">Materials</dt>
            <dd className="font-mono">{formatCents(order.subtotalCents)}</dd>
          </div>
          <div className="flex justify-between gap-5">
            <dt className="text-muted-foreground">
              Shipping
              {order.shippingService ? ` · ${order.shippingService}` : ''}
            </dt>
            <dd className="font-mono">{formatCents(order.shippingCents)}</dd>
          </div>
          <div className="flex justify-between gap-5">
            <dt className="text-muted-foreground">Tax</dt>
            <dd className="font-mono">{formatCents(order.taxCents)}</dd>
          </div>
          <div className="flex justify-between gap-5 border-t border-border pt-3 font-semibold">
            <dt>Total</dt>
            <dd className="font-mono">{formatCents(order.totalCents)}</dd>
          </div>
        </dl>
        {order.returnedAt && (
          <p className="mt-3 text-sm text-muted-foreground">
            Returned material received{' '}
            {order.returnedAt.toISOString().slice(0, 10)}.
          </p>
        )}
        {(order.paymentStatus === 'refund_due' ||
          order.paymentStatus === 'refunded') && (
          <p className="mt-2 text-sm text-muted-foreground">
            Refund: {formatCents(order.refundCents ?? 0)} sent
            {order.refundedAt
              ? ` (first on ${order.refundedAt.toISOString().slice(0, 10)})`
              : ''}
            {order.paymentStatus === 'refund_due'
              ? ' — the remainder is being processed.'
              : '.'}
          </p>
        )}

        {cancellable && (
          <h2
            id="order-payment"
            className="mt-10 font-display text-xl font-semibold"
          >
            Payment
          </h2>
        )}
        {payElsewhere && (
          <div className="mt-5 border border-border bg-secondary p-6">
            <h2 className="font-display text-xl font-bold tracking-tight">
              Payment
            </h2>
            <p className="mt-2 text-sm leading-6">
              To pay, open this order in the browser that placed it, or contact
              order support below. Do not send payment without instructions.
            </p>
          </div>
        )}
        {owned && order.status === 'submitted' && (
          <form
            method="post"
            action={`/api/orders/${order.orderNumber}/pay`}
            className="mt-5 border border-border bg-secondary p-6"
          >
            <h2 className="font-display text-xl font-bold tracking-tight">
              How will you pay?
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Choose from the payment methods currently available for this
              order.
            </p>
            <div className="mt-4 flex flex-col gap-3">
              {methods.map((m, i) => (
                <label key={m.id} className="shipping-choice text-sm">
                  <input
                    type="radio"
                    name="method"
                    value={m.id}
                    defaultChecked={i === 0}
                    className="mt-1"
                  />
                  <span>
                    <span className="font-semibold">{m.label}</span>
                    <span className="block text-muted-foreground">
                      {m.description}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            {methods.length === 0 && (
              <p role="status" className="mt-4 text-sm">
                No payment method is currently available. Contact order support
                below; do not send payment without instructions.
              </p>
            )}
            <button
              disabled={methods.length === 0}
              type="submit"
              className="mt-5 inline-flex h-11 items-center bg-primary px-5 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              Get payment instructions
            </button>
          </form>
        )}

        {invoice && (
          <div className="mt-8 rounded-lg border border-border p-6">
            <h2 className="font-display text-xl font-semibold">Invoice</h2>
            <p className="mt-2 text-sm">
              {invoice.documentNumber} · issued{' '}
              {invoice.issuedAt.toISOString().slice(0, 10)}
            </p>
            <a
              className="action-secondary mt-4"
              href={`/api/orders/${encodeURIComponent(order.orderNumber)}/invoice`}
            >
              Download invoice
            </a>
          </div>
        )}
        {instructions?.method === 'zelle' && instructions.zelle ? (
          <ZellePaymentPanel
            details={instructions.zelle}
            claimAction={`/api/orders/${order.orderNumber}/zelle-claim`}
            claimedAt={zelleClaim?.claimedAt.toISOString() ?? null}
          />
        ) : instructions ? (
          <div className="mt-10 border border-border bg-secondary p-6">
            <h2 className="font-display text-xl font-bold tracking-tight">
              {instructions.title}
            </h2>
            <ul className="mt-3 space-y-1 font-mono text-sm">
              {instructions.lines.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
            {instructions.url && (
              <a
                href={instructions.url}
                className="mt-4 inline-flex h-11 items-center bg-primary px-5 text-sm font-bold text-primary-foreground hover:bg-primary/90"
                rel="noreferrer"
              >
                Open payment page
              </a>
            )}
          </div>
        ) : null}

        {zelleClaim && order.status === 'awaiting_payment' && (
          <p className="mt-5 border-l-2 border-primary bg-secondary px-4 py-3 text-sm leading-6">
            We will not prepare or ship the order until the payment is matched. Contact order support if the bank shows a problem; do not create a second payment.
          </p>
        )}

        {owned &&
          buyerSimulationEnabled() &&
          order.status === 'awaiting_payment' &&
          order.paymentMethod === 'invoice' &&
          order.paymentRef === `TEST-${order.orderNumber}` && (
            <form
              method="post"
              action={`/api/orders/${order.orderNumber}/simulate-payment`}
              className="mt-6 rounded-lg border border-primary bg-secondary p-6"
            >
              <h2 className="font-display text-xl font-semibold">
                Finish your test purchase
              </h2>
              <p className="mt-2 text-sm leading-6">
                No card or bank details needed. This records a simulated payment
                in staging only.
              </p>
              <button type="submit" className="action-primary mt-5">
                Complete simulated payment
              </button>
            </form>
          )}
        {cancellable && (
          <details className="mt-6 rounded-md border border-border p-4">
            <summary className="cursor-pointer py-2 text-sm font-semibold">
              Cancel this order
            </summary>
            <p className="mt-2 text-sm text-muted-foreground">
              This closes the order. If you have already sent payment, contact
              support before cancelling.
            </p>
            <form
              method="post"
              action={`/api/orders/${order.orderNumber}/cancel`}
              className="mt-4 flex flex-wrap items-center gap-3 text-sm"
            >
              <input
                aria-label="Cancellation reason (optional)"
                name="reason"
                placeholder="Reason (optional)"
                maxLength={300}
                className="h-10 border border-foreground/20 bg-background px-3 text-sm"
              />
              <button
                type="submit"
                className="h-10 border border-foreground/20 px-4 font-semibold hover:border-destructive hover:text-destructive"
              >
                Confirm cancellation
              </button>
            </form>
          </details>
        )}

        <h2
          id="order-delivery"
          className="mt-10 font-display text-xl font-semibold"
        >
          Delivery & history
        </h2>
        <div className="mt-5 grid gap-8 sm:grid-cols-2">
          <div>
            <p className="utility-label text-primary">Ships to</p>
            <p className="mt-3 text-sm leading-6">
              {order.consigneeName}
              {order.consigneeInstitution
                ? `, ${order.consigneeInstitution}`
                : ''}
              <br />
              {[
                order.shipToLine1,
                order.shipToLine2,
                order.shipToCity,
                order.shipToRegion,
                order.shipToPostalCode,
                order.shipToCountry,
              ]
                .filter(Boolean)
                .join(', ')}
            </p>
            {order.trackingNumber && (
              <p className="mt-3 font-mono text-sm">
                {order.carrier} {order.trackingNumber}
                {trackingUrl(order.carrier, order.trackingNumber) && (
                  <>
                    {' · '}
                    <a
                      href={trackingUrl(order.carrier, order.trackingNumber)!}
                      className="font-semibold text-primary"
                      rel="noreferrer"
                    >
                      Track
                    </a>
                  </>
                )}
                {order.shippedAt ? (
                  <span className="block text-xs text-muted-foreground">
                    Shipped {order.shippedAt.toISOString().slice(0, 10)}
                  </span>
                ) : null}
                {order.deliveredAt ? (
                  <span className="block text-xs font-semibold text-primary">
                    Delivered {order.deliveredAt.toISOString().slice(0, 10)}
                  </span>
                ) : null}
              </p>
            )}
            {order.status === 'cancelled' && order.cancelReason && (
              <p className="mt-3 text-sm text-muted-foreground">
                Cancelled: {order.cancelReason}
              </p>
            )}
          </div>
          <div>
            <p className="utility-label text-primary">History</p>
            <ul className="mt-3 space-y-2 text-sm">
              {events.map((e) => (
                <li key={e.id}>
                  <span className="font-mono text-xs text-muted-foreground">
                    {e.createdAt.toISOString().slice(0, 10)}
                  </span>{' '}
                  {ORDER_STATUS_LABEL[e.toStatus as OrderStatus] ?? e.toStatus}
                  {e.note ? (
                    <span className="text-muted-foreground"> — {e.note}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        </div>
        {order.customerNote && (
          <p className="mt-8 border border-border bg-secondary p-4 text-sm">
            <span className="font-semibold">Your note:</span>{' '}
            {order.customerNote}
          </p>
        )}
        <OrderHelp orderNumber={order.orderNumber} />
      </section>
    </main>
  );
}
