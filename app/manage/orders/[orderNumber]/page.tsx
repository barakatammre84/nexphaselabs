import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  CircleCheck,
  Download,
  FileText,
  Landmark,
} from 'lucide-react';
import {
  ORDER_STATUS_LABEL,
  orderNumberFromParam,
  type OrderStatus,
  PAYMENT_STATUS_LABEL,
  refundAllowed,
  refundDue,
  returnAllowed,
} from '@/lib/order-rules';
import { pickableLots, type PickableLot } from '@/lib/fulfilment';
import { orderNextStep } from '@/lib/workflow-display';
import { getOrderByNumber } from '@/lib/orders';
import { contactVerification } from '@/lib/order-contact-verification';
import { previewInvoice } from '@/lib/invoice';
import { previewPackingSlip } from '@/lib/packing-slip';
import { documentHistory } from '@/lib/issued-documents';
import { canFulfil, canVerifyAccounts, requireStaff } from '@/lib/staff-auth';
import { manualPaymentRecording } from '@/lib/manual-payment-rules';
import { zelleMode } from '@/lib/zelle-config';
import { trackingUrl } from '@/lib/tracking';
import { formatCents } from '@/lib/visibility-rules';
import { reservationEligibility } from '@/lib/inventory-reservations';
import { checkoutParcelForPacks } from '@/lib/checkout-quotes';
import { OrderShippingDesk } from '@/components/manage/order-shipping-desk';
import {
  currentShippingLabel,
  shippingLabelHistory,
} from '@/lib/shipping-labels';
import { shippingOriginOptions } from '@/lib/shipping-provider';
import { assignableStaff } from '@/lib/operational-controls';
import { OrderHandoffForm } from '@/components/manage/order-handoff-form';
import { handoffOrderAction, resendContactVerificationAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Order',
  robots: { index: false, follow: false },
};

type Props = {
  params: Promise<{ orderNumber: string }>;
  searchParams: Promise<{
    paid?: string;
    error?: string;
    shipped?: string;
    delivered?: string;
    fulfilling?: string;
    cancelled?: string;
    refunded?: string;
    returned?: string;
    invoiced?: string;
    slipped?: string;
  }>;
};

const ORDER_ERROR: Record<string, string> = {
  unavailable: 'That could not be recorded. Try again shortly.',
  badform: 'The form could not be read.',
  invoiceblocked:
    'The invoice cannot be issued. The outstanding items are listed under Invoice below.',
  invoicefailed:
    'The invoice could not be issued. Nothing was recorded. Try again shortly.',
  slipblocked:
    'The packing slip cannot be issued. The outstanding items are listed under Packing slip below.',
  slipfailed:
    'The packing slip could not be issued. Nothing was recorded. Try again shortly.',
};

function Row({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="grid gap-1 border-b border-border py-3 sm:grid-cols-[200px_1fr] sm:gap-6">
      <dt className="text-sm font-semibold text-muted-foreground">{label}</dt>
      <dd className="break-words text-sm leading-6">
        {value || <span className="text-muted-foreground">—</span>}
      </dd>
    </div>
  );
}

