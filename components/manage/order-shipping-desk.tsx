'use client';

import { useState } from 'react';
import {
  ExternalLink,
  LoaderCircle,
  PackageCheck,
  Printer,
  RotateCcw,
  Truck,
} from 'lucide-react';

type Quote = {
  id: string;
  carrier: 'USPS' | 'UPS' | 'FedEx';
  originId: string;
  originLabel: string;
  serviceName: string;
  amountCents: number;
  estimatedDays: number | null;
  test: boolean;
  expiresAt: string;
};
type Label = {
  id: string;
  state: string;
  originLabel: string;
  carrier: string;
  serviceName: string;
  amountCents: number;
  trackingNumber: string | null;
  labelUrl: string | null;
  test: boolean;
  error: string | null;
  refundState: string | null;
  refundRef: string | null;
  refundReason: string | null;
  createdAt: string;
  refundRequestedAt: string | null;
  refundRequestedBy: string | null;
};
const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export function OrderShippingDesk({
  orderNumber,
  parcel,
  initialLabel,
  initialHistory,
  origins,
  financeAuthorized,
}: {
  orderNumber: string;
  parcel: {
    length: number;
    width: number;
    height: number;
    weight: number;
  } | null;
  initialLabel: Label | null;
  initialHistory: Label[];
  origins: { id: string; label: string }[];
  financeAuthorized: boolean;
}) {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [selected, setSelected] = useState('');
  const [label, setLabel] = useState(initialLabel);
  const [history, setHistory] = useState(initialHistory);
  const [busy, setBusy] = useState<
    'quote' | 'label' | 'refund' | 'reconcile' | 'clear' | null
  >(null);
  const [message, setMessage] = useState<string | null>(
    initialLabel?.error ?? null,
  );

  const recordLabel = (value: Label) => {
    setLabel(value);
    setHistory((current) => {
      const index = current.findIndex((item) => item.id === value.id);
      if (index === -1) return [value, ...current];
      return current.map((item) => (item.id === value.id ? value : item));
    });
  };

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
            Choose the ship-from location, confirm the final packed parcel,
            compare approved carrier services, then purchase one active label.
          </p>
        </div>
      </div>
      {label && (
        <div
          className={`mt-5 border p-4 text-sm ${label.state === 'ready' ? 'border-primary bg-secondary' : label.state === 'voided' ? 'border-border bg-secondary' : 'border-destructive/40'}`}
        >
          <p className="font-semibold">
            {label.state === 'ready'
              ? `${label.test ? 'Test label' : 'Shipping label'} ready`
              : label.state === 'voided'
                ? label.refundState
                  ? 'Label cancelled and refund confirmed'
                  : 'Failed label purchase cleared'
                : label.state === 'voiding'
                  ? 'Label refund pending'
                  : 'Label request needs reconciliation'}
          </p>
          <p className="mt-1 text-muted-foreground">
            {label.carrier} {label.serviceName} · {money(label.amountCents)}
            {label.trackingNumber ? ` · ${label.trackingNumber}` : ''}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Ship from: {label.originLabel}
            {label.refundReason ? ` · Cancellation: ${label.refundReason}` : ''}
          </p>
          {label.state === 'ready' && financeAuthorized && (
            <div className="mt-4 flex flex-wrap gap-3">
              {label.labelUrl ? (
                <a
                  target="_blank"
                  rel="noreferrer"
                  className="action-secondary"
                  href={
                    label.test
                      ? `/api/manage/orders/${encodeURIComponent(orderNumber)}/shipping/label-pdf`
                      : label.labelUrl
                  }
                >
                  {label.test ? (
                    <Printer className="mr-2 size-4" />
                  ) : (
                    <ExternalLink className="mr-2 size-4" />
                  )}
                  Open label
                </a>
              ) : (
                <p className="self-center text-xs text-muted-foreground">
                  {label.test
                    ? 'This test label has no file to print.'
                    : 'The carrier returned no label file. Reconcile this label before shipping.'}
                </p>
              )}
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
          {label.state === 'ready' && (
            <form
              className="mt-4 border-t border-border pt-4"
              onSubmit={async (event) => {
                event.preventDefault();
                if (busy) return;
                const form = new FormData(event.currentTarget);
                if (
                  !label.test &&
                  !window.confirm(
                    `Request a carrier refund for this ${label.carrier} label? Do not tender the package after confirming.`,
                  )
                )
                  return;
                setBusy('refund');
                setMessage(null);
                try {
                  const response = await fetch(
                    `/api/manage/orders/${encodeURIComponent(orderNumber)}/shipping/refund`,
                    { method: 'POST', body: form },
                  );
                  const result = (await response.json()) as {
                    ok?: boolean;
                    pending?: boolean;
                    label?: Label;
                    error?: string;
                  };
                  if (result.label) recordLabel(result.label);
                  if (!response.ok && !result.pending)
                    return setMessage(
                      result.error ??
                        'Label cancellation was not confirmed. Reconcile it in Shippo.',
                    );
                  setMessage(
                    result.pending
                      ? 'Carrier refund is pending. Do not ship or request another label.'
                      : 'Label cancellation and refund confirmed. A replacement label can now be created.',
                  );
                } catch {
                  setMessage(
                    'Label cancellation outcome is uncertain. Do not retry; reconcile it in Shippo.',
                  );
                } finally {
                  setBusy(null);
                }
              }}
            >
              <label className="block">
                Cancellation reason
                <input
                  name="reason"
                  required
                  minLength={3}
                  maxLength={300}
                  className="mt-2 h-11 w-full border border-border bg-background px-3"
                />
              </label>
              <button
                disabled={Boolean(busy)}
                className="mt-3 action-secondary"
              >
                <RotateCcw className="mr-2 size-4" />
                {busy === 'refund'
                  ? 'Requesting cancellation…'
                  : label.test
                    ? 'Cancel test label'
                    : 'Request label refund'}
              </button>
            </form>
          )}
          {financeAuthorized && ['voiding', 'attention'].includes(label.state) &&
            label.refundState && (
              <button
                type="button"
                disabled={Boolean(busy)}
                className="mt-4 action-secondary"
                onClick={async () => {
                  setBusy('reconcile');
                  setMessage(null);
                  try {
                    const response = await fetch(
                      `/api/manage/orders/${encodeURIComponent(orderNumber)}/shipping/refund/reconcile`,
                      { method: 'POST' },
                    );
                    const result = (await response.json()) as {
                      ok?: boolean;
                      pending?: boolean;
                      label?: Label;
                      error?: string;
                    };
                    if (result.label) recordLabel(result.label);
                    setMessage(
                      result.ok
                        ? 'Carrier refund confirmed.'
                        : result.pending
                          ? 'Carrier refund is still pending.'
                          : (result.error ?? 'Refund status needs review.'),
                    );
                  } catch {
                    setMessage('Carrier refund status could not be confirmed.');
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                {busy === 'reconcile'
                  ? 'Checking carrier…'
                  : 'Check refund status'}
              </button>
            )}
          {label.error && (
            <p className="mt-3 text-destructive">{label.error}</p>
          )}
          {financeAuthorized && label.state === 'attention' &&
            !label.refundState &&
            !label.trackingNumber && (
              <form
                className="mt-4 grid gap-3 border-t border-border pt-4"
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (busy) return;
                  setBusy('clear');
                  setMessage(null);
                  try {
                    const response = await fetch(
                      `/api/manage/orders/${encodeURIComponent(orderNumber)}/shipping/clear-failed`,
                      { method: 'POST', body: new FormData(event.currentTarget) },
                    );
                    const result = (await response.json()) as {
                      ok?: boolean;
                      label?: Label;
                      error?: string;
                    };
                    if (result.label) recordLabel(result.label);
                    setMessage(
                      result.ok
                        ? 'Failed purchase cleared. Compare rates to buy a replacement label.'
                        : (result.error ?? 'The failed purchase could not be cleared.'),
                    );
                  } catch {
                    setMessage('The failed purchase could not be cleared. Try again.');
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                <p className="text-xs leading-5 text-muted-foreground">
                  The carrier did not confirm this purchase. Check the carrier
                  account for a label on this order before clearing it; if one
                  was bought, refund it there first.
                </p>
                <label className="flex flex-col gap-1.5 text-xs font-semibold">
                  What you checked
                  <input
                    name="reason"
                    required
                    minLength={3}
                    maxLength={300}
                    className="h-10 border border-foreground/20 bg-background px-3 text-sm font-normal"
                  />
                </label>
                <label className="flex items-start gap-2 text-xs leading-5">
                  <input type="checkbox" name="confirm" required className="mt-0.5" />
                  The carrier account shows no label for this order.
                </label>
                <button
                  type="submit"
                  disabled={Boolean(busy)}
                  className="action-secondary w-fit"
                >
                  {busy === 'clear' ? 'Clearing…' : 'Clear failed purchase'}
                </button>
              </form>
            )}
        </div>
      )}
      {(!label || label.state === 'voided') && (
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
          <label className="mb-4 block text-sm">
            Ship-from location
            <select
              name="origin"
              required
              defaultValue={origins[0]?.id ?? ''}
              className="mt-2 h-11 w-full border border-border bg-background px-3 sm:max-w-md"
            >
              {origins.length === 0 && (
                <option value="">No active location configured</option>
              )}
              {origins.map((origin) => (
                <option key={origin.id} value={origin.id}>
                  {origin.label}
                </option>
              ))}
            </select>
          </label>
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
                  recordLabel(result.label);
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
      {history.length > 0 && (
        <div className="mt-6 border-t border-border pt-5">
          <h4 className="font-semibold">Label history</h4>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Every purchased, cancelled, or unresolved label stays attached to
            the order for review.
          </p>
          <ul className="mt-3 space-y-3">
            {history.map((item) => (
              <li key={item.id} className="border border-border p-3 text-sm">
                <p className="font-semibold">
                  {item.carrier} {item.serviceName} · {money(item.amountCents)} ·{' '}
                  {item.state}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {item.originLabel} · {item.createdAt.slice(0, 10)}
                  {item.trackingNumber ? ` · ${item.trackingNumber}` : ''}
                </p>
                {item.refundReason && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Cancellation: {item.refundReason}
                    {item.refundState ? ` · refund ${item.refundState}` : ''}
                    {item.refundRequestedBy
                      ? ` · requested by ${item.refundRequestedBy}`
                      : ''}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function chosenLabel(quotes: Quote[], id: string) {
  return quotes.find((quote) => quote.id === id);
}
