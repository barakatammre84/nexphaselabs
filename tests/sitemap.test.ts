import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localD1 } from './helpers/local-d1';

const { env } = vi.hoisted(() => ({
  env: {} as { DB?: D1Database; APP_ENV?: string; PUBLIC_ORIGIN?: string },
}));
vi.mock('cloudflare:workers', () => ({ env }));

import { getDb } from '@/db';
import { lots, products, productVariants } from '@/db/schema';
import sitemap from '@/app/sitemap';
import robots from '@/app/robots';
import { releasedLotsByProduct } from '@/lib/lots-public';

/**
 * Chapter 1 §1.3. The sitemap is the discovery surface for a business whose
 * search strategy is chemical-identity long tail, and it is also a leak risk:
 * the public lot API deliberately 404s anything that is not a released,
 * publishable lot, and a sitemap that lists those lots would hand over exactly
 * what the API hides.
 */

let local: ReturnType<typeof localD1>;

const publishableLot = (lotNumber: string, overrides: Record<string, unknown> = {}) => ({
  id: `lot_${lotNumber}`,
  lotNumber,
  productCode: 'GHK-CU',
  productName: 'GHK-Cu',
  casNumber: '49557-75-7',
  manufacturerName: 'Named Manufacturer Ltd',
  manufacturerAddress: '1 Real Street, Somewhere',
  accessionNumber: `ACC-${lotNumber}`,
  analyticalLab: 'Independent Lab Services',
  testingStandard: 'NXP-REL-2026.1',
  receivedAt: new Date('2026-08-20T00:00:00Z'),
  status: 'released',
  releasedAt: new Date('2026-09-01T00:00:00Z'),
  createdBy: 'test',
  ...overrides,
});

beforeEach(async () => {
  local = localD1();
  env.DB = local.binding;
  env.APP_ENV = 'production';
  env.PUBLIC_ORIGIN = 'https://nexphaselabs.net';
  const product = (id: string, code: string, slug: string, visibility: string) => ({
    id,
    code,
    slug,
    name: slug,
    formalName: slug,
    chemicalClass: 'peptide',
    casNumber: '49557-75-7',
    molecularFormula: 'C14H22CuN6O4',
    molecularWeight: '401.91',
    purity: '>= 98% (HPLC)',
    form: 'Lyophilised solid',
    saltForm: 'Acetate',
    storageSolid: '-20 C',
    storageStock: '-80 C',
    stability: 'See certificate',
    shipping: 'Ambient',
    description: 'Test fixture.',
    visibility,
  });
  // one row per statement: D1 allows 100 bound parameters and a product is ~26
  for (const row of [
    { ...product('p1', 'GHK-CU', 'ghk-cu', 'published'), image: 'products/ghk-cu.png' },
    { ...product('p2', 'BPC-157', 'bpc-157', 'published'), image: 'products/bpc-157.png' },
    product('p3', 'DRAFT-1', 'not-published-yet', 'draft'),
    product('p4', 'GONE-1', 'withdrawn-product', 'withdrawn'),
  ]) {
    await getDb().insert(products).values(row as never);
  }
  // The storefront listing rule: a product is in the sitemap only when it is
  // photographed, priced and backed by a publishable lot. BPC-157 is published
  // and priced but has no lot; GHK-Cu has GHK-2601.
  for (const row of [
    { id: 'v1', productId: 'p1', sku: 'GHK-CU-50MG', quantity: '50 mg', presentation: 'vial', listPriceCents: 2900, active: true },
    { id: 'v2', productId: 'p2', sku: 'BPC-157-5MG', quantity: '5 mg', presentation: 'vial', listPriceCents: 3900, active: true },
  ]) {
    await getDb().insert(productVariants).values(row as never);
  }
  for (const row of [
      publishableLot('GHK-2601'),
      publishableLot('GHK-2602', { status: 'quarantine', releasedAt: null, statusReason: 'awaiting COA' }),
      publishableLot('GHK-2603', { status: 'held', releasedAt: null, statusReason: 'investigation' }),
      publishableLot('GHK-2604', { status: 'rejected', releasedAt: null, statusReason: 'out of specification' }),
      publishableLot('GHK-2605', { status: 'withdrawn', releasedAt: null, statusReason: 'recalled' }),
      // released, but missing the lab reference the publication rule requires
      publishableLot('GHK-2606', { accessionNumber: null }),
      publishableLot('GHK-2607', { analyticalLab: '   ' }),
      publishableLot('GHK-2608', { testingStandard: null }),
      // superseded by a correction: the replacement is public, this row is not
      publishableLot('GHK-2609', { supersededById: 'lot_GHK-2601' }),
  ]) {
    await getDb().insert(lots).values(row as never);
  }
});

afterEach(() => {
  local.sqlite.close();
  for (const key of Object.keys(env)) delete (env as Record<string, unknown>)[key];
});

const urls = async () => (await sitemap()).map((entry) => entry.url);

