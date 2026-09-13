import Link from 'next/link';
import { redirect } from 'next/navigation';
import { env } from 'cloudflare:workers';
import { and, desc, eq, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import {
  paymentAttempts,
  shippingLabels,
  shippingTrackingEvents,
} from '@/db/commerce-schema';
import { orders } from '@/db/schema';
import { canManageStaff, requireStaff } from '@/lib/staff-auth';
import { catalogReadiness } from '@/lib/catalog-readiness';
import { shippingConfiguration } from '@/lib/shipping-provider';
import { ShippingQuoteForm } from '@/components/manage/shipping-quote-form';
import { formatCents } from '@/lib/visibility-rules';
import {
  checkoutParcelForPacks,
  checkoutQuotesRequired,
} from '@/lib/checkout-quotes';
import { taxConfiguration } from '@/lib/tax-provider';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Operational readiness',
  robots: { index: false, follow: false },
};
export default async function ReadinessPage() {
  const staff = await requireStaff('/manage/readiness');
  if (!canManageStaff(staff)) redirect('/manage?denied=readiness');
  const catalog = await catalogReadiness();
  const shipping = shippingConfiguration();
  const tax = taxConfiguration();
  const parcel = checkoutParcelForPacks(1);
  const attempts = await getDb()
    .select({ attempt: paymentAttempts, number: orders.orderNumber })
    .from(paymentAttempts)
    .innerJoin(orders, eq(orders.id, paymentAttempts.orderId))
    .where(and(sql`${paymentAttempts.state} != 'attached'`))
    .orderBy(desc(paymentAttempts.createdAt))
    .limit(100);
  const labelAttempts = await getDb()
    .select({ label: shippingLabels, number: orders.orderNumber })
    .from(shippingLabels)
    .innerJoin(orders, eq(orders.id, shippingLabels.orderId))
    .where(and(sql`${shippingLabels.state} NOT IN ('ready','voided')`))
    .orderBy(desc(shippingLabels.createdAt))
    .limit(100);
  const trackingAttention = await getDb()
    .select({ event: shippingTrackingEvents, number: orders.orderNumber })
    .from(shippingTrackingEvents)
    .leftJoin(orders, eq(orders.id, shippingTrackingEvents.orderId))
    .where(
      sql`${shippingTrackingEvents.outcome} IN ('verification_retry','unmatched','attention')`,
    )
    .orderBy(desc(shippingTrackingEvents.receivedAt))
    .limit(100);
  return (
    <main className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
      <h1 className="page-title">Operational readiness</h1>
      <p className="mt-4 max-w-3xl text-muted-foreground">
        Work through the blockers before accepting real orders. This screen
        reads configuration and catalog data; it does not approve stock, set
        prices, or authorize launch.
      </p>
      <section className="mt-10" aria-labelledby="catalog-ready">
        <h2 id="catalog-ready" className="text-2xl font-bold">
          Purchasable catalog
        </h2>
        <p className="mt-3 text-sm">
          {catalog.rows.filter((r) => r.issues.length === 0).length} of{' '}
          {catalog.rows.length} pack sizes have a public price and a released
          lot with quantity for at least one pack. Reservations, packaging and
          document readiness still need separate checks.
        </p>
        {catalog.truncated && (
          <p role="alert">
            This overview is limited. Review the full catalog and lots before
            launch.
          </p>
        )}
        <ul className="mt-5 divide-y divide-border border-y border-border">
          {catalog.rows.map((r) => (
            <li
              key={r.sku}
              className="flex flex-wrap justify-between gap-3 py-4 text-sm"
            >
              <div>
                <Link
                  href={`/manage/products/${encodeURIComponent(r.code)}`}
                  className="font-semibold text-primary underline"
                >
                  {r.name} · {r.packSize}
                </Link>
                <p className="mt-1 text-muted-foreground">
                  {r.sku} ·{' '}
                  {r.priceCents === null
                    ? 'No public price'
                    : formatCents(r.priceCents)}
                </p>
              </div>
              <p
                className={
                  r.issues.length ? 'text-destructive' : 'text-muted-foreground'
                }
              >
                {r.issues.join('; ') ||
                  'Price and one-pack stock checks passed'}
              </p>
            </li>
          ))}
        </ul>
      </section>
      <section className="mt-10">
        <h2 className="text-2xl font-bold">Shipping comparison</h2>
        <p className="mt-3 text-sm">
          Compare USPS, UPS and FedEx through the configured shipping integration.
          Staging simulation exercises the workflow but is not carrier pricing.
          A comparison is not a shipping label.
        </p>
        {shipping.issues.length > 0 && (
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-destructive">
            {shipping.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        )}
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <div className="border border-border p-3">
            <dt className="font-semibold">Checkout enforcement</dt>
            <dd className="mt-1 text-muted-foreground">
              {checkoutQuotesRequired()
                ? 'Current quote required'
                : 'Not required'}
            </dd>
          </div>
          <div className="border border-border p-3">
            <dt className="font-semibold">Packed parcel</dt>
            <dd className="mt-1 text-muted-foreground">
              {parcel.ok
                ? `${parcel.parcel.length} × ${parcel.parcel.width} × ${parcel.parcel.height} in · ${parcel.parcel.weight} lb for one pack`
                : parcel.error}
            </dd>
          </div>
          <div className="border border-border p-3">
            <dt className="font-semibold">Tax calculation</dt>
            <dd className="mt-1 text-muted-foreground">
              {tax.ok
                ? `${tax.provider}${tax.test ? ' · test mode' : ' · live'}`
                : tax.error}
            </dd>
          </div>
        </dl>
        <ShippingQuoteForm />
      </section>
      <section className="mt-10">
        <h2 className="text-2xl font-bold">Payment requests needing review</h2>
        <p className="mt-3 text-sm">
          Uncertain requests must be reconciled against the provider, never
          retried as new invoices. These are the latest 100 unresolved requests.
          Matching an invoice does not record payment.
        </p>
        {attempts.length === 0 ? (
          <p className="mt-4 text-sm">No unresolved payment requests.</p>
        ) : (
          <ul className="mt-4 divide-y divide-border">
            {attempts.map(({ attempt, number }) => (
              <li key={attempt.id} className="py-4 text-sm">
                <Link
                  href={`/manage/orders/${number}`}
                  className="font-semibold text-primary underline"
                >
                  {number}
                </Link>{' '}
                · {attempt.method} · {attempt.state}
                <p className="mt-1 text-muted-foreground">
                  Request reference: {attempt.id}
                </p>
                {attempt.method === 'btcpay' && (
                  <form
                    method="post"
                    action={`/api/manage/orders/${number}/reconcile-payment`}
                    className="mt-3 flex flex-wrap items-end gap-3"
                  >
                    <label>
                      Provider invoice ID
                      <input
                        name="reference"
                        required
                        maxLength={64}
                        defaultValue={attempt.reference ?? ''}
                        className="ml-3 h-11 rounded border border-border bg-background px-3"
                      />
                    </label>
                    <button className="min-h-11 border border-border px-4 font-semibold">
                      Check and attach existing invoice
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="mt-10">
        <h2 className="text-2xl font-bold">Shipping labels needing review</h2>
        <p className="mt-3 text-sm">
          An uncertain label request is never retried automatically. Check the
          Shippo dashboard and carrier account before taking another action.
        </p>
        {labelAttempts.length === 0 ? (
          <p className="mt-4 text-sm">No unresolved label requests.</p>
        ) : (
          <ul className="mt-4 divide-y divide-border">
            {labelAttempts.map(({ label, number }) => (
              <li key={label.id} className="py-4 text-sm">
                <Link
                  href={`/manage/orders/${number}`}
                  className="font-semibold text-primary underline"
                >
                  {number}
                </Link>{' '}
                · {label.carrier} {label.serviceName} · {label.state}
                <p className="mt-1 text-muted-foreground">
                  {label.error ?? 'Provider result has not been attached yet.'}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="mt-10">
        <h2 className="text-2xl font-bold">Tracking events needing review</h2>
        <p className="mt-3 text-sm">
          Shippo events are verified against the Shippo tracking API before
          they can update an order. Failures, returns and unmatched tracking
          numbers stay here for a person to investigate.
        </p>
        {trackingAttention.length === 0 ? (
          <p className="mt-4 text-sm">No carrier tracking exceptions.</p>
        ) : (
          <ul className="mt-4 divide-y divide-border">
            {trackingAttention.map(({ event, number }) => (
              <li key={event.id} className="py-4 text-sm">
                {number ? (
                  <Link
                    href={`/manage/orders/${encodeURIComponent(number)}`}
                    className="font-semibold text-primary underline"
                  >
                    {number}
                  </Link>
                ) : (
                  <span className="font-semibold">Unmatched shipment</span>
                )}{' '}
                · {event.carrier.toUpperCase()} {event.trackingNumber} ·{' '}
                {event.status}
                <p className="mt-1 text-muted-foreground">
                  {event.outcomeDetail ?? 'Review the event in Shippo.'}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="mt-10 border-t border-border pt-6">
        <h2 className="text-2xl font-bold">
          Still requires operational evidence
        </h2>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm">
          <li>
            Shipping origin, packing profiles, eligible services and handling
            policy.
          </li>
          <li>
            Approved tax treatment and complete customer-accepted checkout
            totals.
          </li>
          <li>
            Actual provider settlement and refund reconciliation.{' '}
            {env.APP_ENV !== 'production'
              ? 'This environment uses simulated payments.'
              : 'Production configuration is not proof of settlement.'}
          </li>
          <li>
            Inbox delivery of receipts/updates, label purchase and carrier
            handoff rehearsal.
          </li>
        </ul>
      </section>
    </main>
  );
}
