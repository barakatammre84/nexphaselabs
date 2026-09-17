import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ usePathname: () => '/catalog' }));

import { CartDrawer, CART_OPEN_EVENT } from '@/components/site/cart-drawer';

describe('CartDrawer (owner, 16 Sep 2026)', () => {
  it('renders the header trigger with the live count and stays closed until asked', () => {
    const html = renderToStaticMarkup(React.createElement(CartDrawer, { initialCount: 3 }));
    expect(html).toContain('aria-label="Cart, 3 items"');
    expect(html).toContain('header-cart-count');
    expect(html).not.toContain('cart-drawer-layer');
    expect(CART_OPEN_EVENT).toBe('nx:cart-open');
  });
});
