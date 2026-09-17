import type { Metadata } from 'next';
import { freeShippingLine, freeShippingProgress, freeShippingThresholdCents } from '@/lib/free-shipping';
import { RESEARCH_SETTINGS } from '@/lib/account-rules';
import Link from 'next/link';
import { AlertCircle, ArrowLeft, CircleCheck, Trash2 } from 'lucide-react';
import { getBuyer } from '@/lib/buyer-session';
import { cookies } from 'next/headers';
import { NOTICE_COOKIE, readNotice } from '@/lib/notice';
import { accountRequired, openCheckoutEnabled } from '@/lib/site-config';
import { CheckoutExperience } from '@/components/site/checkout-experience';
import { requireAccount } from '@/lib/account-auth';
import { getCart } from '@/lib/cart';
import { listAddresses } from '@/lib/account-addresses';
import { loadCatalog } from '@/lib/catalog-data';
import { getOrganizationForAccount } from '@/lib/organizations';
import { STOREFRONT_COPY } from '@/lib/storefront-copy';
import { AGE_STATEMENT, RUO_ACKNOWLEDGEMENT } from '@/lib/policy';
import { currentViewer } from '@/lib/visibility';
import { formatCents } from '@/lib/visibility-rules';
import { CatalogUnavailable } from '@/components/site/catalog-unavailable';
import { checkoutQuotesRequired, onlineOrderingOpen } from '@/lib/checkout-quotes';
import { CustomerNav } from '@/components/site/customer-nav';
import { SupportStrip } from '@/components/site/support-strip';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Cart',
  robots: { index: false, follow: false },
};

type Props = { searchParams: Promise<{ added?: string; error?: string }> };

export default async function CartPage({ searchParams }: Props) {
  const open = openCheckoutEnabled();
  // Guests exist only while the storefront is open AND no account is required (owner, 16 Sep 2026).
  const guests = open && !accountRequired();
  const account = guests
    ? await getBuyer()
    : await requireAccount('/account/cart');
  const { added, error } = await searchParams;
  // Fixed words for known codes; a refusal's own words come from the cookie its route set,
  // never from the link (lib/notice.ts). Anything else in `error` shows nothing.
  const errorText =
    error === 'invalid'
      ? 'That change was not valid.'
      : error === 'unavailable'
        ? 'The cart is temporarily unavailable.'
        : error === 'notice'
          ? (readNotice((await cookies()).get(NOTICE_COOKIE)?.value) ??
            'That could not be completed. Review your cart and try again.')
          : null;
  const { visibility } = await currentViewer();
  const loaded = await loadCatalog(() =>
    account
      ? getCart(account.id, visibility)
      : Promise.resolve({ lines: [], subtotalCents: 0, orderable: false }),
  );
  const cart = loaded.data;
  // Saved addresses belong to a signed-in customer; a guest has no account to
  // save against and sees the plain form.
  const savedAddresses =
    account && account.status !== 'guest' ? await listAddresses(account.id) : [];
  const organization =
    account?.tier === 'institutional'
      ? await loadCatalog(() => getOrganizationForAccount(account.id))
      : null;
  const org = organization?.data ?? null;

  // A settings read that fails only hides the free-delivery line; it never blocks the cart.
  const freeShipping = freeShippingProgress(cart?.subtotalCents ?? 0, await freeShippingThresholdCents().catch(() => null));

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
          {guests ? 'Guest checkout · no account required' : 'Research account'}
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
        {errorText && (
          <p
            role="alert"
            className="mt-6 flex items-center gap-2 border border-destructive/40 bg-secondary p-4 text-sm"
          >
            <AlertCircle className="size-4 text-destructive" />{' '}
            {errorText}
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
                    <span className="text-right font-mono text-sm">
                      {line.unitPriceCents === null
                        ? '—'
                        : formatCents(line.unitPriceCents * line.quantity)}
                      {line.listUnitPriceCents !== null && line.unitPriceCents !== null && (
                        <span className="block text-xs font-semibold text-primary">
                          volume price {formatCents(line.unitPriceCents)} per unit, was{' '}
                          {formatCents(line.listUnitPriceCents)}
                        </span>
                      )}
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
            {freeShipping && (
              <p className="mt-1 text-right text-xs font-semibold text-primary">{freeShippingLine(freeShipping)}</p>
            )}

            <SupportStrip className="mt-8" />

            {!onlineOrderingOpen() ? (
              <p
                role="status"
                className="mt-10 flex items-start gap-2 border border-border bg-secondary p-6 text-sm leading-6"
              >
                <AlertCircle className="mt-1 size-4 shrink-0 text-primary" />
                {STOREFRONT_COPY.orderingNotOpen}
              </p>
            ) : open ? (
              <CheckoutExperience
                subtotalCents={cart.subtotalCents}
                token={crypto.randomUUID().replace(/-/g, '')}
                acknowledgement={RUO_ACKNOWLEDGEMENT}
                ageStatement={AGE_STATEMENT}
                email={account?.status === 'guest' ? '' : account?.email}
                name={account?.status === 'guest' ? '' : account?.name}
                quoteRequired={checkoutQuotesRequired()}
                orderable={cart.orderable}
                addresses={savedAddresses}
                canSaveAddress={Boolean(account && account.status !== 'guest')}
                researchSettings={RESEARCH_SETTINGS}
              />
            ) : (
              <CheckoutExperience
                subtotalCents={cart.subtotalCents}
                token={crypto.randomUUID().replace(/-/g, '')}
                acknowledgement={RUO_ACKNOWLEDGEMENT}
                ageStatement={AGE_STATEMENT}
                quoteRequired={checkoutQuotesRequired()}
                orderable={cart.orderable && org?.verificationStatus === 'approved'}
                researchSettings={RESEARCH_SETTINGS}
                destination={
                  org && org.verificationStatus === 'approved'
                    ? {
                        heading: 'Ships to your organization',
                        intro:
                          'Wholesale orders ship only to the approved address on record. Compare eligible carrier services for it below.',
                        body: (
                          <div className="rounded-xl border border-border bg-secondary p-4 text-sm leading-6">
                            <p className="font-semibold">
                              {org.receivingParty}, {org.legalName}
                            </p>
                            <p className="text-muted-foreground">
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
                              {STOREFRONT_COPY.wholesaleAddressOnly} Material is picked from a
                              released lot by a named person, and that lot&apos;s certificate of
                              analysis ships with it.
                            </p>
                          </div>
                        ),
                      }
                    : {
                        heading: 'Wholesale checkout',
                        intro: STOREFRONT_COPY.wholesaleApplyPrompt,
                        body: (
                          <p className="text-sm">
                            <Link
                              href="/account/organization"
                              className="font-semibold text-primary"
                            >
                              {STOREFRONT_COPY.wholesaleApplyAction}
                            </Link>
                            .
                          </p>
                        ),
                      }
                }
              />
            )}
          </>
        )}
        </div>
      </section>
    </main>
  );
}
