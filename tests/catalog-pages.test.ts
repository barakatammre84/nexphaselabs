import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.stubGlobal('React', React);

const { env, viewer, catalog } = vi.hoisted(() => ({
  env: {} as Record<string, unknown>,
  viewer: { current: null as unknown },
  catalog: { products: [] as { slug: string }[] },
}));
vi.mock('cloudflare:workers', () => ({ env }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('Not found');
  },
}));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock('next/image', () => ({
  default: ({ alt }: { alt: string }) => React.createElement('img', { alt }),
}));
vi.mock('@/lib/visibility', () => ({ currentViewer: async () => viewer.current }));
vi.mock('@/lib/classes', () => ({ listActiveClasses: async () => [] }));
vi.mock('@/lib/product-documents', () => ({ currentSds: async () => null }));
vi.mock('@/lib/lots-public', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/lots-public')>()),
  listReleasedLotsForProduct: async () => [
    { lotNumber: 'LOT-2601', releasedOn: '2026-09-01', retestDate: null, manufacturerName: 'Synthetic maker' },
  ],
}));
// The listing rule has its own tests (storefront.test.ts); these pages are fed listed products directly.
vi.mock('@/lib/storefront', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/storefront')>()),
  listStorefrontProducts: async () => catalog.products,
  getStorefrontProduct: async (slug: string) => catalog.products.find((product) => product.slug === slug) ?? null,
}));

import type { ListedProduct } from '@/lib/storefront';
import { visibilityFor } from '@/lib/visibility-rules';
import Home from '@/app/page';
import CatalogPage from '@/app/catalog/page';
import ProductPage from '@/app/catalog/[slug]/page';

/**
 * What a visitor may see is one rule (lib/visibility-rules.ts). A visitor shown
 * no prices must not be able to recover their order by sorting, and stock state
 * is lot availability, shown only to a viewer with availability. The "no account
 * needed" line is true only while guest checkout is open.
 */
function listed(name: string, listPriceCents: number, institutionalPriceCents: number, stock: ListedProduct['stock']): ListedProduct {
  const code = `NPL-${name.toUpperCase()}`;
  const sku = `${code}-5MG`;
  return {
    id: `prd_${name.toLowerCase()}`,
    code,
    slug: name.toLowerCase(),
    name,
    formalName: `${name} (formal)`,
    synonyms: [],
    chemicalClass: 'Peptide',
    casNumber: '0-00-0',
    molecularFormula: 'C1',
    molecularWeight: '1.0',
    purity: '≥98%',
    form: 'Lyophilized solid',
    saltForm: 'Acetate',
    solubility: [],
    storageSolid: '-20 °C',
    storageStock: '-80 °C',
    stability: 'See certificate',
    shipping: 'Ambient',
    packSizes: [],
    description: 'A synthetic test material.',
    sourceNotes: [],
    hasSds: false,
    image: 'products/synthetic.png',
    featured: false,
    status: 'enquire',
    visibility: 'published',
    withdrawnReason: null,
    sortOrder: 1,
    variants: [
      { id: `var_${name}`, sku, quantity: '5 mg', presentation: 'vial', listPriceCents, institutionalPriceCents, priceBreaks: [], active: true, sortOrder: 1 },
    ],
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-01T00:00:00Z'),
    updatedBy: null,
    stock,
    sellableSkus: stock === 'in_stock' ? [sku] : [],
  } as ListedProduct;
}

function viewAs(kind: 'anonymous' | 'wholesale' | 'guest') {
  if (kind === 'guest') env.OPEN_CHECKOUT_ENABLED = 'true';
  viewer.current =
    kind === 'wholesale'
      ? {
          account: { tier: 'institutional', verificationStatus: 'approved' },
          visibility: visibilityFor({ tier: 'institutional', verificationStatus: 'approved', acknowledgementsCurrent: true }, false, false),
        }
      : { account: null, visibility: visibilityFor(null, false, kind === 'guest') };
}

