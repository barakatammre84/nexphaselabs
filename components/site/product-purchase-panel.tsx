'use client';

import type React from 'react';

import { BellRing, FileCheck2, Minus, Plus, ShoppingCart } from 'lucide-react';
import { useMemo, useState } from 'react';
import { effectiveUnitPrice, nextBreak, priceLadder, type PriceBreak } from '@/lib/price-breaks';

type PurchaseVariant = {
  sku: string;
  quantity: string;
  presentation: string;
  /** A released lot can supply this pack size today. */
  sellable: boolean;
  priceCents: number | null;
  /** Break prices for this viewer's own tier only. */
  priceBreaks: PriceBreak[];
};

const QUANTITY_ERROR = 'Enter a positive safe whole-number quantity.';

export function parsePurchaseQuantity(value: string): number | null {
  const text = value.trim();
  if (!/^\d+$/.test(text)) return null;
  const quantity = Number(text);
  return Number.isSafeInteger(quantity) && quantity >= 1 ? quantity : null;
}

export function nextPurchaseQuantity(
  quantity: number,
  change: -1 | 1,
): { ok: true; quantity: number } | { ok: false; error: string } {
  if (!Number.isSafeInteger(quantity) || quantity < 1)
    return { ok: false, error: QUANTITY_ERROR };
  const next = quantity + change;
  if (!Number.isSafeInteger(next) || next < 1)
    return { ok: false, error: QUANTITY_ERROR };
  return { ok: true, quantity: next };
}

function money(cents: number) {
  if (!Number.isSafeInteger(cents) || cents < 0) return 'Amount unavailable';
  const amount = BigInt(cents);
  return `$${(amount / BigInt(100)).toLocaleString('en-US')}.${String(amount % BigInt(100)).padStart(2, '0')}`;
}

