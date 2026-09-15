import { getPublishedProduct } from '@/lib/catalog-data';
import { isListed } from '@/lib/storefront';
import { legacyResponse } from '@/lib/legacy-redirects';

/**
 * The WordPress product URL, after the cutover.
 *
 * Seven product pages are indexed under /product/<slug> and they need a
 * decision each (chapter 1 §1.2). Which products exist is data, not code, so
 * the decision is a catalog lookup rather than a list kept here: a product
 * published today and withdrawn tomorrow changes its own answer.
 *
 * There are three states, not two, and the third one is why this file changed
 * on 14 September. The storefront listing rule (chapter 19) means a published
 * product is not necessarily a product with a page: /catalog/<slug> answers 404
 * unless the product is photographed, priced and backed by a publishable lot.
 * Redirecting an indexed URL to a 404 is worse than leaving it to 404 on its
 * own — a searcher who followed a Google result lands on a broken page and we
 * put them there deliberately.
 *
 *   listed              301 → /catalog/<slug>   the equivalent page, permanently
 *   published, unlisted 302 → /catalog          awaiting a lot, photo or price
 *   not in the catalog  410                     deliberately dropped
 *
 * The middle state is a 302 on purpose. "Out of stock this week" is not a
 * permanent fact, and a 301 would consolidate the old URL onto the catalog for
 * good; when the product is listed again this route starts answering 301 to its
 * own page without anyone editing anything.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const normalised = decodedSlug(slug);
  if (normalised === null || !/^[a-z0-9][a-z0-9-]{0,80}$/.test(normalised)) {
    return legacyResponse({ status: 410 }, request.url);
  }
  try {
    const product = await getPublishedProduct(normalised);
    if (!product) return legacyResponse({ status: 410 }, request.url);
    if (await isListed(product)) {
      return legacyResponse(
        { status: 301, location: `/catalog/${product.slug}` },
        request.url,
      );
    }
    return temporarily('/catalog', request.url);
  } catch (error) {
    // Telling a search engine a page is permanently gone because a database was
    // briefly unavailable is not reversible. A temporary redirect is.
    console.error(
      '[legacy-product] catalog read failed',
      error instanceof Error ? error.message : error,
    );
    return temporarily('/catalog', request.url);
  }
}

/** Null for a malformed percent-escape, which decodeURIComponent throws on: not a slug, so not a 500. */
function decodedSlug(raw: string): string | null {
  try {
    return decodeURIComponent(raw).trim().toLowerCase();
  } catch {
    return null;
  }
}

function temporarily(location: string, origin: string): Response {
  return new Response(null, {
    status: 302,
    headers: {
      Location: new URL(location, origin).toString(),
      'Cache-Control': 'no-store',
    },
  });
}
