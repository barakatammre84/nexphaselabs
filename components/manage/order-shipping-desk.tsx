'use client';

import { useState } from 'react';
import {
  ExternalLink,
  LoaderCircle,
  PackageCheck,
  Printer,
  Truck,
} from 'lucide-react';

type Quote = {
  id: string;
  carrier: 'UPS' | 'FedEx';
  serviceName: string;
  amountCents: number;
  estimatedDays: number | null;
  test: boolean;
  expiresAt: string;
};
type Label = {
  state: string;
  carrier: string;
  serviceName: string;
  amountCents: number;
  trackingNumber: string | null;
  labelUrl: string | null;
  test: boolean;
  error: string | null;
};
const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export function OrderShippingDesk({
  orderNumber,
  parcel,
  initialLabel,
}: {
  orderNumber: string;
  parcel: {
    length: number;
    width: number;
    height: number;
    weight: number;
  } | null;
  initialLabel: Label | null;
}) {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [selected, setSelected] = useState('');
  const [label, setLabel] = useState(initialLabel);
  const [busy, setBusy] = useState<'quote' | 'label' | null>(null);
  const [message, setMessage] = useState<string | null>(
    initialLabel?.error ?? null,
  );

  const fillShipment = (value: Label) => {
    const form = document.getElementById('shipment-record');
    const carrier = form?.querySelector<HTMLInputElement>(
      'input[name="carrier"]',
    );
    const tracking = form?.querySelector<HTMLInputElement>(
      'input[name="tracking"]',
    );
    const note = form?.querySelector<HTMLInputElement>('input[name="note"]');
    if (carrier) carrier.value = value.carrier;
    if (tracking && value.trackingNumber) tracking.value = value.trackingNumber;
    if (note && !note.value)
      note.value = `${value.carrier} ${value.serviceName}; label ${money(value.amountCents)}`;
  };

  return (
    <section className="mt-4 border border-border p-5">
      <div className="flex items-start gap-3">
        <Truck className="mt-0.5 size-5 text-primary" />
        <div>
          <h3 className="font-display text-lg font-semibold">Shipping desk</h3>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Confirm the final packed parcel, compare UPS and FedEx, then
            purchase exactly one label for this order.
          </p>
        </div>
      </div>
      {label ? (
        <div
          className={`mt-5 border p-4 text-sm ${label.state === 'ready' ? 'border-primary bg-secondary' : 'border-destructive/40'}`}
        >
          <p className="font-semibold">
            {label.state === 'ready'
              ? `${label.test ? 'Test label' : 'Shipping label'} ready`
              : 'Label request needs reconciliation'}
          </p>
          <p className="mt-1 text-muted-foreground">
            {label.carrier} {label.serviceName} · {money(label.amountCents)}
            {label.trackingNumber ? ` · ${label.trackingNumber}` : ''}
          </p>
          {label.state === 'ready' && (
            <div className="mt-4 flex flex-wrap gap-3">
              <a
                target="_blank"
                rel="noreferrer"
                className="action-secondary"
                href={
                  label.test
                    ? `/api/manage/orders/${encodeURIComponent(orderNumber)}/shipping/label-pdf`
                    : (label.labelUrl ?? '#')
                }
              >
                {label.test ? (
                  <Printer className="mr-2 size-4" />
                ) : (
                  <ExternalLink className="mr-2 size-4" />
                )}
                Open label
              </a>
              <button
                type="button"
                className="action-primary"
                onClick={() => {
                  fillShipment(label);
                  document
                    .getElementById('shipment-record')
                    ?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                Use tracking below
              </button>
            </div>
          )}
          {label.error && (
            <p className="mt-3 text-destructive">{label.error}</p>
          )}
        </div>
      ) : (
        <form
          className="mt-5"
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy) return;
            setBusy('quote');
            setMessage(null);
            setQuotes([]);
            setSelected('');
            try {
              const response = await fetch(
                `/api/manage/orders/${encodeURIComponent(orderNumber)}/shipping/quote`,
                { method: 'POST', body: new FormData(event.currentTarget) },
              );
              const result = (await response.json()) as {
                ok?: boolean;
                quotes?: Quote[];
                warning?: string | null;
                error?: string;
              };
              if (!response.ok || !result.ok || !result.quotes?.length)
                return setMessage(
                  result.error ?? 'No eligible shipping rates were returned.',
                );
              setQuotes(result.quotes);
              setSelected(result.quotes[0].id);
              setMessage(
                result.warning ?? 'Lowest eligible returned rate selected.',
              );
            } catch {
              setMessage(
                'Carrier rates could not be confirmed. No label was purchased.',
              );
            } finally {
              setBusy(null);
            }
          }}
        >
          <div className="grid gap-4 sm:grid-cols-4">
            {(['length', 'width', 'height', 'weight'] as const).map((name) => (
              <label key={name} className="text-sm">
                <span className="capitalize">
                  {name} {name === 'weight' ? '(lb)' : '(in)'}
                </span>
                <input
                  name={name}
                  type="number"
                  min="0.001"
                  step="0.001"
                  required
                  defaultValue={parcel?.[name]}
                  className="mt-2 h-11 w-full rounded border border-border bg-background px-3"
                />
              </label>
            ))}
          </div>
          <label className="mt-4 flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              name="ordinaryParcel"
              required
              className="mt-1"
            />
            <span>
              I confirmed the package is an ordinary ambient parcel with no dry
              ice or dangerous-goods handling.
            </span>
          </label>
          <button
            disabled={Boolean(busy)}
            className="mt-4 inline-flex min-h-11 items-center gap-2 bg-foreground px-4 font-semibold text-background disabled:opacity-50"
          >
            {busy === 'quote' ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <PackageCheck className="size-4" />
            )}
            Compare packed parcel
          </button>
          <div aria-live="polite">
            {message && (
              <p className="mt-4 text-sm text-muted-foreground">{message}</p>
            )}
          </div>
          {quotes.length > 0 && (
            <fieldset className="mt-5 space-y-3">
              <legend className="sr-only">Select label service</legend>
              {quotes.map((quote, index) => (
                <label
                  key={quote.id}
                  className={`shipping-choice text-sm ${selected === quote.id ? 'is-selected' : ''}`}
                >
                  <input
                    type="radio"
                    name="quote-choice"
                    value={quote.id}
                    checked={selected === quote.id}
                    onChange={() => setSelected(quote.id)}
                  />
                  <span className="flex-1">
                    <strong>
                      {quote.carrier} {quote.serviceName}
                    </strong>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {quote.estimatedDays === null
                        ? 'Transit estimate unavailable'
                        : `${quote.estimatedDays} estimated business days`}
                      {index === 0 ? ' · lowest eligible rate' : ''}
                      {quote.test ? ' · test' : ''}
                    </span>
                  </span>
                  <span className="font-mono font-semibold">
                    {money(quote.amountCents)}
                  </span>
                </label>
              ))}
            </fieldset>
          )}
          {selected && (
            <button
              type="button"
              disabled={Boolean(busy)}
              className="mt-5 action-primary"
              onClick={async () => {
                const chosen = quotes.find((quote) => quote.id === selected);
                if (!chosen) return;
                if (
                  !chosen.test &&
                  !window.confirm(
                    `Purchase one ${chosen.carrier} ${chosen.serviceName} label for ${money(chosen.amountCents)}? This charges the connected shipping account.`,
                  )
                )
                  return;
                setBusy('label');
                setMessage(null);
                const data = new FormData();
                data.set('quote', selected);
                try {
                  const response = await fetch(
                    `/api/manage/orders/${encodeURIComponent(orderNumber)}/shipping/label`,
                    { method: 'POST', body: data },
                  );
                  const result = (await response.json()) as {
                    ok?: boolean;
                    label?: Label;
                    error?: string;
                  };
                  if (!response.ok || !result.ok || !result.label)
                    return setMessage(
                      result.error ??
                        'Label purchase was not confirmed. Do not retry until reconciled.',
                    );
                  setLabel(result.label);
                  fillShipment(result.label);
                  setMessage(
                    'Label and tracking are ready. Review the picks before recording shipment.',
                  );
                } catch {
                  setMessage(
                    'Label purchase outcome is uncertain. Do not retry until the provider dashboard is checked.',
                  );
                } finally {
                  setBusy(null);
                }
              }}
            >
              {busy === 'label'
                ? 'Purchasing label…'
                : `${chosenLabel(quotes, selected)?.test ? 'Create test label' : 'Purchase selected label'}`}
            </button>
          )}
        </form>
      )}
    </section>
  );
}

function chosenLabel(quotes: Quote[], id: string) {
  return quotes.find((quote) => quote.id === id);
}
