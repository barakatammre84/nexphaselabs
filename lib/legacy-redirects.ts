/**
 * What the WordPress URLs do after the domain moves.
 *
 * At the cutover every path the old site had 404s. A 404 tells a search engine
 * "try again later" and tells a person "something is broken"; the register's
 * rule (chapter 1 §1.2) is that every live path gets a decision, per URL, and a
 * blanket redirect to the homepage is the worst option because search engines
 * read it as a soft 404 anyway.
 *
 *   301  an equivalent page exists — send the authority there
 *   410  it is genuinely gone — tell search engines to drop it deliberately
 *
 * The list is the real one: all 29 paths in the seven live child sitemaps,
 * recorded in docs/strategy/2026-09-12-wordpress-indexed-urls.txt. Search
 * Console will have more (it holds URLs that were never in a sitemap), which is
 * why unknown /product/ and /product-category/ paths are handled by shape as
 * well as by name.
 *
 * Product pages are NOT decided here. Which products exist is data, not code:
 * app/product/[slug]/route.ts looks the slug up and redirects it if it is
 * published, or returns 410 if it is not.
 */

export type LegacyDecision =
  | { status: 301; location: string }
  | { status: 410 };

/**
 * Exact paths, normalised: lower-case, no trailing slash.
 *
 * `/about/`, `/faq/` and `/contact/` are deliberately absent. The new build has
 * pages at those same paths, so a map entry would match the new page as well as
 * the old URL and redirect it to itself forever. The old URLs differ only by a
 * trailing slash, and the framework already answers that with its own 308 —
 * one hop, no entry needed. An identity redirect is a loop, not a redirect.
 */
const EXACT: Record<string, LegacyDecision> = {
  // Pages whose address changed.
  '/shop': { status: 301, location: '/catalog' },
  '/privacy-policy': { status: 301, location: '/legal/privacy' },
  '/shipping-policy': { status: 301, location: '/legal/shipping' },
  '/terms-of-service': { status: 301, location: '/legal/terms' },
  '/refund_returns': { status: 301, location: '/legal/returns' },
  // The disclaimer WAS the research-use notice, word for word: "All products
  // sold by NexPhase Labs are strictly intended for in-vitro laboratory research
  // and scientific study", down to the 21+ requirement. On 13 September the
  // nearest equivalent was the terms; since 14 September there is a page that is
  // the same document, so it goes there instead.
  '/disclaimer': { status: 301, location: '/legal/research-use' },
  // The shop category page carries real authority for "research peptides".
  '/product-category/research-peptides': { status: 301, location: '/catalog' },
  // The one indexed form is the contact form.
  '/form/simple-contact-form': { status: 301, location: '/contact' },

  // Genuinely gone. These should never have been indexed.
  '/cart': { status: 410 },
  '/checkout': { status: 410 },
  '/my-account': { status: 410 },
  '/customer-dashboard': { status: 410 },
  '/customer-cabinet': { status: 410 },
  '/shop-2': { status: 410 },
  '/accessibility-statement': { status: 410 },
  '/form': { status: 410 },
  '/hello-world': { status: 410 },
  '/category/uncategorized': { status: 410 },

  // The old sitemaps, as the live index listed them on 15 September 2026. Search Console
  // re-fetches the index it was given; send it and each child to the new sitemap so
  // discovery carries over instead of failing. /sitemap.xml itself is the new site's own.
  '/sitemap_index.xml': { status: 301, location: '/sitemap.xml' },
  '/wp-sitemap.xml': { status: 301, location: '/sitemap.xml' },
  '/archives-sitemap-1.xml': { status: 301, location: '/sitemap.xml' },
  '/post-type-page-sitemap-1.xml': { status: 301, location: '/sitemap.xml' },
  '/post-type-post-sitemap-1.xml': { status: 301, location: '/sitemap.xml' },
  '/post-type-product-sitemap-1.xml': { status: 301, location: '/sitemap.xml' },
  '/post-type-sureforms_form-sitemap-1.xml': { status: 301, location: '/sitemap.xml' },
  '/taxonomy-type-category-sitemap-1.xml': { status: 301, location: '/sitemap.xml' },
  '/taxonomy-type-product_cat-sitemap-1.xml': { status: 301, location: '/sitemap.xml' },

  // WordPress plumbing. No sitemap lists these and Search Console usually holds
  // several of them; they are gone and should be dropped, not retried.
  '/wp-login.php': { status: 410 },
  '/xmlrpc.php': { status: 410 },
  '/feed': { status: 410 },
  '/comments/feed': { status: 410 },
};