export function ProductPurchasePanel({
  productName,
  productSlug,
  variants,
  hasReleasedLot,
  pricing,
  canOrder,
  orderingNote,
  waitlisted = [],
  initialQuantity = 1,
}: {
  productName: string;
  productSlug: string;
  variants: PurchaseVariant[];
  hasReleasedLot: boolean;
  /** The tier whose prices this viewer sees. */
  pricing: 'researcher' | 'institutional';
  /** Whether this viewer can place an order at all; prices can show before ordering opens to them. */
  canOrder: boolean;
  orderingNote?: string;
  /** Pack sizes this account already asked to hear about (lib/waitlist.ts). */
  waitlisted?: string[];
  /** Initial whole-pack count; primarily useful when restoring a customer's selection. */
  initialQuantity?: number;
}) {
  if (!Number.isSafeInteger(initialQuantity) || initialQuantity < 1)
    throw new RangeError(QUANTITY_ERROR);
  const [selectedSku, setSelectedSku] = useState(
    (variants.find((variant) => variant.sellable) ?? variants[0])?.sku ?? '',
  );
  const [quantity, setQuantity] = useState(initialQuantity);
  const [quantityText, setQuantityText] = useState(String(initialQuantity));
  const [quantityError, setQuantityError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [joined, setJoined] = useState<string[]>(waitlisted);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  // "Tell me when it's available": one request per pack size, answered by a single
  // email when a released lot can supply it (owner, 16 Sep 2026). Without JavaScript
  // the form posts and the product page shows the outcome.
  async function joinViaFetch(event: React.FormEvent<HTMLFormElement>) {
    if (typeof window === 'undefined' || typeof window.fetch !== 'function') return;
    event.preventDefault();
    const form = event.currentTarget;
    const sku = String(new FormData(form).get('sku') ?? '');
    setJoining(true);
    setJoinError(null);
    try {
      const response = await fetch(form.action, {
        method: 'POST',
        body: new FormData(form),
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
      });
      const body = (await response.json().catch(() => null)) as { ok?: boolean; error?: string; signIn?: string } | null;
      if (response.status === 401 && body?.signIn) {
        window.location.assign(body.signIn);
        return;
      }
      if (!response.ok || !body?.ok) {
        setJoinError(body?.error ?? 'That request could not be saved. Try again shortly.');
        return;
      }
      setJoined((current) => (current.includes(sku) ? current : [...current, sku]));
    } catch {
      setJoinError('That request could not be saved. Try again shortly.');
    } finally {
      setJoining(false);
    }
  }

  // With JavaScript the add stays on the page and opens the side cart (owner,
  // 16 Sep 2026); without it the form posts and the cart page answers as before.
  async function addViaFetch(event: React.FormEvent<HTMLFormElement>) {
    if (typeof window === 'undefined' || typeof window.fetch !== 'function') return;
    event.preventDefault();
    const form = event.currentTarget;
    setAdding(true);
    setAddError(null);
    try {
      const response = await fetch(form.action, {
        method: 'POST',
        body: new FormData(form),
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
      });
      const data = (await response.json().catch(() => null)) as { ok?: boolean; error?: string; signIn?: string } | null;
      if (response.status === 401 && data?.signIn) {
        window.location.assign(data.signIn);
        return;
      }
      if (!response.ok || !data?.ok) {
        setAddError(data?.error ?? 'That could not be added to your cart.');
        return;
      }
      window.dispatchEvent(new CustomEvent('nx:cart-open'));
    } catch {
      setAddError('The cart is temporarily unavailable.');
    } finally {
      setAdding(false);
    }
  }
  const selected = useMemo(
    () => variants.find((variant) => variant.sku === selectedSku) ?? variants[0],
    [selectedSku, variants],
  );
  if (!selected) return null;
  const available = canOrder && hasReleasedLot && selected.sellable && selected.priceCents !== null;
  // Out of stock for a buyer who could otherwise order: offer the one-time notice instead of a dead button.
  const waitlistable = canOrder && (!hasReleasedLot || !selected.sellable);

  // Volume pricing at the viewer's own tier, from the same module the cart and the
  // order guard use. With no ladder entered for this pack size, every value below is
  // the single price and nothing extra renders.
  const asVariant =
    pricing === 'institutional'
      ? { listPriceCents: null, institutionalPriceCents: selected.priceCents }
      : { listPriceCents: selected.priceCents, institutionalPriceCents: null };
  const unitPrice = effectiveUnitPrice(asVariant, selected.priceBreaks, quantity, pricing);
  const ladder = priceLadder(asVariant, selected.priceBreaks, pricing, quantity);
  const next = nextBreak(asVariant, selected.priceBreaks, quantity, pricing);
  const listPrice = selected.priceCents;
  const lineTotal =
    unitPrice !== null && Number.isSafeInteger(unitPrice) && unitPrice >= 0 &&
    Number.isSafeInteger(unitPrice * quantity)
      ? unitPrice * quantity
      : null;

  function changeQuantity(change: -1 | 1) {
    const result = nextPurchaseQuantity(quantity, change);
    if (!result.ok) {
      setQuantityError(result.error);
      return;
    }
    setQuantity(result.quantity);
    setQuantityText(String(result.quantity));
    setQuantityError(null);
  }

  function typeQuantity(value: string) {
    setQuantityText(value);
    const parsed = parsePurchaseQuantity(value);
    if (parsed === null) {
      setQuantityError(QUANTITY_ERROR);
      return;
    }
    setQuantity(parsed);
    setQuantityError(null);
  }

  return (
    <div className="mt-7 rounded-[1.5rem] border border-border bg-white p-5 shadow-[0_16px_38px_rgba(14,18,59,0.08)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-display text-lg font-extrabold text-[var(--ion-navy)]">Choose a pack size</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {hasReleasedLot ? 'In stock — ships from a released, tested lot.' : 'Out of stock — ordering opens when the next lot is released.'}
          </p>
        </div>
        <a href="#material-documents" className="inline-flex items-center gap-2 text-sm font-extrabold text-primary">
          <FileCheck2 className="size-4" /> View COAs
        </a>
      </div>
      <fieldset className="mt-5">
        <legend className="text-xs font-extrabold uppercase tracking-[0.12em] text-muted-foreground">Pack size</legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {variants.map((variant) => (
            <button
              key={variant.sku}
              type="button"
              aria-pressed={variant.sku === selected.sku}
              onClick={() => setSelectedSku(variant.sku)}
              className={`min-h-11 rounded-full border px-4 text-sm font-extrabold transition-colors ${
                variant.sku === selected.sku
                  ? 'border-primary bg-primary text-white'
                  : 'border-border bg-secondary text-[var(--ion-navy)] hover:border-primary'
              }`}
            >
              {variant.quantity}
              {!variant.sellable && <span className="ml-1 text-xs font-semibold opacity-70">· out of stock</span>}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="mt-5 flex flex-wrap items-end justify-between gap-5 rounded-[1.2rem] bg-secondary p-4">
        <div>
          <p className="text-xs font-bold text-muted-foreground">Selected format</p>
          <p className="mt-1 font-display font-extrabold text-[var(--ion-navy)]">{selected.presentation}</p>
          {unitPrice !== null && (
            <p className="mt-1 flex flex-wrap items-baseline gap-2">
              <span className="text-lg font-extrabold text-primary">{money(unitPrice)} per unit</span>
              {listPrice !== null && unitPrice < listPrice && (
                <span className="text-sm font-semibold text-muted-foreground line-through">
                  {money(listPrice)}
                </span>
              )}
            </p>
          )}
        </div>
        <div>
          <p className="mb-2 text-xs font-bold text-muted-foreground">Quantity</p>
          <div className="flex items-center rounded-full border border-border bg-white p-1">
            <button type="button" disabled={quantity === 1} className="grid size-9 place-items-center rounded-full hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40" aria-label="Decrease quantity" onClick={() => changeQuantity(-1)}>
              <Minus className="size-4" />
            </button>
            <input
              name="quantity"
              form={`purchase-cart-${productSlug}`}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={quantityText}
              onChange={(event) => typeQuantity(event.currentTarget.value)}
              aria-label="Product quantity"
              aria-invalid={quantityError !== null}
              aria-describedby={quantityError ? 'purchase-quantity-error' : undefined}
              className="w-16 bg-transparent text-center font-mono text-sm font-bold outline-none"
            />
            <button type="button" className="grid size-9 place-items-center rounded-full hover:bg-secondary" aria-label="Increase quantity" onClick={() => changeQuantity(1)}>
              <Plus className="size-4" />
            </button>
          </div>
          {quantityError && (
            <p id="purchase-quantity-error" role="alert" className="mt-2 max-w-48 text-xs font-semibold text-destructive">
              {quantityError}
            </p>
          )}
        </div>
      </div>
      {ladder.length > 0 && (
        <div className="mt-4 rounded-[1.2rem] border border-border p-4">
          <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-muted-foreground">
            Price per unit
          </p>
          <ul className="mt-3 grid gap-1 text-sm">
            {ladder.map((row) => (
              <li
                key={row.minQuantity}
                className={`flex items-baseline justify-between gap-3 rounded-lg px-2 py-1 ${
                  row.applies ? 'bg-secondary font-extrabold text-[var(--ion-navy)]' : 'text-muted-foreground'
                }`}
              >
                <span>
                  {row.minQuantity === 1 ? '1–' : `${row.minQuantity}+`}
                  {row.minQuantity === 1 && ladder[1] ? ladder[1].minQuantity - 1 : ''} units
                </span>
                <span className="font-mono">
                  {money(row.unitPriceCents)}
                  {row.savingPercent > 0 && (
                    <span className="ml-2 text-xs font-bold text-primary">−{row.savingPercent}%</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
          {next && (
            <p className="mt-3 text-xs font-semibold text-primary">
              Add {next.unitsAway} more to reach {money(next.unitPriceCents)} per unit.
            </p>
          )}
        </div>
      )}
      {waitlistable ? (
        joined.includes(selected.sku) ? (
          <p role="status" className="mt-4 rounded-xl border border-border bg-secondary p-4 text-center text-sm font-semibold">
            You&rsquo;re on the list &mdash; we&rsquo;ll email you once when this pack size is released.{' '}
            <a href="/account/waitlist" className="text-primary underline">
              Manage
            </a>
          </p>
        ) : (
          <form method="post" action="/api/waitlist" className="mt-4" onSubmit={joinViaFetch}>
            <input type="hidden" name="intent" value="join" />
            <input type="hidden" name="sku" value={selected.sku} />
            <input type="hidden" name="return_to" value={`/catalog/${productSlug}`} />
            <button type="submit" disabled={joining} className="action-primary w-full justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50">
              <BellRing className="size-4" />
              {joining ? 'Saving…' : 'Tell me when it\'s available'}
            </button>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              One email when a lot is released for this pack size. It reserves nothing and is not marketing.
            </p>
          </form>
        )
      ) : (
        <form id={`purchase-cart-${productSlug}`} method="post" action="/api/cart" className="mt-4" onSubmit={addViaFetch}>
          <input type="hidden" name="sku" value={selected.sku} />
          <input type="hidden" name="return_to" value={`/catalog/${productSlug}`} />
          <button type="submit" disabled={!available || adding || quantityError !== null || lineTotal === null} className="action-primary w-full justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50">
              <ShoppingCart className="size-4" />
              {adding
                ? 'Adding…'
                : available && lineTotal !== null
                ? `Add to cart · ${money(lineTotal)}`
                : available && unitPrice !== null
                  ? 'Order amount is too large'
              : !canOrder
                ? 'Not available to order'
                : 'Not currently available'}
          </button>
        </form>
      )}
      {joinError && (
        <p role="alert" className="mt-3 text-center text-xs font-semibold text-destructive">{joinError}</p>
      )}
      {addError && (
        <p role="alert" className="mt-3 text-center text-xs font-semibold text-destructive">{addError}</p>
      )}
      {!canOrder && orderingNote && (
        <p className="mt-3 text-center text-xs font-semibold text-muted-foreground">{orderingNote}</p>
      )}
      <p className="mt-3 text-center text-xs font-semibold text-muted-foreground">
        {productName} is supplied for laboratory research use only. Shipping and tax appear before payment.
      </p>
    </div>
  );
}
