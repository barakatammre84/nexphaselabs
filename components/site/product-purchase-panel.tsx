'use client';

import { FileCheck2, Minus, Plus, ShoppingCart } from 'lucide-react';
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

function money(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

export function ProductPurchasePanel({
  productName,
  productSlug,
  variants,
  hasReleasedLot,
  pricing,
  canOrder,
  orderingNote,
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
}) {
  const [selectedSku, setSelectedSku] = useState(
    (variants.find((variant) => variant.sellable) ?? variants[0])?.sku ?? '',
  );
  const [quantity, setQuantity] = useState(1);
  const selected = useMemo(
    () => variants.find((variant) => variant.sku === selectedSku) ?? variants[0],
    [selectedSku, variants],
  );
  if (!selected) return null;
  const available = canOrder && hasReleasedLot && selected.sellable && selected.priceCents !== null;

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

  return (
    <div className="mt-7 rounded-[1.5rem] border border-border bg-white p-5 shadow-[0_16px_38px_rgba(34,46,113,0.08)]">
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
            <button type="button" className="grid size-9 place-items-center rounded-full hover:bg-secondary" aria-label="Decrease quantity" onClick={() => setQuantity((value) => Math.max(1, value - 1))}>
              <Minus className="size-4" />
            </button>
            <output className="w-10 text-center font-mono text-sm font-bold" aria-label="Product quantity">{quantity}</output>
            <button type="button" className="grid size-9 place-items-center rounded-full hover:bg-secondary" aria-label="Increase quantity" onClick={() => setQuantity((value) => Math.min(50, value + 1))}>
              <Plus className="size-4" />
            </button>
          </div>
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
      <form method="post" action="/api/cart" className="mt-4">
        <input type="hidden" name="sku" value={selected.sku} />
        <input type="hidden" name="quantity" value={quantity} />
        <input type="hidden" name="return_to" value={`/catalog/${productSlug}`} />
        <button type="submit" disabled={!available} className="action-primary w-full justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50">
          <ShoppingCart className="size-4" />
          {available && unitPrice !== null
            ? `Add to cart · ${money(unitPrice * quantity)}`
            : !canOrder
              ? 'Not available to order'
              : !selected.sellable
                ? 'This pack size is out of stock'
                : 'Not currently available'}
        </button>
      </form>
      {!canOrder && orderingNote && (
        <p className="mt-3 text-center text-xs font-semibold text-muted-foreground">{orderingNote}</p>
      )}
      <p className="mt-3 text-center text-xs font-semibold text-muted-foreground">
        {productName} is supplied for laboratory research use only. Shipping and tax appear before payment.
      </p>
    </div>
  );
}
