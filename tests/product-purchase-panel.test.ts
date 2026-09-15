import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
vi.stubGlobal('React', React);
import { ProductPurchasePanel } from '@/components/site/product-purchase-panel';

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
    const outOnly = render({ variants: [variant({ sellable: false })] });
    expect(outOnly).toContain('This pack size is out of stock');
    expect(outOnly).toContain('disabled=""');
  });

  it('shows prices without an order button to a viewer who cannot order yet', () => {
    const html = render({ canOrder: false, orderingNote: 'Ordering is open to approved wholesale accounts.' });
    expect(html).toContain('$100.00 per unit');
    expect(html).toContain('Not available to order');
    expect(html).toContain('Ordering is open to approved wholesale accounts.');
    expect(html).not.toContain('Add to cart ·');
  });
});
