import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localD1 } from './helpers/local-d1';

/**
 * The staff answer to "it is published, so why can nobody see it?".
 *
 * Publishing is only one of four requirements (lib/storefront.ts). Each of the
 * others is enforced somewhere else, and a missing one produces the same silent
 * symptom: the catalog simply does not show the material. `hiddenPublishedProducts`
 * is what the manager screens use to name the missing requirement instead.
 */
const { env } = vi.hoisted(() => ({ env: {} as Record<string, unknown> }));
vi.stubGlobal('React', React);
vi.mock('cloudflare:workers', () => ({ env }));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => new Headers(),
}));
vi.mock('next/image', () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) =>
    React.createElement('img', props),
}));
vi.mock('next/navigation', () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock('@/lib/staff-auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/staff-auth')>()),
  requireStaff: async () => ({
    id: 'stf_visibility',
    email: 'visibility@example.invalid',
    name: 'Visibility reviewer',
    role: 'admin' as const,
    sessionId: 'ses_visibility',
    mustChangePassword: false,
  }),
}));

import { getDb } from '@/db';
import { lots, products, productVariants } from '@/db/schema';
import {
  hiddenPublishedProducts,
  productListingBlockers,
  publishedProductVisibility,
} from '@/lib/storefront';
import { getProductByCode } from '@/lib/catalog-data';
import CatalogManagerPage from '@/app/manage/products/page';
import EditProductPage from '@/app/manage/products/[code]/page';

let local: ReturnType<typeof localD1>;

type ProductInsert = typeof products.$inferInsert;
type VariantInsert = typeof productVariants.$inferInsert;
type LotInsert = typeof lots.$inferInsert;

const seedProduct = async (
  over: {
    product?: Partial<ProductInsert>;
    variant?: Partial<VariantInsert>;
    lot?: Partial<LotInsert> | null;
  } = {},
) => {
  const suffix = over.product?.code ?? 'NPL-1000';
  await getDb()
    .insert(products)
    .values({
      id: `p_${suffix}`,
      code: suffix,
      slug: suffix.toLowerCase(),
      name: `Material ${suffix}`,
      formalName: 'Formal',
      chemicalClass: 'Peptides',
      casNumber: '50-00-0',
      molecularFormula: 'C1',
      molecularWeight: '1',
      purity: '≥98%',
      form: 'Lyophilized solid',
      saltForm: 'Free base',
      storageSolid: '-20 °C',
      storageStock: '-80 °C',
      stability: 'x',
      shipping: 'x',
      description: 'x',
      visibility: 'published',
      image: `products/${suffix}.png`,
      ...over.product,
    });
  await getDb()
    .insert(productVariants)
    .values({
      id: `v_${suffix}`,
      productId: `p_${suffix}`,
      sku: `${suffix}-2MG`,
      quantity: '2 mg',
      presentation: 'vial',
      listPriceCents: 12900,
      active: true,
      ...over.variant,
    });
  if (over.lot !== null) {
    await getDb()
      .insert(lots)
      .values({
        id: `l_${suffix}`,
        lotNumber: `LOT-${suffix}`,
        productCode: suffix,
        productName: `Material ${suffix}`,
        casNumber: '50-00-0',
        status: 'released',
        analyticalLab: 'Contract lab',
        accessionNumber: 'ACC-1',
        testingStandard: 'Panel v1',
        receivedAt: new Date(),
        quantityRemaining: '10 mg',
        quantityReceived: '10 mg',
        ...over.lot,
      });
  }
};

beforeEach(() => {
  local = localD1();
  env.DB = local.binding;
});
afterEach(() => {
  local.sqlite.close();
  for (const key of Object.keys(env)) delete env[key];
});

describe('published but invisible to shoppers', () => {
  it('says nothing about a material shoppers can see', async () => {
    await seedProduct();
    expect(await hiddenPublishedProducts()).toEqual([]);
  });

  it('names the missing requirement for each hidden material', async () => {
    await seedProduct({ product: { code: 'NPL-1001', image: null } });
    await seedProduct({ product: { code: 'NPL-1002' }, variant: { listPriceCents: null } });
    await seedProduct({ product: { code: 'NPL-1003' }, lot: { status: 'quarantine' } });
    await seedProduct({ product: { code: 'NPL-1004' }, lot: { accessionNumber: '   ' } });

    const hidden = await hiddenPublishedProducts();
    expect(hidden.map((p) => [p.code, p.blockers.join('; ')])).toEqual([
      ['NPL-1001', 'No photograph'],
      ['NPL-1002', 'No active pack with an approved public price'],
      ['NPL-1003', 'No released, publishable lot'],
      ['NPL-1004', 'No released, publishable lot'],
    ]);
  });

  it('leaves a draft material out: it is not published, so it is not a surprise', async () => {
    await seedProduct({ product: { visibility: 'draft', image: null } });
    expect(await hiddenPublishedProducts()).toEqual([]);
    expect(await publishedProductVisibility()).toEqual({
      publishedCount: 0,
      hidden: [],
    });
  });

  it('reports a listed material as out of stock rather than hidden', async () => {
    await seedProduct({ lot: { quantityRemaining: '0 mg' } });
    expect(await hiddenPublishedProducts()).toEqual([]);
  });

  it('gives one product its own reasons for the product page banner', async () => {
    await seedProduct({ product: { image: null }, variant: { active: false } });
    const product = await getProductByCode('NPL-1000');
    expect(product).not.toBeNull();
    if (!product) throw new Error('Seeded product was not loaded');
    expect(await productListingBlockers(product)).toEqual([
      'No photograph',
      'No active pack with an approved public price',
    ]);
  });

  it('warns in the catalog manager and does not offer a broken View link', async () => {
    await seedProduct({ product: { image: null } });
    await seedProduct({ product: { code: 'NPL-1001' } });

    const html = renderToStaticMarkup(
      await CatalogManagerPage({ searchParams: Promise.resolve({}) }),
    );

    expect(html).toContain('1 published material is hidden from shoppers');
    expect(html).toContain('Hidden: No photograph');
    expect(html).not.toContain('href="/catalog/npl-1000"');
    expect(html).toContain('href="/catalog/npl-1001"');
  });

  it('renders the storefront warning on a hidden published product editor', async () => {
    await seedProduct({ product: { image: null }, variant: { active: false } });

    const html = renderToStaticMarkup(
      await EditProductPage({
        params: Promise.resolve({ code: 'NPL-1000' }),
        searchParams: Promise.resolve({}),
      }),
    );

    expect(html).toContain('Published, but no shopper can see this material');
    expect(html).toContain('No photograph');
    expect(html).toContain('No active pack with an approved public price');
  });
});
