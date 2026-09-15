import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localD1 } from './helpers/local-d1';

const { env } = vi.hoisted(() => ({ env: {} as { DB?: D1Database } }));
vi.mock('cloudflare:workers', () => ({ env }));

import { getDb } from '@/db';
import { lots, products, productVariants } from '@/db/schema';
import { GET } from '@/app/product/[slug]/route';

/**
 * Chapter 1 §1.2, the product half: seven WordPress product URLs are indexed and
 * each needs its own decision, taken against the live catalog.
 *
 * This file exists because the route had no test on 14 September and the
 * storefront listing rule (chapter 19) silently broke it: three of the seven
 * indexed URLs were 301-ing to /catalog/<slug> pages that now answer 404.
 */

let local: ReturnType<typeof localD1>;

const product = (id: string, code: string, slug: string, image: string | null) => ({
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
  visibility: 'published',
  image,
});

beforeEach(async () => {
  local = localD1();
  env.DB = local.binding;
  // Listed: photographed, priced, and a publishable lot that supplies the pack.
  await getDb().insert(products).values(product('p1', 'GHK-CU', 'ghk-cu', 'products/ghk-cu.png') as never);
  await getDb().insert(productVariants).values({ id: 'v1', productId: 'p1', sku: 'GHK-CU-50MG', quantity: '50 mg', presentation: 'vial', listPriceCents: 2900, active: true } as never);
  await getDb().insert(lots).values({ id: 'l1', lotNumber: 'GHK-2601', productCode: 'GHK-CU', productName: 'GHK-Cu', casNumber: '49557-75-7', status: 'released', analyticalLab: 'Independent Lab Services', accessionNumber: 'ACC-1', testingStandard: 'NXP-REL-2026.1', receivedAt: new Date(), quantityRemaining: '500 mg', quantityReceived: '500 mg' } as never);
  // Published and priced, but no lot has been released: no page to send anyone to.
  await getDb().insert(products).values(product('p2', 'BPC-157', 'bpc-157', 'products/bpc-157.png') as never);
  await getDb().insert(productVariants).values({ id: 'v2', productId: 'p2', sku: 'BPC-157-5MG', quantity: '5 mg', presentation: 'vial', listPriceCents: 3900, active: true } as never);
});

afterEach(() => {
  // One test closes the database on purpose, to prove the unreadable-catalog
  // path; closing it twice throws.
  try {
    local.sqlite.close();
  } catch {
    /* already closed by the test */
  }
  delete env.DB;
});

const call = (slug: string) =>
  GET(new Request(`https://nexphaselabs.net/product/${slug}`), {
    params: Promise.resolve({ slug }),
  });

describe('an indexed WordPress product URL', () => {
  it('sends a listed product to its new page, permanently', async () => {
    const response = await call('ghk-cu');
    expect(response.status).toBe(301);
    expect(new URL(response.headers.get('location')!).pathname).toBe('/catalog/ghk-cu');
  });

  it('never sends anyone to a page that answers 404', async () => {
    // BPC-157 is published but not listed, so /catalog/bpc-157 is a 404. The old
    // URL must not point at it — that is the defect this test was written for.
    const response = await call('bpc-157');
    const location = new URL(response.headers.get('location')!).pathname;
    expect(location).not.toBe('/catalog/bpc-157');
    expect(location).toBe('/catalog');
  });

  it('calls an unlisted product temporary, because out of stock is not forever', async () => {
    const response = await call('bpc-157');
    expect(response.status).toBe(302);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('upgrades itself to a permanent redirect once the product is listed', async () => {
    local.sqlite.exec("INSERT INTO lots (id, lot_number, product_code, product_name, cas_number, status, analytical_lab, accession_number, testing_standard, received_at, quantity_remaining, quantity_received) VALUES ('l2','BPC-2601','BPC-157','BPC-157','137525-51-0','released','Independent Lab Services','ACC-2','NXP-REL-2026.1',unixepoch(),'500 mg','500 mg')");
    const response = await call('bpc-157');
    expect(response.status).toBe(301);
    expect(new URL(response.headers.get('location')!).pathname).toBe('/catalog/bpc-157');
  });

  it('drops a product the new catalog does not carry', async () => {
    // tesamorelin is on the counsel-hold list; nexphase-2t and nexphase-3r are
    // the codenames chapter 19 §19.3 forbids. None may be reinstated by a
    // redirect that quietly carries the old URL's authority forward.
    for (const slug of ['tesamorelin', 'nexphase-2t', 'nexphase-3r']) {
      expect((await call(slug)).status, slug).toBe(410);
    }
  });

  it('refuses a slug that is not a slug rather than querying with it', async () => {
    for (const slug of ['../../etc/passwd', 'a'.repeat(200), '-leading-dash', '']) {
      expect((await call(slug)).status, slug).toBe(410);
    }
  });

  it('answers a malformed percent-escape the way it answers any other unknown slug', async () => {
    // decodeURIComponent throws on these, which used to surface as a 500.
    expect((await call('no-such-product')).status).toBe(410);
    for (const slug of ['%E0%A4%A', '%', 'ghk-cu%']) {
      expect((await call(slug)).status, slug).toBe(410);
    }
  });

  it('stays reversible when the catalog cannot be read', async () => {
    local.sqlite.close();
    const response = await call('ghk-cu');
    expect(response.status).toBe(302);
    expect(new URL(response.headers.get('location')!).pathname).toBe('/catalog');
  });
});