describe('sitemap', () => {
  it('exists at all — it was the most consequential missing file on the site', async () => {
    expect((await urls()).length).toBeGreaterThan(10);
  });

  it('lists the static pages a researcher needs to find', async () => {
    const list = await urls();
    for (const path of [
      '/',
      '/catalog',
      '/documentation',
      '/documentation/lot-lookup',
      '/documentation/sds',
      '/about',
      '/faq',
      '/contact',
      '/legal/terms',
      '/legal/privacy',
      '/legal/shipping',
      '/legal/returns',
    ]) {
      expect(list, path).toContain(`https://nexphaselabs.net${path}`);
    }
  });

  it('lists storefront products and no others', async () => {
    const list = await urls();
    expect(list).toContain('https://nexphaselabs.net/catalog/ghk-cu');
    // published and priced, but no publishable lot: not on the storefront, so not in the map
    expect(list).not.toContain('https://nexphaselabs.net/catalog/bpc-157');
    expect(list).not.toContain('https://nexphaselabs.net/catalog/not-published-yet');
    expect(list).not.toContain('https://nexphaselabs.net/catalog/withdrawn-product');
  });

  it('lists released, publishable lots — the pages nobody else has', async () => {
    expect(await urls()).toContain('https://nexphaselabs.net/lots/GHK-2601');
  });

  it('never leaks a lot the public API deliberately hides', async () => {
    const list = await urls();
    for (const lotNumber of [
      'GHK-2602', // quarantine
      'GHK-2603', // held
      'GHK-2604', // rejected
      'GHK-2605', // withdrawn
      'GHK-2606', // released but no accession number
      'GHK-2607', // released but no analytical lab
      'GHK-2608', // released but no testing standard
      'GHK-2609', // superseded by a correction
    ]) {
      expect(list, lotNumber).not.toContain(`https://nexphaselabs.net/lots/${lotNumber}`);
    }
  });

  it('keeps account, cart, order and manage paths out', async () => {
    const list = await urls();
    for (const fragment of ['/account', '/manage', '/staff', '/api', '/cart', '/checkout']) {
      expect(list.filter((url) => url.includes(fragment)), fragment).toEqual([]);
    }
  });

  it('is empty outside production, so a staging origin never competes with the domain', async () => {
    for (const value of ['staging', 'development', undefined]) {
      env.APP_ENV = value;
      expect(await sitemap()).toEqual([]);
    }
  });

  it('still ships the static pages when the database is unreadable', async () => {
    delete env.DB;
    const list = await urls();
    expect(list).toContain('https://nexphaselabs.net/');
    expect(list.some((url) => url.includes('/catalog/'))).toBe(false);
    expect(list.some((url) => url.includes('/lots/'))).toBe(false);
  });
});

describe('robots', () => {
  const rule = () => {
    const rules = robots().rules;
    return Array.isArray(rules) ? rules[0] : rules;
  };
  const disallowed = () => {
    const value = rule().disallow;
    return Array.isArray(value) ? value : value ? [value] : [];
  };

  it('keeps the staff and customer areas out', () => {
    for (const path of ['/manage', '/staff', '/api', '/account']) {
      expect(disallowed(), path).toContain(path);
    }
  });

  it('keeps the query-string forms of public pages out — they duplicate the sitemap', () => {
    expect(disallowed()).toContain('/catalog?');
    expect(disallowed()).toContain('/catalog/*?');
    expect(disallowed()).toContain('/documentation/lot-lookup?');
  });

  it('leaves the pages the sitemap lists crawlable', () => {
    expect(rule().allow).toBe('/');
    for (const path of ['/catalog', '/catalog/ghk-cu', '/lots/GHK-2601', '/documentation']) {
      expect(disallowed().some((entry) => path.startsWith(entry.replace('*', ''))), path).toBe(false);
    }
  });

  it('lets a crawler fetch the old WordPress product URLs, so it learns they moved', () => {
    expect(disallowed().some((entry) => entry.startsWith('/product'))).toBe(false);
  });

  it('points at the sitemap', () => {
    expect(robots().sitemap).toBe('https://nexphaselabs.net/sitemap.xml');
  });

  it('disallows everything outside production', () => {
    for (const value of ['staging', 'development', undefined]) {
      env.APP_ENV = value;
      const rules = robots().rules;
      expect(Array.isArray(rules) ? rules[0].disallow : rules.disallow).toBe('/');
      expect(robots().sitemap).toBeUndefined();
    }
  });
});

describe('the certificate library', () => {
  it('groups released lots by product, newest first', async () => {
    const library = await releasedLotsByProduct();
    expect(library).toHaveLength(1);
    expect(library[0].productCode).toBe('GHK-CU');
    expect(library[0].lots.map((lot) => lot.lotNumber)).toEqual(['GHK-2601']);
    expect(library[0].lots[0].accessionNumber).toBe('ACC-GHK-2601');
    expect(library[0].lots[0].analyticalLab).toBe('Independent Lab Services');
  });

  it('applies exactly the same publication rule as the sitemap and the lookup', async () => {
    const listed = (await releasedLotsByProduct()).flatMap((entry) =>
      entry.lots.map((lot) => lot.lotNumber),
    );
    for (const hidden of [
      'GHK-2602',
      'GHK-2603',
      'GHK-2604',
      'GHK-2605',
      'GHK-2606',
      'GHK-2607',
      'GHK-2608',
      'GHK-2609',
    ]) {
      expect(listed, hidden).not.toContain(hidden);
    }
  });

  it('never carries a quantity, a movement or who released it', async () => {
    const [entry] = await releasedLotsByProduct();
    expect(Object.keys(entry.lots[0]).sort()).toEqual([
      'accessionNumber',
      'analyticalLab',
      'casNumber',
      'hasCoa',
      'lotNumber',
      'productCode',
      'productName',
      'purityResult',
      'releasedOn',
    ]);
  });
});
