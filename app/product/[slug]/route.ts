import { getPublishedProduct } from '@/lib/catalog-data';
import { legacyResponse } from '@/lib/legacy-redirects';

/**
 * The WordPress product URL, after the cutover.
 *
 * Seven product pages are indexed under /product/<slug> and they need a
 * decision each (chapter 1 §1.2): a product still sold redirects to its new
 * page and keeps whatever authority the old URL had; a product no longer sold
 * returns 410 Gone, which tells a search engine to drop the URL deliberately
 * rather than retry it for months.
 *
 * Which products exist is data, not code, so the decision is a catalog lookup
 * rather than a list kept here. A product that is published today and withdrawn
 * tomorrow changes its own answer, and nobody has to remember to edit a map.
 *
 * If the catalog cannot be read, this answers 302 to /catalog rather than 410:
 * a temporary redirect is reversible, and telling a search engine a page is
 * permanently gone because a database was briefly unavailable is not.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const normalised = decodeURIComponent(slug).trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,80}$/.test(normalised)) {
    return legacyResponse({ status: 410 }, request.url);
  }
  try {
    const product = await getPublishedProduct(normalised);
    return legacyResponse(
      product
        ? { status: 301, location: `/catalog/${product.slug}` }
        : { status: 410 },
      request.url,
    );
  } catch (error) {
    console.error(
      '[legacy-product] catalog read failed',
      error instanceof Error ? error.message : error,
    );
    return new Response(null, {
      status: 302,
      headers: {
        Location: new URL('/catalog', request.url).toString(),
        'Cache-Control': 'no-store',
      },
    });
  }
}
