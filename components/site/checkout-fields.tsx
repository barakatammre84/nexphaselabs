'use client';

import { useState } from 'react';

export type PickableAddress = {
  id: string;
  label: string | null;
  isDefault: boolean;
  shipTo: {
    consigneeName: string;
    consigneeInstitution: string | null;
    line1: string;
    line2: string | null;
    city: string;
    region: string;
    postalCode: string;
    country: string;
    phone: string | null;
  };
};

export function CheckoutFields({
  email = '',
  name = '',
  addresses = [],
  canSave = false,
}: {
  email?: string;
  name?: string;
  /** Saved addresses, for a signed-in customer. Empty for guests. */
  addresses?: PickableAddress[];
  canSave?: boolean;
}) {
  // The picker refills the inputs by remounting them with new defaults, so the
  // fields stay ordinary uncontrolled inputs that a password manager and the
  // browser's own autofill still understand.
  const [pickedId, setPickedId] = useState(
    addresses.find((address) => address.isDefault)?.id ?? addresses[0]?.id ?? '',
  );
  const picked = addresses.find((address) => address.id === pickedId);
  const from = picked?.shipTo;

  const fields = [
    ['email', 'Email for order updates', 'email', 'email', true, email, 254],
    ['name', 'Recipient name', 'text', 'name', true, from?.consigneeName ?? name, 160],
    [
      'company',
      'Company or institution (optional)',
      'text',
      'organization',
      false,
      from?.consigneeInstitution ?? '',
      160,
    ],
    ['line1', 'Street address', 'text', 'address-line1', true, from?.line1 ?? '', 160],
    [
      'line2',
      'Apartment, suite, etc. (optional)',
      'text',
      'address-line2',
      false,
      from?.line2 ?? '',
      160,
    ],
    ['city', 'City', 'text', 'address-level2', true, from?.city ?? '', 160],
    ['region', 'State', 'text', 'address-level1', true, from?.region ?? '', 80],
    ['postalCode', 'ZIP code', 'text', 'postal-code', true, from?.postalCode ?? '', 24],
    ['phone', 'Phone (optional)', 'tel', 'tel', false, from?.phone ?? '', 40],
  ] as const;

  return (
    <fieldset className="mt-6">
      <legend className="font-semibold">Contact &amp; delivery</legend>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        No sign-up, email verification, or organization approval. This browser
        keeps your cart and orders private for 30 days. Save your order number;
        use the same browser to return.
      </p>

      {addresses.length > 0 && (
        <label className="mt-5 block text-sm">
          <span className="font-semibold">Use a saved address</span>
          <select
            value={pickedId}
            onChange={(event) => setPickedId(event.target.value)}
            className="mt-2 h-12 w-full rounded-xl border border-input bg-secondary px-4 text-base outline-none focus:border-primary"
          >
            {addresses.map((address) => (
              <option key={address.id} value={address.id}>
                {address.label ? `${address.label} — ` : ''}
                {address.shipTo.line1}, {address.shipTo.city} {address.shipTo.region}
                {address.isDefault ? ' (default)' : ''}
              </option>
            ))}
            <option value="">Enter a different address</option>
          </select>
        </label>
      )}

      <div key={pickedId} className="mt-5 grid gap-4 sm:grid-cols-2">
        {fields.map(
          ([
            key,
            label,
            type,
            autoComplete,
            required,
            defaultValue,
            maxLength,
          ]) => (
            <label
              key={key}
              className={`block text-sm ${['email', 'line1', 'line2', 'company'].includes(key) ? 'sm:col-span-2' : ''}`}
            >
              <span className="font-semibold">{label}</span>
              <input
                name={key}
                type={type}
                autoComplete={autoComplete}
                required={required}
                defaultValue={defaultValue}
                maxLength={maxLength}
                className="mt-2 h-12 w-full rounded-xl border border-input bg-secondary px-4 text-base outline-none focus:border-primary"
              />
            </label>
          ),
        )}
        <label className="block text-sm">
          <span className="font-semibold">Country</span>
          <select
            name="country"
            autoComplete="country"
            className="mt-2 h-12 w-full rounded-xl border border-input bg-secondary px-4 text-base outline-none focus:border-primary"
          >
            <option value="US">United States</option>
          </select>
        </label>
      </div>

      {canSave && (
        <label className="mt-4 flex items-start gap-3 text-sm leading-6">
          <input
            type="checkbox"
            name="save_address"
            defaultChecked={addresses.length === 0}
            className="mt-1 size-4"
          />
          <span>
            Save this address for next time. It is a convenience only — the order keeps
            its own record of where material was sent.
          </span>
        </label>
      )}
    </fieldset>
  );
}
