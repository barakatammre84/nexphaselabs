import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  legacyDecision,
  legacyPaths,
  legacyResponse,
  normalisePath,
} from '@/lib/legacy-redirects';

/**
 * Chapter 1 §1.2: at the cutover every WordPress URL 404s. The rule is that
 * every live path gets a decision — 301 where an equivalent exists, 410 where
 * the page is genuinely gone — and never a blanket redirect to the homepage.
 *
 * The list these tests run against is the real one, pulled from the live site's
 * seven child sitemaps, so the map cannot drift from what is actually indexed.
 */

const INDEXED = readFileSync(
  'docs/strategy/2026-09-12-wordpress-indexed-urls.txt',
  'utf8',
)
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean);

const decisionFor = (path: string) => legacyDecision(path);

describe('the indexed URL list', () => {
  it('is the one taken from the live sitemaps', () => {
    expect(INDEXED.length).toBe(29);
    expect(INDEXED).toContain('/shop/');
    expect(INDEXED).toContain('/product/bpc-157/');
  });

  it('decides every indexed path — nothing is left to 404', () => {
    // Paths the new build serves at the same address need no decision: the old
    // URL differs only by a trailing slash and the framework normalises it.
    const servedAtTheSameAddress = ['/about/', '/faq/', '/contact/'];
    const undecided = INDEXED.filter((path) => {
      if (path === '/') return false; // the home page still exists
      if (servedAtTheSameAddress.includes(path)) return false;
      if (path.startsWith('/product/')) return false; // decided against the catalog
      return decisionFor(path) === null;
    });
    expect(undecided).toEqual([]);
  });
});

