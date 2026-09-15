'use client';

import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import {
  Check,
  LoaderCircle,
  PackageCheck,
  ShieldCheck,
  Truck,
} from 'lucide-react';
import { CheckoutFields, type PickableAddress } from '@/components/site/checkout-fields';

type Quote = {
  id: string;
  carrier: 'USPS' | 'UPS' | 'FedEx';
  serviceName: string;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
  estimatedDays: number | null;
  expiresAt: string;
  test: boolean;
};

const money = (cents: number) =>
  `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Controls that cannot change a delivery quote. A quote is bound to the delivery
 * address and contact email, so every other control, the saved-address picker
 * included, invalidates it. Choosing among the returned rates must not: a rate
 * radio's change event bubbles to the form like any other.
 */
const QUOTE_NEUTRAL_FIELDS: ReadonlySet<string> = new Set([
  'checkout_quote',
  'delivery_choice',
  'save_address',
  'research_setting',
  'note',
  'confirm_age',
  'confirm_ruo',
]);

export function invalidatesQuote(fieldName: string): boolean {
  return !QUOTE_NEUTRAL_FIELDS.has(fieldName);
}

export function CheckoutExperience({
  subtotalCents,
  token,
  acknowledgement,
  ageStatement,
  email,
  name,
  quoteRequired,
  orderable,
  addresses = [],
  canSaveAddress = false,
  researchSettings = [],
  destination,
}: {
  subtotalCents: number;
  token: string;
  acknowledgement: string;
  ageStatement: string;
  email?: string;
  name?: string;
  quoteRequired: boolean;
  orderable: boolean;
  addresses?: PickableAddress[];
  canSaveAddress?: boolean;
  /** Offered as an optional, descriptive field and recorded with the order. */
  researchSettings?: readonly string[];
  /**
   * A fixed destination shown instead of the address fields: wholesale orders
   * ship only to the approved organization's address on record.
   */
  destination?: { heading: string; intro: string; body: ReactNode };
}) {
  const [busy, setBusy] = useState(false);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const selected = useMemo(
    () => quotes.find((quote) => quote.id === selectedId) ?? null,
    [quotes, selectedId],
  );

  const invalidateQuote = (target: EventTarget) => {
    if (
      !(
        target instanceof HTMLInputElement ||
        target instanceof HTMLSelectElement
      )
    )
      return;
    if (!invalidatesQuote(target.name)) return;
    if (quotes.length) {
      setQuotes([]);
      setSelectedId('');
      setMessage('Delivery details changed. Compare rates again.');
    }
  };

  return (
    <form
      method="post"
      action="/api/orders"
      className="mt-10"
      onChange={(event) => invalidateQuote(event.target)}
      onSubmit={(event) => {
        if (quoteRequired && !selected) {
          event.preventDefault();
          setMessage(
            'Compare delivery options and choose an eligible service before continuing.',
          );
        }
      }}
    >
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="checkout_quote" value={selectedId} />

      <ol aria-label="Checkout progress" className="checkout-progress">
        {['Cart', 'Delivery', 'Payment', 'Confirmation'].map((step, index) => (
          <li
            key={step}
            className={index <= 1 ? 'is-current' : ''}
            aria-current={index === 1 ? 'step' : undefined}
          >
            <span>
              {index < 1 ? <Check className="size-3.5" /> : index + 1}
            </span>
            {step}
          </li>
        ))}
      </ol>

      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="rounded-[1.5rem] border border-border bg-white p-5 shadow-[0_16px_38px_rgba(34,46,113,0.07)] sm:p-7">
          <div className="flex items-start gap-3">
            <PackageCheck className="mt-0.5 size-5 text-primary" />
            <div>
              <h2 className="font-display text-xl font-bold tracking-tight">
                {destination?.heading ?? 'Where should the order go?'}
              </h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {destination?.intro ??
                  'Enter the receiving address, then compare eligible carrier services. No account or email verification is required.'}
              </p>
            </div>
          </div>
          {destination ? (
            <div className="mt-6">{destination.body}</div>
          ) : (
            <CheckoutFields email={email} name={name} addresses={addresses} canSave={canSaveAddress} />
          )}

          <div className="mt-8 border-t border-border pt-7">
            <div className="flex items-start gap-3">
              <Truck className="mt-0.5 size-5 text-primary" />
              <div>
                <h2 className="font-display text-xl font-bold tracking-tight">
                  Delivery options
                </h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Rates include the configured parcel profile and are held for
                  30 minutes.
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled={busy || !orderable}
              className="mt-5 inline-flex min-h-12 items-center gap-2 rounded-full bg-[var(--ion-navy)] px-5 text-sm font-bold text-white disabled:opacity-50"
              onClick={async (event) => {
                const form = event.currentTarget.form;
                if (!form || busy) return;
                setBusy(true);
                setMessage(null);
                setQuotes([]);
                setSelectedId('');
                try {
                  const response = await fetch('/api/checkout/quotes', {
                    method: 'POST',
                    body: new FormData(form),
                  });
                  const result = (await response.json()) as {
                    ok?: boolean;
                    quotes?: Quote[];
                    warning?: string | null;
                    error?: string;
                  };
                  if (!response.ok || !result.ok || !result.quotes?.length) {
                    setMessage(
                      result.error ??
                        'Delivery options are unavailable. Check the address and try again.',
                    );
                    return;
                  }
                  setQuotes(result.quotes);
                  setSelectedId(result.quotes[0].id);
                  setMessage(
                    result.warning ?? 'Lowest eligible returned rate selected.',
                  );
                } catch {
                  setMessage(
                    'Delivery and tax could not be confirmed. Try again.',
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Truck className="size-4" />
              )}
              {busy
                ? 'Comparing delivery services…'
                : 'Compare delivery services'}
            </button>
            <div aria-live="polite" aria-busy={busy}>
              {message && (
                <p className="mt-4 text-sm leading-6 text-muted-foreground">
                  {message}
                </p>
              )}
              {quotes.length > 0 && (
                <fieldset className="mt-5 space-y-3">
                  <legend className="sr-only">Choose a delivery service</legend>
                  {quotes.map((quote, index) => (
                    <label
                      key={quote.id}
                      className={`shipping-choice ${selectedId === quote.id ? 'is-selected' : ''}`}
                    >
                      <input
                        type="radio"
                        name="delivery_choice"
                        value={quote.id}
                        checked={selectedId === quote.id}
                        onChange={() => setSelectedId(quote.id)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">
                          {quote.carrier} {quote.serviceName}
                        </span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {quote.estimatedDays === null
                            ? 'Transit estimate unavailable'
                            : `${quote.estimatedDays} estimated business days`}
                          {index === 0 ? ' · lowest eligible rate' : ''}
                        </span>
                      </span>
                      <span className="font-mono font-semibold">
                        {money(quote.shippingCents)}
                      </span>
                    </label>
                  ))}
                </fieldset>
              )}
            </div>
          </div>

          {researchSettings.length > 0 && (
            <label className="mt-8 block text-sm" htmlFor="research_setting">
              <span className="font-semibold">
                Research setting{' '}
                <span className="font-normal text-muted-foreground">
                  (optional)
                </span>
              </span>
              <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                Where the material will be used. Descriptive only; it does not
                affect eligibility.
              </span>
              <select
                id="research_setting"
                name="research_setting"
                defaultValue=""
                className="mt-2 h-12 w-full rounded-xl border border-input bg-secondary px-4 text-base outline-none focus:border-primary"
              >
                <option value="">Choose one (optional)</option>
                {researchSettings.map((setting) => (
                  <option key={setting} value={setting}>
                    {setting}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="mt-5 block text-sm">
            <span className="font-semibold">
              Note for this order{' '}
              <span className="font-normal text-muted-foreground">
                (optional)
              </span>
            </span>
            <textarea
              name="note"
              maxLength={500}
              className="mt-2 min-h-[5rem] w-full rounded-xl border border-input bg-secondary p-3 text-base outline-none focus:border-primary"
            />
          </label>
          <div className="mt-7 border-l-2 border-primary bg-secondary px-4 py-4 text-sm leading-6">
            {acknowledgement}
          </div>
          <label className="mt-4 flex items-start gap-3 text-sm leading-6">
            <input type="checkbox" name="confirm_age" required className="mt-1" />
            <span>{ageStatement}</span>
          </label>
          <label className="mt-3 flex items-start gap-3 text-sm leading-6">
            <input
              type="checkbox"
              name="confirm_ruo"
              required
              className="mt-1"
            />
            <span>
              I confirm the research-use acknowledgement and accept the{' '}
              <Link
                href="/legal/terms"
                className="font-semibold text-primary underline"
              >
                terms of sale
              </Link>{' '}
              for this order.
            </span>
          </label>
        </div>

        <aside className="checkout-summary lg:sticky lg:top-5">
          <p className="font-display text-lg font-bold">Complete total</p>
          <dl className="mt-5 space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt>Materials</dt>
              <dd className="font-mono">{money(subtotalCents)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Shipping</dt>
              <dd className="font-mono">
                {selected ? money(selected.shippingCents) : 'Select delivery'}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Estimated tax</dt>
              <dd className="font-mono">
                {selected
                  ? money(selected.taxCents)
                  : 'Calculated with delivery'}
              </dd>
            </div>
            <div className="flex justify-between gap-4 border-t border-foreground/20 pt-4 text-base font-bold">
              <dt>Total</dt>
              <dd className="font-mono">
                {money(selected?.totalCents ?? subtotalCents)}
              </dd>
            </div>
          </dl>
          {selected?.test && (
            <p className="mt-4 border border-amber-300 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
              Test environment: rates, tax and payment are synthetic. No money
              or shipment moves.
            </p>
          )}
          <button
            type="submit"
            disabled={!orderable || (quoteRequired && !selected) || busy}
            className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-45"
          >
            Continue to payment
          </button>
          <div className="mt-5 flex gap-2 text-xs leading-5 text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>
              Prices, shipping and tax are verified again by the server before
              the order is created.
            </span>
          </div>
        </aside>
      </div>
    </form>
  );
}
