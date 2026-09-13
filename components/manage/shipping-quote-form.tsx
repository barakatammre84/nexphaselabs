'use client';
import { useState } from 'react';
import type { ShippingRate } from '@/lib/shipping-rates';

type Defaults = Partial<
  Record<
    | 'name'
    | 'street1'
    | 'city'
    | 'state'
    | 'zip'
    | 'length'
    | 'width'
    | 'height'
    | 'weight',
    string | number
  >
> & { residential?: boolean };

export function ShippingQuoteForm({
  defaults = {},
  shipmentFormId,
}: {
  defaults?: Defaults;
  shipmentFormId?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    error?: string;
    rates?: ShippingRate[];
    test?: boolean;
    warning?: string | null;
    comparedCarriers?: string[];
  } | null>(null);
  return (
    <form
      className="mt-6"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        const form = new FormData(event.currentTarget);
        setBusy(true);
        setResult(null);
        try {
          const response = await fetch('/api/manage/shipping/quote', {
            method: 'POST',
            body: form,
          });
          const data = (await response.json()) as NonNullable<typeof result>;
          setResult(
            response.ok ? data : { error: data.error ?? 'Quote unavailable.' },
          );
        } catch {
          setResult({ error: 'Quote unavailable. No label was purchased.' });
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-4 font-semibold">
          Destination and packed parcel
        </legend>
        {[
          ['name', 'Recipient', 'text'],
          ['street1', 'Street address', 'text'],
          ['city', 'City', 'text'],
          ['state', 'State (two letters)', 'text'],
          ['zip', 'ZIP code', 'text'],
          ['length', 'Packed length (in)', 'number'],
          ['width', 'Packed width (in)', 'number'],
          ['height', 'Packed height (in)', 'number'],
          ['weight', 'Packed weight (lb)', 'number'],
          ['maxDays', 'Maximum estimated transit days (optional)', 'number'],
        ].map(([name, label, type]) => (
          <label key={name} className="block text-sm">
            <span>{label}</span>
            <input
              name={name}
              type={type}
              required={name !== 'maxDays'}
              min={
                type === 'number' ? (name === 'maxDays' ? 1 : 0.001) : undefined
              }
              step={
                name === 'maxDays' ? 1 : type === 'number' ? 0.001 : undefined
              }
              defaultValue={
                defaults[name as keyof Defaults] as string | number | undefined
              }
              maxLength={160}
              className="mt-2 h-12 w-full rounded border border-border bg-background px-3 text-base"
            />
          </label>
        ))}
        <label className="text-sm">
          Address type
          <select
            name="residential"
            defaultValue={String(defaults.residential ?? true)}
            className="mt-2 h-12 w-full rounded border border-border bg-background px-3"
          >
            <option value="true">Residential</option>
            <option value="false">Commercial</option>
          </select>
        </label>
        <label className="flex items-start gap-3 text-sm sm:col-span-2">
          <input
            type="checkbox"
            name="ordinaryParcel"
            required
            className="mt-1"
          />
          <span>
            I have checked the material and packing requirements. This quote is
            for an ordinary ambient parcel, with no dry ice or dangerous goods.
            Special handling needs a separate shipping workflow.
          </span>
        </label>
      </fieldset>
      <button
        disabled={busy}
        className="mt-5 min-h-12 bg-primary px-6 font-semibold text-primary-foreground disabled:opacity-50"
      >
        {busy ? 'Comparing rates…' : 'Compare delivery services'}
      </button>
      <p className="mt-3 text-sm text-muted-foreground">
        Gets rates only. Does not buy a label, charge a customer, or mark an
        order shipped.
      </p>
      <div aria-live="polite" aria-busy={busy} className="mt-5">
        {result?.error && (
          <p role="alert" className="text-destructive">
            {result.error}
          </p>
        )}
        {result?.rates && (
          <>
            <p className="font-semibold">
              {result.test
                ? 'Test rates — not real shipping prices'
                : 'Quoted postage'}{' '}
              · {result.comparedCarriers?.join(', ')}
            </p>
            <p className="mt-2 text-sm">
              Lowest price among the eligible returned rates is listed first.
              Estimates are not guaranteed delivery commitments or final carrier
              invoices.
            </p>
            {result.warning && (
              <p className="mt-2 text-sm text-destructive">{result.warning}</p>
            )}
            <ul className="mt-4 divide-y divide-border">
              {result.rates.map((rate, i) => (
                <li
                  key={rate.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-4 text-sm"
                >
                  <span>
                    {rate.carrier} {rate.serviceName}
                    {i === 0 ? ' — lowest returned quote' : ''}
                    <span className="block text-muted-foreground">
                      {rate.estimatedDays === null
                        ? 'Transit estimate unavailable'
                        : `${rate.estimatedDays} estimated transit days`}
                    </span>
                  </span>
                  <span className="font-semibold">
                    ${(rate.cents / 100).toFixed(2)}
                  </span>
                  {shipmentFormId && (
                    <button
                      type="button"
                      className="min-h-10 border border-border px-3 font-semibold"
                      onClick={() => {
                        const form = document.getElementById(shipmentFormId);
                        const carrier = form?.querySelector<HTMLInputElement>(
                          'input[name="carrier"]',
                        );
                        const note =
                          form?.querySelector<HTMLInputElement>(
                            'input[name="note"]',
                          );
                        if (carrier) carrier.value = rate.carrier;
                        if (note && !note.value)
                          note.value = `${rate.carrier} ${rate.serviceName}; quoted $${(rate.cents / 100).toFixed(2)}`;
                        form?.scrollIntoView({
                          behavior: 'smooth',
                          block: 'start',
                        });
                      }}
                    >
                      Use this service
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </form>
  );
}
