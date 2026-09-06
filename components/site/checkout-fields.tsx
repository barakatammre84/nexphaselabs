export function CheckoutFields({
  email = '',
  name = '',
}: {
  email?: string;
  name?: string;
}) {
  const fields = [
    ['email', 'Email for order updates', 'email', 'email', true, email, 254],
    ['name', 'Recipient name', 'text', 'name', true, name, 160],
    [
      'company',
      'Company or institution (optional)',
      'text',
      'organization',
      false,
      '',
      160,
    ],
    ['line1', 'Street address', 'text', 'address-line1', true, '', 160],
    [
      'line2',
      'Apartment, suite, etc. (optional)',
      'text',
      'address-line2',
      false,
      '',
      160,
    ],
    ['city', 'City', 'text', 'address-level2', true, '', 160],
    ['region', 'State', 'text', 'address-level1', true, '', 80],
    ['postalCode', 'ZIP code', 'text', 'postal-code', true, '', 24],
    ['phone', 'Phone (optional)', 'tel', 'tel', false, '', 40],
  ] as const;
  return (
    <fieldset className="mt-6">
      <legend className="font-semibold">Contact & delivery</legend>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        No sign-up, email verification, or organization approval. This browser
        keeps your cart and orders private for 30 days. Save your order number;
        use the same browser to return.
      </p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
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
    </fieldset>
  );
}
