import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
vi.stubGlobal('React', React);
import {
  nextPurchaseQuantity,
  parsePurchaseQuantity,
  ProductPurchasePanel,
} from '@/components/site/product-purchase-panel';

type Props = Parameters<typeof ProductPurchasePanel>[0];

const variant = (overrides: Partial<Props['variants'][number]> = {}): Props['variants'][number] => ({
  sku: 'NPL-9999-2MG',
  quantity: '2 mg',
  presentation: 'Lyophilized powder',
  sellable: true,
  priceCents: 10000,
  priceBreaks: [],
  ...overrides,
});

const render = (props: Partial<Props> = {}) =>
  renderToStaticMarkup(
    React.createElement(ProductPurchasePanel, {
      productName: 'Synthetic',
      productSlug: 'synthetic',
      variants: [variant()],
      hasReleasedLot: true,
      pricing: 'researcher',
      canOrder: true,
      ...props,
    }),
  );

describe('product purchase panel', () => {
  it('renders a directly editable quantity without an arbitrary maximum', () => {
    const html = render({ initialQuantity: 60 });
    expect(html).toContain('aria-label="Product quantity"');
    expect(html).toContain('name="quantity"');
    expect(html).toContain('value="60"');
    expect(html).toContain('Add to cart · $6,000.00');
    expect(html).not.toMatch(/name="quantity"[^>]*max=/);
  });

  it('accepts quantities above 50 and rejects unsafe typed or stepped quantities', () => {
    expect(parsePurchaseQuantity('60')).toBe(60);
    expect(nextPurchaseQuantity(50, 1)).toEqual({ ok: true, quantity: 51 });
    expect(parsePurchaseQuantity(String(Number.MAX_SAFE_INTEGER))).toBe(Number.MAX_SAFE_INTEGER);
    expect(parsePurchaseQuantity('9007199254740992')).toBeNull();
    expect(parsePurchaseQuantity('1e2')).toBeNull();
    expect(nextPurchaseQuantity(Number.MAX_SAFE_INTEGER, 1)).toMatchObject({
      ok: false,
      error: 'Enter a positive safe whole-number quantity.',
    });
  });

  it("prices volume breaks at the viewer's own tier", () => {
    const html = render({
      pricing: 'institutional',
      variants: [
        variant({ priceCents: 8000, priceBreaks: [{ minQuantity: 5, listPriceCents: null, institutionalPriceCents: 6000 }] }),
      ],
    });
    expect(html).toContain('$80.00 per unit');
    expect(html).toContain('$60.00');
    expect(html).toContain('Add to cart · $80.00');
  });

  it('does not offer a pack size no lot can supply', () => {
    const mixed = render({ variants: [variant({ sku: 'NPL-9999-50MG', quantity: '50 mg', sellable: false }), variant()] });
    // The in-stock size is the one selected to begin with.
    expect(mixed).toContain('Add to cart · $100.00');
    // A buyer who can order is offered the one-time notice instead of a dead button (16 Sep 2026).
    const outOnly = render({ variants: [variant({ sellable: false })] });
    expect(outOnly).not.toContain('Add to cart');
    expect(outOnly).toContain('action="/api/waitlist"');
  });

  it('shows prices without an order button to a viewer who cannot order yet', () => {
    const html = render({ canOrder: false, orderingNote: 'Ordering is open to approved wholesale accounts.' });
    expect(html).toContain('$100.00 per unit');
    expect(html).toContain('Not available to order');
    expect(html).toContain('Ordering is open to approved wholesale accounts.');
    expect(html).not.toContain('Add to cart ·');
  });
});

describe('back-in-stock request', () => {
  it('offers the one-time notice when a buyer who can order finds the pack size out of stock', () => {
    const html = render({ hasReleasedLot: false, canOrder: true });
    expect(html).toContain('Tell me when it'); // the apostrophe is HTML-escaped in static markup
    expect(html).toContain('action="/api/waitlist"');
    expect(html).toContain('name="sku" value="NPL-9999-2MG"');
    expect(html).not.toContain('Add to cart');
  });

  it('shows the on-the-list state for a pack size already requested', () => {
    const html = render({ hasReleasedLot: false, canOrder: true, waitlisted: ['NPL-9999-2MG'] });
    expect(html).toContain('on the list');
    expect(html).toContain('href="/account/waitlist"');
    expect(html).not.toContain('action="/api/waitlist"');
  });

  it('keeps the cart form when the pack size is in stock, and no notice for someone who cannot order', () => {
    expect(render()).toContain('action="/api/cart"');
    const html = render({ hasReleasedLot: false, canOrder: false });
    expect(html).not.toContain('/api/waitlist');
    expect(html).toContain('Not available to order');
  });
});
