import { describe, expect, it, vi } from 'vitest';
vi.mock('cloudflare:workers', () => ({ env: {} }));
import type { CatalogProduct } from '@/lib/catalog-data';
import { listingBlockers, normaliseSort, sellableSkus, sortStorefront, toListed, visibleStock, type ListedProduct, type PublishableStock } from '@/lib/storefront';

/**
 * The storefront listing rule (Chapter 19): listed means photographed, priced
 * and backed by a publishable lot; "out of stock" is a state of a listed
 * product, never a substitute for a missing price or lot; and the internal
 * product status is not consulted at all.
 */
function product(overrides: Partial<CatalogProduct> = {}): CatalogProduct {
  return {
    id: 'prd_1',
    code: 'NPL-0001',
    slug: 'test-material',
    name: 'Test material',
    formalName: 'Test material (formal)',
    synonyms: [],
    chemicalClass: 'Peptide',
    casNumber: '0-00-0',
    molecularFormula: 'C1',
    molecularWeight: '1.0',
    form: 'Lyophilized solid',
    purity: '≥98%',
    storage: '-20 °C',
    description: 'A test material.',
    status: 'enquire',
    image: 'lots/x.png',
    featured: false,
    visibility: 'published',
    withdrawnReason: null,
    sortOrder: 1,
    variants: [
      { id: 'v1', sku: 'NPL-0001-5MG', quantity: '5 mg', presentation: 'vial', listPriceCents: 2900, priceBreaks: [], institutionalPriceCents: null, active: true, sortOrder: 1 },
      { id: 'v2', sku: 'NPL-0001-10MG', quantity: '10 mg', presentation: 'vial', listPriceCents: 4900, priceBreaks: [], institutionalPriceCents: null, active: true, sortOrder: 2 },
    ],
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-01T00:00:00Z'),
    updatedBy: null,
    ...overrides,
  } as CatalogProduct;
}

const vial5: PublishableStock = { productCode: 'NPL-0001', quantityRemaining: '40 vials', retestDate: null, containerSize: '5 mg' };
const bulk: PublishableStock = { productCode: 'NPL-0001', quantityRemaining: '100 mg', retestDate: null, containerSize: null };
const expired: PublishableStock = { productCode: 'NPL-0001', quantityRemaining: '40 vials', retestDate: new Date('2026-01-01T00:00:00Z'), containerSize: '5 mg' };
const now = new Date('2026-09-14T12:00:00Z');

describe('listing rule', () => {
  it('lists a photographed, priced product with a publishable lot, and ignores the internal status', () => {
    const listed = toListed(product({ status: 'enquire' }), [vial5], now);
    expect(listed?.stock).toBe('in_stock');
    expect(listed?.sellableSkus).toEqual(['NPL-0001-5MG']);
  });
  it('does not list without a photograph, a price, or a lot', () => {
    expect(listingBlockers(product({ image: undefined }), [vial5])).toEqual(['No photograph']);
    expect(listingBlockers(product({ variants: product().variants.map((v) => ({ ...v, listPriceCents: null })) }), [vial5])).toEqual(['No approved public price']);
    expect(listingBlockers(product(), [])).toEqual(['No released, publishable lot']);
    expect(toListed(product(), [], now)).toBeNull();
  });
  it('shows out of stock only for a listed product whose lots cannot supply a pack', () => {
    expect(toListed(product(), [expired], now)?.stock).toBe('out_of_stock');
    expect(toListed(product(), [{ ...vial5, quantityRemaining: '0 vials' }], now)?.stock).toBe('out_of_stock');
  });
  it('sells only the packs a lot can actually supply', () => {
    expect(sellableSkus(product(), [vial5], now)).toEqual(['NPL-0001-5MG']);
    expect(sellableSkus(product(), [bulk], now)).toEqual(['NPL-0001-5MG', 'NPL-0001-10MG']);
    expect(sellableSkus(product({ variants: product().variants.map((v) => ({ ...v, active: false })) }), [bulk], now)).toEqual([]);
  });
});

describe('sort', () => {
  const a = toListed(product({ name: 'Alpha', createdAt: new Date('2026-09-02T00:00:00Z') }), [bulk], now)!;
  const b = toListed(product({ code: 'NPL-0002', name: 'Beta', createdAt: new Date('2026-09-10T00:00:00Z'), variants: [{ ...product().variants[0], listPriceCents: 900 }] }), [{ ...bulk, productCode: 'NPL-0002' }], now)!;
  it('orders by name, lowest price, or newest, and falls back to A–Z', () => {
    expect(sortStorefront([b, a], 'az', 'researcher').map((p) => p.name)).toEqual(['Alpha', 'Beta']);
    expect(sortStorefront([a, b], 'za', 'researcher').map((p) => p.name)).toEqual(['Beta', 'Alpha']);
    expect(sortStorefront([a, b], 'price', 'researcher').map((p) => p.name)).toEqual(['Beta', 'Alpha']);
    expect(sortStorefront([a, b], 'newest', 'researcher').map((p) => p.name)).toEqual(['Beta', 'Alpha']);
    expect(normaliseSort('bogus', 'researcher')).toBe('az');
    expect(normaliseSort('newest', 'researcher')).toBe('newest');
  });
  it('never gives a viewer shown no prices an order derived from prices', () => {
    expect(normaliseSort('price', 'none')).toBe('az');
    expect(normaliseSort('price', 'researcher')).toBe('price');
    // Even a caller that skips normaliseSort gets the default order.
    expect(sortStorefront([b, a], 'price', 'none').map((p) => p.name)).toEqual(['Alpha', 'Beta']);
  });
  it('orders by the price tier the viewer is shown, never another tier', () => {
    const c = toListed(product({ code: 'NPL-0003', name: 'Gamma', variants: [{ ...product().variants[0], listPriceCents: 1900 }] }), [{ ...bulk, productCode: 'NPL-0003' }], now)!;
    const tier = (p: ListedProduct, institutionalPriceCents: number) => ({ ...p, variants: p.variants.map((v) => ({ ...v, institutionalPriceCents })) });
    const list = [tier(a, 800), tier(b, 1200), tier(c, 300)];
    expect(sortStorefront(list, 'price', 'researcher').map((p) => p.name)).toEqual(['Beta', 'Gamma', 'Alpha']);
    expect(sortStorefront(list, 'price', 'institutional').map((p) => p.name)).toEqual(['Gamma', 'Alpha', 'Beta']);
  });
});

describe('stock state', () => {
  it('follows availability: a viewer without it sees neither in stock nor out of stock', () => {
    const out = toListed(product(), [expired], now)!;
    const inStock = toListed(product(), [vial5], now)!;
    expect(visibleStock(out, { availability: true })).toBe('out_of_stock');
    expect(visibleStock(inStock, { availability: true })).toBe('in_stock');
    expect(visibleStock(out, { availability: false })).toBeNull();
    expect(visibleStock(inStock, { availability: false })).toBeNull();
  });
});