/**
 * Prefixes handled by shape, for the URLs Search Console will turn up that no
 * sitemap listed. Order matters: first match wins.
 */
const PREFIXES: { prefix: string; decide: (rest: string) => LegacyDecision }[] = [
  // Shop pagination and attribute filters: /shop/page/2, /shop/?filter_size=. The
  // catalog is the equivalent, so the authority goes there rather than nowhere.
  { prefix: '/shop/', decide: () => ({ status: 301, location: '/catalog' }) },
  // WooCommerce account and checkout endpoints: /my-account/orders, /checkout/order-received/123.
  { prefix: '/my-account/', decide: () => ({ status: 410 }) },
  { prefix: '/checkout/', decide: () => ({ status: 410 }) },
  { prefix: '/cart/', decide: () => ({ status: 410 }) },
  // Any other product category keeps its authority by landing on the catalog.
  { prefix: '/product-category/', decide: () => ({ status: 301, location: '/catalog' }) },
  // WordPress post archives and the default category tree are gone.
  { prefix: '/category/', decide: () => ({ status: 410 }) },
  { prefix: '/tag/', decide: () => ({ status: 410 }) },
  { prefix: '/author/', decide: () => ({ status: 410 }) },
  { prefix: '/form/', decide: () => ({ status: 410 }) },
  // WordPress internals and uploaded media. Nothing here moved to the new build.
  { prefix: '/wp-content/', decide: () => ({ status: 410 }) },
  { prefix: '/wp-includes/', decide: () => ({ status: 410 }) },
  { prefix: '/wp-admin/', decide: () => ({ status: 410 }) },
  { prefix: '/wp-json/', decide: () => ({ status: 410 }) },
];

/** Every RSS feed WordPress emitted, at any depth: /feed, /shop/feed, /product/x/feed. */
const FEED_SUFFIX = '/feed';

/** Paths whose decision needs the catalog, so it is made by a route handler. */
export const PRODUCT_PREFIX = '/product/';

export function normalisePath(pathname: string): string {
  const lowered = pathname.toLowerCase();
  const trimmed = lowered.length > 1 ? lowered.replace(/\/+$/, '') : lowered;
  return trimmed || '/';
}

/**
 * The decision for one old path, or null when the path is not a legacy one and
 * should be handled by the application as normal.
 */
export function legacyDecision(pathname: string): LegacyDecision | null {
  const path = normalisePath(pathname);
  if (path === '/') return null;
  // A product feed is a feed, not a product page: /product/bpc-157/feed must be
  // decided here, before the product short-circuit hands it to a catalog lookup
  // that would never match it anyway.
  if (path.endsWith(FEED_SUFFIX)) return { status: 410 };
  if (path.startsWith(PRODUCT_PREFIX)) return null; // decided against the catalog
  const exact = EXACT[path];
  // Belt and braces for the rule above: a path is never sent to itself, whatever
  // a future edit puts in the map.
  if (exact) return exact.status === 301 && exact.location === path ? null : exact;
  for (const { prefix, decide } of PREFIXES) {
    if (path.startsWith(prefix)) return decide(path.slice(prefix.length));
  }
  return null;
}

const GONE_BODY = [
  'Gone.',
  '',
  'This page belonged to the previous nexphaselabs.net and has been withdrawn.',
  'The catalog is at /catalog and lot documentation at /documentation/lot-lookup.',
].join('\n');

/** Build the response for a decision. Shared by the worker and the product route. */
export function legacyResponse(decision: LegacyDecision, origin: string): Response {
  if (decision.status === 410) {
    return new Response(GONE_BODY, {
      status: 410,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        // A 410 is permanent; let it be cached, but not for so long that a
        // deliberate reinstatement is impossible.
        'Cache-Control': 'public, max-age=3600',
      },
    });
  }
  return new Response(null, {
    status: 301,
    headers: {
      Location: new URL(decision.location, origin).toString(),
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

/** Every exact path this map decides, for tests and for the cutover checklist. */
export function legacyPaths(): string[] {
  return Object.keys(EXACT).sort();
}