describe('301 targets', () => {
  const redirects = INDEXED.map((path) => [path, decisionFor(path)] as const).filter(
    (entry): entry is readonly [string, { status: 301; location: string }] =>
      entry[1]?.status === 301,
  );

  it('sends the pages whose address changed to the new address', () => {
    expect(Object.fromEntries(redirects.map(([from, to]) => [from, to.location]))).toEqual({
      '/shop/': '/catalog',
      '/privacy-policy/': '/legal/privacy',
      '/shipping-policy/': '/legal/shipping',
      '/terms-of-service/': '/legal/terms',
      '/refund_returns/': '/legal/returns',
      '/disclaimer/': '/legal/research-use',
      '/product-category/research-peptides/': '/catalog',
      '/form/simple-contact-form/': '/contact',
    });
  });

  it('never redirects to the homepage — a search engine reads that as a soft 404', () => {
    for (const [from, to] of redirects) {
      expect(to.location, `${from} must not land on the homepage`).not.toBe('/');
    }
  });

  it('never sends a path to itself', () => {
    // /about/, /faq/ and /contact/ exist on both sites. An entry for them would
    // match the NEW page too and redirect it to itself forever; the framework's
    // own trailing-slash 308 handles the old URLs in one hop instead.
    for (const path of legacyPaths()) {
      const decision = legacyDecision(path);
      if (decision?.status === 301) expect(decision.location, path).not.toBe(path);
    }
    for (const path of ['/about', '/faq', '/contact']) {
      expect(legacyDecision(path), path).toBeNull();
      expect(legacyDecision(`${path}/`), `${path}/`).toBeNull();
    }
  });

  it('points only at routes that exist in this build', () => {
    for (const [from, to] of redirects) {
      const segments = to.location.replace(/^\//, '').split('/').filter(Boolean);
      const directory = ['app', ...segments].join('/');
      expect(
        existsSync(`${directory}/page.tsx`) || existsSync(`${directory}/route.ts`),
        `${from} → ${to.location} but app/${segments.join('/')} has no page`,
      ).toBe(true);
    }
  });
});

describe('410 Gone', () => {
  it('covers the cart, checkout and account pages that should never have been indexed', () => {
    for (const path of [
      '/cart/',
      '/checkout/',
      '/my-account/',
      '/customer-dashboard/',
      '/customer-cabinet/',
      '/shop-2/',
      '/accessibility-statement/',
      '/hello-world/',
      '/category/uncategorized/',
      '/form/',
    ]) {
      expect(decisionFor(path), path).toEqual({ status: 410 });
    }
  });

  it('covers WooCommerce sub-paths that no sitemap lists', () => {
    for (const path of [
      '/my-account/orders/',
      '/my-account/edit-address/billing',
      '/checkout/order-received/1042/',
      '/cart/?add-to-cart=17',
      '/tag/peptides/',
      '/author/admin/',
    ]) {
      expect(decisionFor(path.split('?')[0]), path).toEqual({ status: 410 });
    }
  });

  it('keeps an unknown product category on the catalog rather than losing it', () => {
    expect(decisionFor('/product-category/something-else/')).toEqual({
      status: 301,
      location: '/catalog',
    });
  });
});

describe('the URLs no sitemap lists', () => {
  // Chapter 1 §1.2 says to pull the list from Search Console as well as the
  // sitemaps, because Search Console holds URLs a sitemap never carried. Until
  // someone with access exports it, these are handled by shape.
  it('drops WordPress plumbing', () => {
    for (const path of [
      '/wp-login.php',
      '/xmlrpc.php',
      '/wp-admin/edit.php',
      '/wp-json/wp/v2/posts',
      '/wp-content/uploads/2026/05/vial.jpg',
      '/wp-includes/js/jquery.js',
    ]) {
      expect(decisionFor(path), path).toEqual({ status: 410 });
    }
  });

  it('drops every feed, at any depth', () => {
    for (const path of ['/feed/', '/comments/feed/', '/shop/feed/', '/product/bpc-157/feed/']) {
      expect(decisionFor(path), path).toEqual({ status: 410 });
    }
  });

  it('keeps shop pagination and filters on the catalog', () => {
    for (const path of ['/shop/page/2/', '/shop/page/7/']) {
      expect(decisionFor(path), path).toEqual({ status: 301, location: '/catalog' });
    }
  });
});

describe('what the map must not touch', () => {
  it('leaves the new site alone', () => {
    for (const path of [
      '/',
      '/about',
      '/faq',
      '/contact',
      '/catalog',
      '/catalog/bpc-157',
      '/documentation/lot-lookup',
      '/lots/GHK-2601',
      '/account/orders',
      '/manage/controls',
      '/api/health',
      '/legal/privacy',
    ]) {
      expect(decisionFor(path), path).toBeNull();
    }
  });

  it('leaves product pages to the route that can read the catalog', () => {
    for (const path of ['/product/bpc-157/', '/product/tesamorelin/', '/product/anything']) {
      expect(decisionFor(path)).toBeNull();
    }
  });
});

describe('path normalisation', () => {
  it('treats the trailing slash and the case the way WordPress emitted them', () => {
    expect(normalisePath('/Shop/')).toBe('/shop');
    expect(normalisePath('/SHOP')).toBe('/shop');
    expect(normalisePath('/shop///')).toBe('/shop');
    expect(normalisePath('/')).toBe('/');
    expect(decisionFor('/Privacy-Policy/')).toEqual({ status: 301, location: '/legal/privacy' });
  });
});

describe('the responses themselves', () => {
  const origin = 'https://nexphaselabs.net/shop/';

  it('sends an absolute Location and a permanent status', () => {
    const response = legacyResponse({ status: 301, location: '/catalog' }, origin);
    expect(response.status).toBe(301);
    expect(response.headers.get('Location')).toBe('https://nexphaselabs.net/catalog');
  });

  it('says plainly that a gone page is gone, and where to go instead', async () => {
    const response = legacyResponse({ status: 410 }, origin);
    expect(response.status).toBe(410);
    const body = await response.text();
    expect(body).toContain('withdrawn');
    expect(body).toContain('/catalog');
  });

  it('lets both be cached, but not permanently', () => {
    for (const decision of [{ status: 301 as const, location: '/catalog' }, { status: 410 as const }]) {
      expect(legacyResponse(decision, origin).headers.get('Cache-Control')).toBe(
        'public, max-age=3600',
      );
    }
  });
});

describe('the map as a whole', () => {
  it('decides every path it claims to, with no duplicates', () => {
    const paths = legacyPaths();
    expect(new Set(paths).size).toBe(paths.length);
    for (const path of paths) expect(decisionFor(path)).not.toBeNull();
  });

  it('is roughly half redirects and half withdrawals — not one blanket rule', () => {
    const decisions = legacyPaths().map((path) => decisionFor(path)!.status);
    expect(decisions.filter((s) => s === 301).length).toBeGreaterThan(5);
    expect(decisions.filter((s) => s === 410).length).toBeGreaterThan(5);
  });
});

describe('the old sitemaps', () => {
  it('sends the index Search Console holds, and every child it listed, to the new sitemap', () => {
    for (const path of [
      '/sitemap_index.xml',
      '/wp-sitemap.xml',
      '/archives-sitemap-1.xml',
      '/post-type-page-sitemap-1.xml',
      '/post-type-post-sitemap-1.xml',
      '/post-type-product-sitemap-1.xml',
      '/post-type-sureforms_form-sitemap-1.xml',
      '/taxonomy-type-category-sitemap-1.xml',
      '/taxonomy-type-product_cat-sitemap-1.xml',
    ]) {
      expect(decisionFor(path), path).toEqual({ status: 301, location: '/sitemap.xml' });
    }
  });

  it('leaves the new sitemap to the application', () => {
    expect(decisionFor('/sitemap.xml')).toBeNull();
    expect(existsSync('app/sitemap.ts')).toBe(true);
  });
});
