import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertCircle, ArrowLeft, CircleCheck, Trash2 } from 'lucide-react';
import { getBuyer } from '@/lib/buyer-session';
import { openCheckoutEnabled } from '@/lib/site-config';
import { CheckoutExperience } from '@/components/site/checkout-experience';
import { requireAccount } from '@/lib/account-auth';
import { getCart } from '@/lib/cart';
import { loadCatalog } from '@/lib/catalog-data';
import { MAX_LINE_QUANTITY } from '@/lib/order-rules';
import { getOrganizationForAccount } from '@/lib/organizations';
import { RUO_ACKNOWLEDGEMENT } from '@/lib/policy';
import { currentViewer } from '@/lib/visibility';
import { formatCents } from '@/lib/visibility-rules';
import { CatalogUnavailable } from '@/components/site/catalog-unavailable';
import { checkoutQuotesRequired } from '@/lib/checkout-quotes';
import { CustomerNav } from '@/components/site/customer-nav';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Cart',
  robots: { index: false, follow: false },
};

type Props = { searchParams: Promise<{ added?: string; error?: string }> };

export default async function CartPage({ searchParams }: Props) {
  const open = openCheckoutEnabled();
  const account = open
    ? await getBuyer()
    : await requireAccount('/account/cart');
  const { added, error } = await searchParams;
  const { visibility } = await currentViewer();
  const loaded = await loadCatalog(() =>
    account
      ? getCart(account.id, visibility)
      : Promise.resolve({ lines: [], subtotalCents: 0, orderable: false }),
  );
  const cart = loaded.data;
  const organization =
    account?.tier === 'institutional'
      ? await loadCatalog(() => getOrganizationForAccount(account.id))
      : null;
  const org = organization?.data ?? null;

  return (
    <main className="text-foreground">
      <section className="mx-auto max-w-[1080px] px-4 py-10 sm:px-6">
        <div className="ion-page-hero p-7 sm:p-10">
        <Link
          href="/catalog"
          className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-primary"
        >
          <ArrowLeft className="size-4" /> Catalog
        </Link>
        <p className="ion-kicker mt-6">
          {open ? 'Guest checkout · no account required' : 'Research account'}
        </p>
        <h1 className="ion-heading mt-4 text-4xl sm:text-5xl">
          Your cart
        </h1>

        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          Review quantities and the receiving address before submitting. You
          will choose a payment method on the next screen.
        </p>
        <div className="relative z-10 mt-7"><CustomerNav current="/account/cart" guest={account?.status === 'guest'} /></div>
        </div>
        <div className="ion-panel mt-6 px-6 py-8 sm:px-10">
        {added && (
          <p
            role="status"
            className="mt-6 flex items-center gap-2 border border-border bg-secondary p-4 text-sm"
          >
            <CircleCheck className="size-4 text-primary" /> Added to your cart.
          </p>
        )}
        {error && (
          <p
            role="alert"
            className="mt-6 flex items-center gap-2 border border-destructive/40 bg-secondary p-4 text-sm"
          >
            <AlertCircle className="size-4 text-destructive" />{' '}
            {error === 'invalid'
              ? 'That change was not valid.'
              : error === 'unavailable'
                ? 'The cart is temporarily unavailable.'
                : error}
          </p>
        )}

        {loaded.unavailable || !cart ? (
          <div className="mt-10">
            <CatalogUnavailable />
          </div>
        ) : cart.lines.length === 0 ? (
          <p className="mt-10 border border-border bg-secondary p-6 text-sm">
            Your cart is empty.{' '}
            <Link href="/catalog" className="font-semibold text-primary">
              Browse the catalog
            </Link>
            .
          </p>
        ) : (
          <>
            <ul className="mt-10 divide-y divide-border overflow-hidden rounded-[1.4rem] border border-border">
              {cart.lines.map((line) => (
                <li
                  key={line.itemId}
                  className="grid gap-4 p-5 sm:grid-cols-[1fr_auto_auto] sm:items-center"
                >
                  <div>
                    <p className="font-semibold">
                      <Link
                        href={`/catalog/${line.product.slug}`}
                        className="hover:text-primary"
                      >
                        {line.product.name}
                      </Link>{' '}
                      <span className="font-mono text-xs text-muted-foreground">
                        {line.variant.sku}
                      </span>
                    </p>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">
                      {line.variant.quantity} &middot;{' '}
                      {line.variant.presentation}
                    </p>
                    {line.problem && (
                      <p className="mt-2 text-sm text-destructive">
                        {line.problem}
                      </p>
                    )}
                  </div>
                  <form
                    method="post"
                    action="/api/cart/update"
                    className="flex items-center gap-2"
                  >
                    <input type="hidden" name="item" value={line.itemId} />
                    <label className="sr-only" htmlFor={`q-${line.itemId}`}>
                      Quantity
                    </label>
                    <input
                      id={`q-${line.itemId}`}
                      name="quantity"
                      type="number"
                      min={1}
                      max={MAX_LINE_QUANTITY}
                      defaultValue={line.quantity}
                      className="h-10 w-20 border border-foreground/20 bg-background px-3 font-mono text-sm"
                    />
                    <button
                      type="submit"
                      className="h-10 border border-foreground/20 px-3 text-sm font-semibold hover:border-primary hover:text-primary"
                    >
                      Update
                    </button>
                  </form>
                  <div className="flex items-center justify-between gap-4 sm:justify-end">
                    <span className="font-mono text-sm">
                      {line.unitPriceCents === null
                        ? '—'
                        : formatCents(line.unitPriceCents * line.quantity)}
                    </span>
                    <form method="post" action="/api/cart/update">
                      <input type="hidden" name="item" value={line.itemId} />
                      <input type="hidden" name="remove" value="1" />
                      <button
                        type="submit"
                        aria-label={`Remove ${line.product.name} from cart`}
                        className="flex min-h-11 min-w-11 items-center justify-center text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-right font-mono text-sm">
              Subtotal{' '}
              <span className="font-semibold">
                {formatCents(cart.subtotalCents)}
              </span>
            </p>

            {open ? (
              <CheckoutExperience
                subtotalCents={cart.subtotalCents}
                token={crypto.randomUUID().replace(/-/g, '')}
                acknowledgement={RUO_ACKNOWLEDGEMENT}
                email={account?.status === 'guest' ? '' : account?.email}
                name={account?.status === 'guest' ? '' : account?.name}
                quoteRequired={checkoutQuotesRequired()}
                orderable={cart.orderable}
              />
            ) : (
              <form
                method="post"
                action="/api/orders"
                className="mt-10 border border-border bg-secondary p-6"
              >
                <input
                  type="hidden"
                  name="token"
                  value={crypto.randomUUID().replace(/-/g, '')}
                />
                <h2 className="font-display text-xl font-bold tracking-tight">
                  Review and submit
                </h2>
                {org && org.verificationStatus === 'approved' ? (
                  <div className="mt-4 text-sm leading-6">
                    <p className="font-semibold">Ships to</p>
                    <p className="text-muted-foreground">
                      {org.receivingParty}, {org.legalName}
                      <br />
                      {[
                        org.addressLine1,
                        org.addressLine2,
                        org.city,
                        org.region,
                        org.postalCode,
                        org.country,
                      ]
                        .filter(Boolean)
                        .join(', ')}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      The verified organisation address is the only shipping
                      address. Email research@nexphaselabs.net to change it.
                    </p>
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-muted-foreground">
                    Ordering is open to verified research organisations.{' '}
                    <Link
                      href="/account/organization"
                      className="font-semibold text-primary"
                    >
                      Submit your organisation
                    </Link>
                    .
                  </p>
                )}
                <label className="mt-5 block text-sm">
                  <span className="font-semibold">Note for this order</span>
                  <textarea
                    name="note"
                    maxLength={500}
                    className="mt-2 min-h-[4rem] w-full border border-foreground/20 bg-background p-3 text-sm"
                  />
                </label>
                <p className="mt-5 border-l-2 border-primary bg-background px-4 py-3 text-sm leading-6">
                  {RUO_ACKNOWLEDGEMENT}
                </p>
                <label className="mt-3 flex items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    name="confirm_ruo"
                    required
                    className="mt-1"
                  />
                  <span>
                    I confirm the acknowledgement above and accept the{' '}
                    <Link
                      href="/legal/terms"
                      className="font-semibold text-primary underline"
                    >
                      terms of sale
                    </Link>{' '}
                    for this order.
                  </span>
                </label>
                <p className="mt-4 text-xs leading-5 text-muted-foreground">
                  Payment instructions follow submission. Staging payments are
                  simulated; no money moves. Material is picked from a released
                  lot by a named person; the certificate of analysis for that
                  lot ships with it.
                </p>
                <button
                  type="submit"
                  disabled={
                    !cart.orderable ||
                    !org ||
                    org.verificationStatus !== 'approved'
                  }
                  className="mt-5 inline-flex h-12 items-center justify-center bg-primary px-6 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  Continue to payment
                </button>
              </form>
            )}
          </>
        )}
        </div>
      </section>
    </main>
  );
}
