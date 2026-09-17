import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localD1 } from './helpers/local-d1';
import { seedCommerceFixture } from './helpers/commerce-fixture';

const { env } = vi.hoisted(() => ({ env: {} as Record<string, unknown> }));
vi.mock('cloudflare:workers', () => ({ env }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

import { getDb } from '@/db';
import { lots, products, productVariants } from '@/db/schema';
import { listPublishedProductsInClass } from '@/lib/catalog-data';
import { listRelatedProducts } from '@/lib/storefront';

let local: ReturnType<typeof localD1>;

async function product(id: string, code: string, chemicalClass: string, visibility = 'published') {
  await getDb().insert(products).values({ id, code, slug: code.toLowerCase(), name: `Product ${code}`, formalName: 'Test', chemicalClass, casNumber: '50-00-0', molecularFormula: 'Test', molecularWeight: 'Test', purity: 'Test', form: 'Test', saltForm: 'Test', storageSolid: 'Test', storageStock: 'Test', stability: 'Test', shipping: 'Test', description: 'Local synthetic fixture', visibility });
  await getDb().insert(productVariants).values({ id: `v_${id}`, productId: id, sku: `${code}-2MG`, quantity: '2 mg', presentation: 'powder', listPriceCents: 100, active: true });
  await getDb().insert(lots).values({ id: `l_${id}`, lotNumber: `LOT-${code}`, productCode: code, productName: `Product ${code}`, casNumber: '50-00-0', status: 'released', analyticalLab: 'Fixture lab', accessionNumber: `ACC-${code}`, testingStandard: 'Fixture panel v1', receivedAt: new Date(), quantityRemaining: '10 mg', quantityReceived: '10 mg' });
}

beforeEach(async () => {
  local = localD1();
  Object.assign(env, { DB: local.binding, APP_ENV: 'staging', OPEN_CHECKOUT_ENABLED: 'true' });
  await seedCommerceFixture(); // NPL-9999 in class "Test"
  await product('same', 'NPL-8888', 'Test');
  await product('other', 'NPL-7777', 'Other class');
  await product('draft', 'NPL-6666', 'Test', 'draft');
});
afterEach(() => {
  local.sqlite.close();
  for (const key of Object.keys(env)) delete env[key];
});

describe('related materials', () => {
  it('reads only the published products of one chemical class', async () => {
    expect((await listPublishedProductsInClass('Test')).map((p) => p.code).sort()).toEqual(['NPL-8888', 'NPL-9999']);
    expect(await listPublishedProductsInClass('Nothing')).toEqual([]);
  });

  it('offers listed siblings of the same class, never the product itself or another class', async () => {
    const related = await listRelatedProducts({ code: 'NPL-9999', chemicalClass: 'Test' });
    expect(related.map((p) => p.code)).toEqual(['NPL-8888']);
    expect(related[0].stock).toBe('in_stock');
    expect(await listRelatedProducts({ code: 'NPL-8888', chemicalClass: 'Test' }, 0)).toEqual([]);
    expect((await listRelatedProducts({ code: 'NPL-7777', chemicalClass: 'Other class' })).length).toBe(0);
  });
});