export default async function ManageOrderPage({ params, searchParams }: Props) {
  const { orderNumber } = await params;
  const {
    paid,
    error,
    shipped,
    delivered,
    fulfilling,
    cancelled,
    refunded,
    returned,
    invoiced,
    slipped,
  } = await searchParams;
  const staff = await requireStaff(`/manage/orders/${orderNumber}`);
  const number = orderNumberFromParam(orderNumber);
  if (!number) notFound();
  const detail = await getOrderByNumber(number);
  if (!detail) notFound();
  const { order, items, events } = detail;
  const manualPayment = manualPaymentRecording(order.paymentMethod, zelleMode());
  const zelle = order.paymentMethod === 'zelle' ? await import('@/lib/zelle') : null;
  const [allocation, verification, zelleClaim, zelleReceipts] = await Promise.all([
    reservationEligibility(order.id),
    contactVerification(order.id),
    zelle ? zelle.zelleClaimForOrder(order.id) : null,
    zelle ? zelle.zelleReceiptsForOrder(order.id, 5) : [],
  ]);
  const checkoutParcel = checkoutParcelForPacks(
    items.reduce((total, item) => total + item.quantity, 0),
  );
  const shippingOrigins = shippingOriginOptions();
  const [
    invoice,
    slip,
    orderDocs,
    shippingLabel,
    shippingHistory,
    people,
  ] = await Promise.all([
    previewInvoice(number),
    previewPackingSlip(number),
    documentHistory('order', order.orderNumber),
    currentShippingLabel(order.id),
    shippingLabelHistory(order.id),
    assignableStaff(),
  ]);
  const invoiceHistory = orderDocs.filter((d) => d.kind === 'invoice');
  const slipHistory = orderDocs.filter((d) => d.kind === 'packing_slip');
  const lotsByProduct = new Map<string, PickableLot[]>();
  if (order.status === 'fulfilling') {
    for (const code of new Set(items.map((it) => it.productCode)))
      lotsByProduct.set(code, await pickableLots(code));
  }
  const serializeShippingLabel = (label: (typeof shippingHistory)[number]) => ({
    ...label,
    createdAt: label.createdAt.toISOString(),
    refundRequestedAt: label.refundRequestedAt?.toISOString() ?? null,
  });

  return (
    <main className="bg-background text-foreground">
      <section className="mx-auto max-w-[1200px] px-5 py-12 sm:px-8 lg:px-12">
        <Link
          href="/manage/orders"
          className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-primary"
        >
          <ArrowLeft className="size-4" /> Orders
        </Link>
        <div className="mt-6 rounded-lg border border-border bg-secondary p-5">
          <h2 className="font-semibold">Next handoff</h2>
          <p className="mt-2 text-sm leading-6">{orderNextStep(order, true)}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Actions below remain limited by your role and the order’s current
            state.
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            Current owner: {order.assignedName ?? 'unassigned'}
            {order.serviceDueAt
              ? ` · due ${order.serviceDueAt.toISOString().slice(0, 16).replace('T', ' ')} UTC`
              : ''}
          </p>
          <OrderHandoffForm
            action={handoffOrderAction.bind(null, order.orderNumber)}
            initial={{
              assignedTo: order.assignedTo ?? '',
              serviceDueAt: order.serviceDueAt
                ? order.serviceDueAt.toISOString().slice(0, 16)
                : '',
            }}
            people={people}
            currentStaffId={staff.id}
            editable={
              order.status !== 'cancelled' &&
              (staff.role === 'admin' ||
                !order.assignedTo ||
                order.assignedTo === staff.id)
            }
          />
        </div>
        {allocation.tracked &&
          !['shipped', 'cancelled'].includes(order.status) && (
          <div className="mt-5 border border-border p-4 text-sm">
            <p className="font-semibold">
              Stock allocation {allocation.valid ? 'available' : 'needs review'}
            </p>
            <ul className="mt-2 space-y-1">
              {allocation.rows.map(({ reservation, lot }) => (
                <li key={reservation.itemId}>
                  {items.find((it) => it.id === reservation.itemId)?.sku} ·
                  reserved lot {lot.lotNumber}
                  {['submitted', 'awaiting_payment'].includes(order.status)
                    ? ` · held until ${reservation.expiresAt.toISOString()}`
                    : ''}
                </li>
              ))}
            </ul>
          </div>
        )}
        {slipped && (
          <p
            role="status"
            className="mt-6 flex items-center gap-2 border border-border bg-secondary p-4 text-sm"
          >
            <CircleCheck className="size-4 text-primary" /> Packing slip{' '}
            {slipped} issued.
          </p>
        )}
        {invoiced && (
          <p
            role="status"
            className="mt-6 flex items-center gap-2 border border-border bg-secondary p-4 text-sm"
          >
            <CircleCheck className="size-4 text-primary" /> Invoice {invoiced}{' '}
            issued.
          </p>
        )}
        {paid === 'cancelled' ? (
          <p
            role="alert"
            className="mt-6 flex items-center gap-2 border border-destructive/40 bg-secondary p-4 text-sm"
          >
            <AlertCircle className="size-4 shrink-0 text-destructive" /> Payment recorded, but the
            order was cancelled: its stock reservation had lapsed or the reserved lot is no longer
            available. A full refund is now due and nothing may be shipped.
          </p>
        ) : paid ? (
          <p
            role="status"
            className="mt-6 flex items-center gap-2 border border-border bg-secondary p-4 text-sm"
          >
            <CircleCheck className="size-4 text-primary" /> Payment recorded.
            The customer notification was queued.
          </p>
        ) : null}
        {fulfilling && (
          <p
            role="status"
            className="mt-6 flex items-center gap-2 border border-border bg-secondary p-4 text-sm"
          >
            <CircleCheck className="size-4 text-primary" /> Fulfilment started.
            Choose a released lot for each line and record the shipment.
          </p>
        )}
        {cancelled && (
          <p
            role="status"
            className="mt-6 border border-border bg-secondary p-4 text-sm"
          >
            Order cancelled. A customer notification containing the reason was
            queued.
          </p>
        )}
        {shipped && (
          <p
            role="status"
            className="mt-6 flex items-center gap-2 border border-border bg-secondary p-4 text-sm"
          >
            <CircleCheck className="size-4 text-primary" /> Shipment recorded in
            the movement ledger. A customer notification containing the
            tracking number and lot links was queued.
          </p>
        )}
        {delivered && (
          <p
            role="status"
            className="mt-6 flex items-center gap-2 border border-border bg-secondary p-4 text-sm"
          >
            <CircleCheck className="size-4 text-primary" /> Delivery
            confirmation recorded. A customer notification was queued.
          </p>
        )}
        {refunded && (
          <p
            role="status"
            className="mt-6 flex items-center gap-2 border border-border bg-secondary p-4 text-sm"
          >
            <CircleCheck className="size-4 text-primary" /> Refund recorded and
            a customer notification was queued.
          </p>
        )}
        {returned && (
          <p
            role="status"
            className="mt-6 flex items-center gap-2 border border-border bg-secondary p-4 text-sm"
          >
            <CircleCheck className="size-4 text-primary" /> Return received and
            recorded in the movement ledger as quarantined material.
          </p>
        )}
        {error && (
          <p
            role="alert"
            className="mt-6 flex items-center gap-2 border border-destructive/40 bg-secondary p-4 text-sm"
          >
            <AlertCircle className="size-4 text-destructive" />{' '}
            {ORDER_ERROR[error] ?? error}
          </p>
        )}
        <p className="mt-6 font-mono text-xs text-muted-foreground">
          {ORDER_STATUS_LABEL[order.status as OrderStatus] ?? order.status}{' '}
          &middot; submitted {order.submittedAt.toISOString().slice(0, 10)}{' '}
          &middot; {order.channel}
        </p>
        <h1 className="mt-2 font-display text-4xl font-extrabold tracking-[-0.05em]">
          {order.orderNumber}
        </h1>

        <div className="mt-10 grid gap-12 lg:grid-cols-2">
          <div>
            <h2 className="utility-label text-primary">Lines</h2>
            <ul className="mt-4 divide-y divide-border border border-border">
              {items.map((it) => (
                <li
                  key={it.id}
                  className="grid gap-1 p-4 text-sm sm:grid-cols-[1fr_auto]"
                >
                  <div>
                    <p className="font-semibold">
                      {it.productName}{' '}
                      <span className="font-mono text-xs text-muted-foreground">
                        {it.sku}
                      </span>
                    </p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {it.quantity} × {it.packSize} &middot; {it.presentation}
                      {it.lotNumber
                        ? ` · lot ${it.lotNumber}`
                        : ' · lot not yet assigned'}
                    </p>
                  </div>
                  <span className="font-mono">
                    {formatCents(it.lineTotalCents)}
                  </span>
                </li>
              ))}
            </ul>
            <dl className="ml-auto mt-4 max-w-sm space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt>Materials</dt>
                <dd className="font-mono">
                  {formatCents(order.subtotalCents)}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>
                  Shipping
                  {order.shippingService ? ` · ${order.shippingService}` : ''}
                </dt>
                <dd className="font-mono">
                  {formatCents(order.shippingCents)}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Tax</dt>
                <dd className="font-mono">{formatCents(order.taxCents)}</dd>
              </div>
              <div className="flex justify-between gap-4 border-t border-border pt-2 font-semibold">
                <dt>Total · {order.priceTier} pricing</dt>
                <dd className="font-mono">{formatCents(order.totalCents)}</dd>
              </div>
            </dl>

            <h2 className="mt-10 utility-label text-primary">Ship to</h2>
            <dl className="mt-4 border-t border-border">
              <Row label="Consignee" value={order.consigneeName} />
              <Row label="Institution" value={order.consigneeInstitution} />
              <Row
                label="Address"
                value={[
                  order.shipToLine1,
                  order.shipToLine2,
                  order.shipToCity,
                  order.shipToRegion,
                  order.shipToPostalCode,
                  order.shipToCountry,
                ]
                  .filter(Boolean)
                  .join(', ')}
              />
              <Row label="Phone" value={order.shipToPhone} />
              <Row label="Customer note" value={order.customerNote} />
            </dl>

            {/* Reachability, before the parcel leaves (chapter 10 §10.6). Not a
                dispatch block: an unverified address is a warning and a resend,
                because refusing to ship a paid order over an unclicked link is a
                members' decision rather than a default. */}
            <div className="mt-6 border border-border p-4 text-sm">
              <p className="font-semibold">
                Contact {verification.verifiedAt ? 'verified' : 'not verified'}
              </p>
              <p className="mt-2 leading-6 text-muted-foreground">
                {verification.email ?? 'No contact email on this order.'}
                {verification.verifiedAt
                  ? ` — confirmed ${verification.verifiedAt.toISOString().slice(0, 10)}.`
                  : verification.sentCount > 0
                    ? ` — asked ${verification.sentCount} time${verification.sentCount === 1 ? '' : 's'}${
                        verification.expired ? ', link expired' : ', not yet confirmed'
                      }.`
                    : ' — not yet asked.'}
              </p>
              {!verification.verifiedAt && (
                <p className="mt-2 leading-6 text-muted-foreground">
                  If this lot were recalled, this is the address the notice would go to. Ask again
                  before dispatch if it has never been confirmed.
                </p>
              )}
              {!verification.verifiedAt && verification.email && canFulfil(staff) && (
                <form action={resendContactVerificationAction.bind(null, order.orderNumber)} className="mt-3">
                  <button
                    type="submit"
                    className="h-10 border border-foreground/20 px-3 text-sm font-semibold hover:border-primary hover:text-primary"
                  >
                    {verification.sentCount > 0 ? 'Send the request again' : 'Ask the customer to confirm'}
                  </button>
                </form>
              )}
            </div>
          </div>
          <div>
            <h2 className="utility-label text-primary">Payment</h2>
            <dl className="mt-4 border-t border-border">
              <Row
                label="Method"
                value={
                  order.paymentRef?.startsWith('TEST-')
                    ? 'simulated payment'
                    : order.paymentMethod
                }
              />
              <Row label="Reference" value={order.paymentRef} />
              <Row
                label="Status"
                value={
                  PAYMENT_STATUS_LABEL[order.paymentStatus] ??
                  order.paymentStatus
                }
              />
              <Row
                label="Paid at"
                value={
                  order.paidAt ? order.paidAt.toISOString().slice(0, 10) : null
                }
              />
              <Row
                label="Refund"
                value={
                  order.paymentStatus === 'refund_due' ||
                  order.paymentStatus === 'refunded'
                    ? `$${((order.refundCents ?? 0) / 100).toFixed(2)} sent of $${(refundDue(order) / 100).toFixed(2)} owed${order.refundedAt ? ` · first ${order.refundedAt.toISOString().slice(0, 10)}` : ''}${order.refundRef ? ` · ${order.refundRef}` : ''}`
                    : null
                }
              />
            </dl>
            {order.paymentMethod === 'zelle' && (
              <div className="mt-5 border border-border bg-secondary p-5 text-sm">
                <div className="flex items-center gap-2 font-semibold">
                  <Landmark className="size-4 text-primary" /> Zelle evidence
                </div>
                <p className="mt-2 leading-6 text-muted-foreground">
                  {zelleClaim
                    ? `Customer reported payment sent ${zelleClaim.claimedAt.toISOString().replace('T', ' ').slice(0, 16)} UTC${zelleClaim.payerName ? ` from ${zelleClaim.payerName}` : ''}. Claim status: ${zelleClaim.status}.`
                    : 'The customer has not reported sending this payment.'}
                </p>
                <p className="mt-2 leading-6 text-muted-foreground">
                  {zelleReceipts.length
                    ? `${zelleReceipts.length} Chase-originated receipt record${zelleReceipts.length === 1 ? '' : 's'} linked to this order. Latest: ${zelleReceipts[0].outcome.replaceAll('_', ' ')}.`
                    : 'No Chase-originated receipt is linked to this order yet.'}
                </p>
                <Link href="/manage/payments/zelle?outcome=review" className="mt-3 inline-flex font-semibold text-primary underline">
                  Open Zelle payment desk
                </Link>
              </div>
            )}
            {refundAllowed(order) &&
              (canVerifyAccounts(staff) ? (
                <form
                  method="post"
                  action={`/api/manage/orders/${order.orderNumber}/refund`}
                  className="mt-5 flex flex-col gap-3 border border-border bg-secondary p-5"
                >
                  <p className="text-sm font-semibold">Record refund sent</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="flex flex-col gap-1.5 text-sm">
                      Amount (USD)
                      <input
                        name="amount"
                        defaultValue={(
                          (refundDue(order) - (order.refundCents ?? 0)) /
                          100
                        ).toFixed(2)}
                        inputMode="decimal"
                        className="h-11 border border-foreground/20 bg-background px-3 font-mono text-sm"
                      />
                    </label>
                    <label className="flex flex-col gap-1.5 text-sm">
                      Bank or provider reference
                      <input
                        name="reference"
                        required
                        maxLength={120}
                        className="h-11 border border-foreground/20 bg-background px-3 font-mono text-sm"
                      />
                    </label>
                  </div>
                  <button
                    type="submit"
                    className="inline-flex h-11 w-fit items-center bg-primary px-5 text-sm font-bold text-primary-foreground hover:bg-primary/90"
                  >
                    Mark refunded
                  </button>
                  <p className="text-xs text-muted-foreground">
                    Only after the money has actually been sent. The amount owed
                    is the returned lines&rsquo; value (or the order total on a
                    cancellation); a partial refund can be topped up later with
                    its own reference. The customer notice is queued and the
                    refund is carried into the accounting export.
                  </p>
                </form>
              ) : (
                <p className="mt-5 border border-border bg-secondary p-4 text-sm text-muted-foreground">
                  A refund is due. Only an admin can record it.
                </p>
              ))}
            {order.status === 'awaiting_payment' &&
              (canVerifyAccounts(staff) && manualPayment.allowed ? (
                <form
                  method="post"
                  action={`/api/manage/orders/${order.orderNumber}/paid`}
                  className="mt-5 flex flex-col gap-3 border border-border bg-secondary p-5"
                >
                  <p className="text-sm font-semibold">
                    Record payment received
                  </p>
                  <label className="flex flex-col gap-1.5 text-sm">
                    Bank or provider reference
                    <input
                      name="reference"
                      required
                      maxLength={120}
                      className="h-11 border border-foreground/20 bg-background px-3 font-mono text-sm"
                    />
                  </label>
                  <button
                    type="submit"
                    className="inline-flex h-11 w-fit items-center bg-primary px-5 text-sm font-bold text-primary-foreground hover:bg-primary/90"
                  >
                    Mark paid
                  </button>
                  <p className="text-xs text-muted-foreground">
                    Only after the funds have cleared. This moves the order to
                    paid and queues the customer notice.
                  </p>
                </form>
              ) : (
                <p className="mt-5 border border-border bg-secondary p-4 text-sm text-muted-foreground">
                  {manualPayment.allowed
                    ? 'Only an admin can record a payment.'
                    : manualPayment.reason}
                </p>
              ))}

            <h2 className="mt-10 utility-label text-primary">Packing slip</h2>
            {slip === null ? (
              <p className="mt-4 text-sm text-muted-foreground">Unavailable.</p>
            ) : (
              <div className="mt-4 border border-border bg-secondary p-5">
                {slipHistory.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No packing slip has been issued for this order.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {slipHistory.map((doc) => (
                      <li key={doc.id} className="text-sm">
                        <span className="font-semibold">
                          {doc.documentNumber}
                        </span>
                        {doc.supersededById && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            superseded
                          </span>
                        )}
                        <a
                          href={`/api/manage/documents/${doc.id}`}
                          className="ml-3 inline-flex items-center gap-1.5 font-semibold text-primary"
                        >
                          <Download className="size-3.5" /> Download
                        </a>
                        <span className="mt-1 block font-mono text-[11px] text-muted-foreground">
                          {doc.issuedAt.toISOString().slice(0, 10)} &middot;{' '}
                          {doc.issuedBy}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {slip.blockers.length > 0 && (
                  <ul className="mt-4 space-y-1.5 text-sm">
                    {slip.blockers.map((blocker) => (
                      <li key={blocker} className="flex gap-2">
                        <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
                        <span>{blocker}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {canFulfil(staff) && (
                  <div className="mt-5 flex flex-wrap items-end gap-3">
                    <a
                      href={`/api/manage/orders/${encodeURIComponent(order.orderNumber)}/packing-slip`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-11 items-center justify-center gap-2 border border-foreground/20 px-5 text-sm font-bold hover:bg-background"
                    >
                      <FileText className="size-4" /> Preview
                    </a>
                    {slip.blockers.length === 0 && (
                      <form
                        method="post"
                        action={`/api/manage/orders/${encodeURIComponent(order.orderNumber)}/packing-slip`}
                        className="flex flex-wrap items-end gap-3"
                      >
                        {slipHistory.length > 0 && (
                          <label className="flex flex-col gap-1.5 text-sm">
                            Reason for reissue
                            <input
                              name="reason"
                              required
                              maxLength={200}
                              placeholder="What changed"
                              className="h-11 w-64 border border-foreground/20 bg-background px-3 text-sm"
                            />
                          </label>
                        )}
                        <button
                          type="submit"
                          className="inline-flex h-11 items-center justify-center bg-primary px-5 text-sm font-bold text-primary-foreground hover:bg-primary/90"
                        >
                          {slipHistory.length === 0
                            ? `Issue ${slip.documentNumber}`
                            : 'Reissue'}
                        </button>
                      </form>
                    )}
                  </div>
                )}
                <p className="mt-4 text-xs leading-5 text-muted-foreground">
                  Prints the lot and certificate against every line, and no
                  prices. Print it for the box.
                </p>
              </div>
            )}

            <h2 className="mt-10 utility-label text-primary">Invoice</h2>
            {invoice === null ? (
              <p className="mt-4 text-sm text-muted-foreground">Unavailable.</p>
            ) : (
              <div className="mt-4 border border-border bg-secondary p-5">
                {invoiceHistory.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No invoice has been issued for this order.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {invoiceHistory.map((doc) => (
                      <li key={doc.id} className="text-sm">
                        <span className="font-semibold">
                          {doc.documentNumber}
                        </span>
                        {doc.supersededById && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            superseded
                          </span>
                        )}
                        <a
                          href={`/api/manage/documents/${doc.id}`}
                          className="ml-3 inline-flex items-center gap-1.5 font-semibold text-primary"
                        >
                          <Download className="size-3.5" /> Download
                        </a>
                        <span className="mt-1 block font-mono text-[11px] text-muted-foreground">
                          {doc.issuedAt.toISOString().slice(0, 10)} &middot;{' '}
                          {doc.issuedBy}
                        </span>
                        <span className="block break-all font-mono text-[11px] text-muted-foreground">
                          SHA-256 {doc.sha256}
                        </span>
                        {doc.supersedeReason && (
                          <span className="mt-1 block text-xs text-muted-foreground">
                            {doc.supersedeReason}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                {invoice.blockers.length > 0 && (
                  <ul className="mt-4 space-y-1.5 text-sm">
                    {invoice.blockers.map((blocker) => (
                      <li key={blocker} className="flex gap-2">
                        <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
                        <span>{blocker}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {canFulfil(staff) && (
                  <div className="mt-5 flex flex-wrap items-end gap-3">
                    <a
                      href={`/api/manage/orders/${encodeURIComponent(order.orderNumber)}/invoice`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-11 items-center justify-center gap-2 border border-foreground/20 px-5 text-sm font-bold hover:bg-background"
                    >
                      <FileText className="size-4" /> Preview
                    </a>
                    {invoice.blockers.length === 0 && (
                      <form
                        method="post"
                        action={`/api/manage/orders/${encodeURIComponent(order.orderNumber)}/invoice`}
                        className="flex flex-wrap items-end gap-3"
                      >
                        {invoiceHistory.length > 0 && (
                          <label className="flex flex-col gap-1.5 text-sm">
                            Reason for reissue
                            <input
                              name="reason"
                              required
                              maxLength={200}
                              placeholder="What changed"
                              className="h-11 w-64 border border-foreground/20 bg-background px-3 text-sm"
                            />
                          </label>
                        )}
                        <button
                          type="submit"
                          className="inline-flex h-11 items-center justify-center bg-primary px-5 text-sm font-bold text-primary-foreground hover:bg-primary/90"
                        >
                          {invoiceHistory.length === 0
                            ? `Issue ${invoice.documentNumber}`
                            : 'Reissue'}
                        </button>
                      </form>
                    )}
                  </div>
                )}
                <p className="mt-4 text-xs leading-5 text-muted-foreground">
                  The customer can download the current invoice from their order
                  page. A reissue supersedes the previous one; both are kept.
                </p>
              </div>
            )}

            <h2 className="mt-10 utility-label text-primary">Fulfilment</h2>
            {order.status === 'paid' &&
              (canFulfil(staff) ? (
                <form
                  method="post"
                  action={`/api/manage/orders/${order.orderNumber}/fulfil`}
                  className="mt-4"
                >
                  <button
                    type="submit"
                    className="inline-flex h-11 items-center bg-primary px-5 text-sm font-bold text-primary-foreground hover:bg-primary/90"
                  >
                    Start fulfilment
                  </button>
                </form>
              ) : (
                <p className="mt-4 border border-border bg-secondary p-4 text-sm text-muted-foreground">
                  Only admin and ops roles pick and ship.
                </p>
              ))}
            {order.status === 'fulfilling' && canFulfil(staff) && (
              <OrderShippingDesk
                orderNumber={order.orderNumber}
                parcel={checkoutParcel.ok ? checkoutParcel.parcel : null}
                initialLabel={
                  shippingLabel ? serializeShippingLabel(shippingLabel) : null
                }
                initialHistory={shippingHistory.map(serializeShippingLabel)}
                origins={shippingOrigins}
              />
            )}
            {order.status === 'fulfilling' && canFulfil(staff) && (
              <form
                id="shipment-record"
                method="post"
                action={`/api/manage/orders/${order.orderNumber}/ship`}
                className="mt-4 flex flex-col gap-4 border border-border bg-secondary p-5"
              >
                <p className="text-sm font-semibold">Record shipment</p>
                {items.map((it) => {
                  const options = lotsByProduct.get(it.productCode) ?? [];
                  return (
                    <label
                      key={it.id}
                      className="flex flex-col gap-1.5 text-sm"
                    >
                      <span>
                        {it.productName} &middot; {it.quantity} × {it.packSize}{' '}
                        <span className="font-mono text-xs text-muted-foreground">
                          {it.sku}
                        </span>
                      </span>
                      <select
                        name={`lot_${it.id}`}
                        defaultValue={
                          allocation.rows.find(
                            (row) => row.reservation.itemId === it.id,
                          )?.reservation.lotId ?? ''
                        }
                        required
                        className="h-11 border border-foreground/20 bg-background px-3 font-mono text-sm"
                      >
                        <option value="">Choose a released lot…</option>
                        {options.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.lotNumber} — {l.quantityRemaining} on hand
                            {l.retestDate
                              ? ` · retest ${l.retestDate.toISOString().slice(0, 10)}`
                              : ''}
                          </option>
                        ))}
                      </select>
                      {options.length === 0 && (
                        <span className="text-xs text-destructive">
                          No released lot with quantity on hand for{' '}
                          {it.productCode}.
                        </span>
                      )}
                    </label>
                  );
                })}
                <div className="grid gap-4 sm:grid-cols-3">
                  <label className="flex flex-col gap-1.5 text-sm">
                    Carrier
                    <input
                      name="carrier"
                      required
                      defaultValue={
                        shippingLabel?.state === 'ready'
                          ? shippingLabel.carrier
                          : ''
                      }
                      className="h-11 border border-foreground/20 bg-background px-3 text-sm"
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm">
                    Tracking number
                    <input
                      name="tracking"
                      required
                      defaultValue={
                        shippingLabel?.state === 'ready'
                          ? (shippingLabel.trackingNumber ?? '')
                          : ''
                      }
                      className="h-11 border border-foreground/20 bg-background px-3 font-mono text-sm"
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm">
                    Actual ship date
                    <input
                      name="shippedOn"
                      type="date"
                      required
                      defaultValue={new Date().toISOString().slice(0, 10)}
                      className="h-11 border border-foreground/20 bg-background px-3 font-mono text-sm"
                    />
                  </label>
                </div>
                <label className="flex flex-col gap-1.5 text-sm">
                  Note (optional)
                  <input
                    name="note"
                    maxLength={300}
                    className="h-11 border border-foreground/20 bg-background px-3 text-sm"
                  />
                </label>
                <button
                  type="submit"
                  className="inline-flex h-11 w-fit items-center bg-primary px-5 text-sm font-bold text-primary-foreground hover:bg-primary/90"
                >
                  Record shipment
                </button>
                <p className="text-xs leading-5 text-muted-foreground">
                  Writes one movement per lot with the consignee and this ship
                  date, decrements each lot, and queues the customer notice.
                </p>
              </form>
            )}
            {order.status === 'shipped' && (
              <dl className="mt-4 border-t border-border">
                <Row label="Carrier" value={order.carrier} />
                <Row label="Tracking" value={order.trackingNumber} />
                <Row
                  label="Shipped on"
                  value={
                    order.shippedAt
                      ? order.shippedAt.toISOString().slice(0, 10)
                      : null
                  }
                />
                <Row
                  label="Delivered on"
                  value={
                    order.deliveredAt
                      ? order.deliveredAt.toISOString().slice(0, 10)
                      : null
                  }
                />
                <Row
                  label="Delivery evidence"
                  value={order.deliveryEvidence}
                />
                {trackingUrl(order.carrier, order.trackingNumber) && (
                  <div className="py-3">
                    <a
                      href={trackingUrl(order.carrier, order.trackingNumber)!}
                      className="text-sm font-semibold text-primary"
                      rel="noreferrer"
                    >
                      Track shipment
                    </a>
                  </div>
                )}
              </dl>
            )}
            {order.status === 'shipped' &&
              !order.deliveredAt &&
              canFulfil(staff) && (
                <form
                  method="post"
                  action={`/api/manage/orders/${order.orderNumber}/delivery`}
                  className="mt-6 flex flex-col gap-4 border border-border bg-secondary p-5"
                >
                  <p className="text-sm font-semibold">Confirm delivery</p>
                  <p className="text-xs leading-5 text-muted-foreground">
                    Record delivery only after carrier tracking, a delivery
                    scan, or a signed receipt confirms the parcel arrived.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="flex flex-col gap-1.5 text-sm">
                      Delivered on
                      <input
                        name="deliveredOn"
                        type="date"
                        required
                        defaultValue={new Date().toISOString().slice(0, 10)}
                        className="h-11 border border-foreground/20 bg-background px-3 font-mono text-sm"
                      />
                    </label>
                    <label className="flex flex-col gap-1.5 text-sm">
                      Delivery evidence
                      <input
                        name="evidence"
                        required
                        maxLength={300}
                        placeholder="Carrier tracking event, scan, or signed receipt reference"
                        className="h-11 border border-foreground/20 bg-background px-3 text-sm"
                      />
                    </label>
                  </div>
                  <button
                    type="submit"
                    className="inline-flex h-11 w-fit items-center bg-primary px-5 text-sm font-bold text-primary-foreground hover:bg-primary/90"
                  >
                    Record delivery
                  </button>
                </form>
              )}
            {(order.status === 'submitted' ||
              order.status === 'awaiting_payment' ||
              order.status === 'paid' ||
              order.status === 'fulfilling') &&
              canVerifyAccounts(staff) && (
                <div className="mt-6">
                  {shippingLabel && shippingLabel.state !== 'voided' && (
                    <p
                      role="alert"
                      className="mb-3 border border-destructive/40 bg-secondary p-3 text-sm"
                    >
                      An active carrier-label record exists. Cancel it or
                      reconcile it in the shipping desk before cancelling this
                      order.
                    </p>
                  )}
                  {(!shippingLabel || shippingLabel.state === 'voided') && (
                    <form
                      method="post"
                      action={`/api/manage/orders/${order.orderNumber}/cancel`}
                      className="mt-6 flex flex-wrap items-center gap-3 text-sm"
                    >
                      <input
                        name="reason"
                        required
                        maxLength={300}
                        placeholder="Reason sent to the customer"
                        className="h-10 min-w-[18rem] border border-foreground/20 bg-background px-3 text-sm"
                      />
                      <button
                        type="submit"
                        className="h-10 border border-foreground/20 px-4 font-semibold hover:border-destructive hover:text-destructive"
                      >
                        Cancel order
                      </button>
                    </form>
                  )}
                </div>
              )}

            {returnAllowed(order) && canFulfil(staff) && (
              <form
                method="post"
                action={`/api/manage/orders/${order.orderNumber}/return`}
                className="mt-6 flex flex-col gap-4 border border-border bg-secondary p-5"
              >
                <p className="text-sm font-semibold">
                  Receive returned material
                </p>
                <p className="text-xs leading-5 text-muted-foreground">
                  Each returned line is written to the movement ledger against
                  the lot it shipped from and tagged quarantined. Returned
                  material is never added back to sellable stock. If the order
                  was paid, a refund becomes due.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {items.map((it) => (
                    <label
                      key={it.id}
                      className="flex flex-col gap-1.5 text-sm"
                    >
                      {it.sku} — packs returned (of {it.quantity})
                      <input
                        name={`packs_${it.id}`}
                        inputMode="numeric"
                        defaultValue="0"
                        className="h-11 border border-foreground/20 bg-background px-3 font-mono text-sm"
                      />
                    </label>
                  ))}
                  <label className="flex flex-col gap-1.5 text-sm">
                    Date received back
                    <input
                      name="receivedOn"
                      type="date"
                      required
                      defaultValue={new Date().toISOString().slice(0, 10)}
                      className="h-11 border border-foreground/20 bg-background px-3 font-mono text-sm"
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm">
                    Condition on receipt
                    <input
                      name="condition"
                      required
                      maxLength={200}
                      placeholder="Sealed, label intact, shipped on wet ice"
                      className="h-11 border border-foreground/20 bg-background px-3 text-sm"
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
                    Note
                    <input
                      name="note"
                      maxLength={300}
                      className="h-11 border border-foreground/20 bg-background px-3 text-sm"
                    />
                  </label>
                </div>
                <button
                  type="submit"
                  className="inline-flex h-11 w-fit items-center border border-foreground/20 px-5 text-sm font-semibold hover:border-primary hover:text-primary"
                >
                  Record return
                </button>
              </form>
            )}
            {order.returnedAt && (
              <p className="mt-6 border border-border bg-secondary p-4 text-sm">
                Return received {order.returnedAt.toISOString().slice(0, 10)};
                see the history and the lot ledger.
              </p>
            )}

            <h2 className="mt-10 utility-label text-primary">History</h2>
            <ul className="mt-4 divide-y divide-border border border-border text-sm">
              {events.map((e) => (
                <li key={e.id} className="p-3">
                  <span className="font-mono text-xs">
                    {e.createdAt.toISOString().slice(0, 10)}
                  </span>{' '}
                  &middot; {e.fromStatus} &rarr;{' '}
                  <span className="font-semibold">{e.toStatus}</span> &middot;{' '}
                  {e.actor}
                  {e.note && (
                    <p className="mt-1 text-muted-foreground">{e.note}</p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </main>
  );
}