const catalogPage = async (sort?: string) =>
  renderToStaticMarkup(await CatalogPage({ searchParams: Promise.resolve(sort ? { sort } : {}) }));
const productPage = async (slug: string) =>
  renderToStaticMarkup(await ProductPage({ params: Promise.resolve({ slug }), searchParams: Promise.resolve({}) }));
const resultOrder = (html: string) =>
  [...html.split('aria-label="Product results"')[1].matchAll(/<h3[^>]*>([^<]+)<\/h3>/g)].map((match) => match[1]);

beforeEach(() => {
  // Name order Alpha, Beta, Gamma; list-price order Beta, Gamma, Alpha;
  // institutional-price order Gamma, Alpha, Beta. Every order is distinguishable.
  catalog.products = [
    listed('Alpha', 4900, 2500, 'out_of_stock'),
    listed('Beta', 900, 3500, 'in_stock'),
    listed('Gamma', 2900, 1500, 'in_stock'),
  ];
});

afterEach(() => {
  for (const key of Object.keys(env)) delete env[key];
  viewer.current = null;
});

describe('catalog sort', () => {
  it('gives a visitor shown no prices the default order, not a price order', async () => {
    viewAs('anonymous');
    const html = await catalogPage('price');
    expect(resultOrder(html)).toEqual(['Alpha', 'Beta', 'Gamma']);
    expect(html).not.toContain('value="price"');
  });

  it('orders a guest by the list prices the guest is shown', async () => {
    viewAs('guest');
    const html = await catalogPage('price');
    expect(resultOrder(html)).toEqual(['Beta', 'Gamma', 'Alpha']);
    expect(html).toContain('value="price"');
  });

  it('orders a wholesale account by its own institutional prices', async () => {
    viewAs('wholesale');
    expect(resultOrder(await catalogPage('price'))).toEqual(['Gamma', 'Alpha', 'Beta']);
  });
});

describe('stock state', () => {
  it('is not shown on the catalog, home or product page to a visitor without availability', async () => {
    viewAs('anonymous');
    expect(await catalogPage()).not.toContain('Out of stock');
    expect(renderToStaticMarkup(await Home())).not.toContain('Out of stock');
    for (const slug of ['alpha', 'beta']) {
      const html = await productPage(slug);
      expect(html, slug).not.toContain('Out of stock');
      expect(html, slug).not.toContain('In stock');
    }
  });

  it('is shown to a viewer with availability', async () => {
    viewAs('wholesale');
    expect(await catalogPage()).toContain('Out of stock');
    expect(renderToStaticMarkup(await Home())).toContain('Out of stock');
    expect(await productPage('alpha')).toContain('Out of stock');
    expect(await productPage('beta')).toContain('In stock');
  });
});

describe('product page purchase banner', () => {
  it('tells a guest that no account is needed while the storefront is open', async () => {
    viewAs('guest');
    expect(await productPage('beta')).toContain('No account or email verification is required.');
  });

  it('does not tell a wholesale account in a closed storefront that no account is needed', async () => {
    viewAs('wholesale');
    const html = await productPage('beta');
    expect(html).toContain('$35.00');
    expect(html).toContain('Shipping and tax appear before payment.');
    expect(html).not.toContain('No account or email verification is required.');
  });
});

describe("before the first lot is released", () => {
  it("says nothing is listed yet instead of reporting a failed search", async () => {
    viewAs("anonymous");
    catalog.products = [];
    const html = await catalogPage();
    expect(html).toContain("No materials are listed yet.");
    expect(html).not.toContain("No matching materials");
    expect(renderToStaticMarkup(await Home())).toContain("Materials are listed here once their first lot is released");
  });

  it("still reports a search that matches nothing once materials are listed", async () => {
    viewAs("anonymous");
    const html = renderToStaticMarkup(await CatalogPage({ searchParams: Promise.resolve({ q: "no-such-material" }) }));
    expect(html).toContain("No matching materials");
    expect(html).not.toContain("No materials are listed yet.");
    expect(renderToStaticMarkup(await Home())).not.toContain("Materials are listed here once");
  });
});
