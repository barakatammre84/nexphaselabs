import { CircleCheck, MapPin, Star, Trash2 } from 'lucide-react';
import type { SavedAddress } from '@/lib/account-addresses';

const input =
  'mt-2 h-12 w-full rounded-xl border border-input bg-secondary px-4 text-base outline-none focus:border-primary';

/**
 * Delivery addresses a customer keeps for next time (chapter 10 c10-addresses).
 *
 * Deliberately says what this is and is not: the order keeps its own record of
 * where material went, so editing or removing one here changes nothing that has
 * shipped. Removal archives rather than deletes, for the same reason.
 */
export function SavedAddresses({
  addresses,
  saved,
  removed,
  defaulted,
  error,
}: {
  addresses: SavedAddress[];
  saved: boolean;
  removed: boolean;
  defaulted: boolean;
  error: string | null;
}) {
  return (
    <section id="addresses" className="ion-panel mt-8 p-7 sm:p-10">
      <div className="flex items-center gap-3">
        <MapPin className="size-5 text-primary" />
        <h2 className="font-display text-xl font-bold tracking-tight">Delivery addresses</h2>
      </div>
      <p className="mt-3 max-w-2xl leading-7 text-muted-foreground">
        Saved so a repeat order is not retyped. Each order keeps its own record of where
        material was sent — changing an address here never changes an order that has shipped.
      </p>

      {error && (
        <p role="alert" className="mt-5 rounded-xl border border-destructive/40 bg-secondary p-4 text-sm">
          {error}
        </p>
      )}
      {(saved || removed || defaulted) && !error && (
        <p role="status" className="mt-5 flex items-center gap-2 rounded-xl border border-border bg-secondary p-4 text-sm">
          <CircleCheck className="size-4 text-primary" />
          {saved ? 'Address saved.' : removed ? 'Address removed.' : 'Default address updated.'}
        </p>
      )}

      {addresses.length > 0 && (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {addresses.map((address) => (
            <li key={address.id} className="rounded-[1.2rem] border border-border p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">
                    {address.label ?? address.shipTo.consigneeName}
                    {address.isDefault && (
                      <span className="ml-2 rounded-full border border-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                        default
                      </span>
                    )}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {address.shipTo.consigneeName}
                    {address.shipTo.consigneeInstitution && (
                      <>
                        <br />
                        {address.shipTo.consigneeInstitution}
                      </>
                    )}
                    <br />
                    {address.shipTo.line1}
                    {address.shipTo.line2 && (
                      <>
                        <br />
                        {address.shipTo.line2}
                      </>
                    )}
                    <br />
                    {address.shipTo.city}, {address.shipTo.region} {address.shipTo.postalCode}
                    {address.shipTo.phone && (
                      <>
                        <br />
                        {address.shipTo.phone}
                      </>
                    )}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                {!address.isDefault && (
                  <form method="post" action="/api/account/addresses">
                    <input type="hidden" name="intent" value="default" />
                    <input type="hidden" name="address" value={address.id} />
                    <button
                      type="submit"
                      className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary"
                    >
                      <Star className="size-4" /> Make default
                    </button>
                  </form>
                )}
                <form method="post" action="/api/account/addresses">
                  <input type="hidden" name="intent" value="remove" />
                  <input type="hidden" name="address" value={address.id} />
                  <button
                    type="submit"
                    className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-4" /> Remove
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      <details className="mt-6 rounded-[1.2rem] border border-border p-5">
        <summary className="cursor-pointer font-semibold">
          {addresses.length === 0 ? 'Add your first address' : 'Add another address'}
        </summary>
        <form method="post" action="/api/account/addresses" className="mt-5 grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="intent" value="save" />
          <label className="block text-sm sm:col-span-2">
            <span className="font-semibold">Label (optional)</span>
            <input name="label" maxLength={40} placeholder="Lab, home bench" className={input} />
          </label>
          <label className="block text-sm">
            <span className="font-semibold">Recipient name</span>
            <input name="name" autoComplete="name" required maxLength={160} className={input} />
          </label>
          <label className="block text-sm">
            <span className="font-semibold">Company or institution (optional)</span>
            <input name="company" autoComplete="organization" maxLength={160} className={input} />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="font-semibold">Street address</span>
            <input name="line1" autoComplete="address-line1" required maxLength={160} className={input} />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="font-semibold">Apartment, suite, etc. (optional)</span>
            <input name="line2" autoComplete="address-line2" maxLength={160} className={input} />
          </label>
          <label className="block text-sm">
            <span className="font-semibold">City</span>
            <input name="city" autoComplete="address-level2" required maxLength={160} className={input} />
          </label>
          <label className="block text-sm">
            <span className="font-semibold">State</span>
            <input name="region" autoComplete="address-level1" required maxLength={80} className={input} />
          </label>
          <label className="block text-sm">
            <span className="font-semibold">ZIP code</span>
            <input name="postalCode" autoComplete="postal-code" required maxLength={24} className={input} />
          </label>
          <label className="block text-sm">
            <span className="font-semibold">Phone (optional)</span>
            <input name="phone" type="tel" autoComplete="tel" maxLength={40} className={input} />
          </label>
          <label className="block text-sm">
            <span className="font-semibold">Country</span>
            <select name="country" autoComplete="country" className={input}>
              <option value="US">United States</option>
            </select>
          </label>
          <label className="flex items-center gap-3 text-sm sm:col-span-2">
            <input type="checkbox" name="make_default" className="size-4" />
            <span>Use this address by default at checkout</span>
          </label>
          <div className="sm:col-span-2">
            <button type="submit" className="action-primary">
              Save address
            </button>
          </div>
        </form>
      </details>

      <p className="mt-4 text-xs leading-6 text-muted-foreground">
        A phone number is optional, and the only reason we ask is so we can reach you quickly if
        there is ever a question about material you hold.
      </p>
    </section>
  );
}
