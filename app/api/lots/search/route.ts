import { getDb } from '@/db';
import { LOT_SEARCH_LIMIT, searchReleasedLots } from '@/lib/lots-public';

/**
 * Public lot search — product, lot number, or accession number.
 *
 * Released lots only. Returns the same class of field the single-lot lookup
 * returns: identity and analytical provenance, never quantities, never
 * movements, never who released it.
 *
 * Publicly queryable on purpose. A certificate a customer cannot independently
 * confirm is a claim, not a record.
 */

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get('q') ?? '';

  if (query.trim().length < 2) {
    return Response.json({ error: 'Enter at least two characters.' }, { status: 400 });
  }

  try {
    getDb();
  } catch {
    return Response.json(
      { error: 'Lot records are temporarily unavailable. Contact research@nexphaselabs.net.' },
      { status: 503 },
    );
  }

  try {
    const results = await searchReleasedLots(query);
    return Response.json(
      { results, limit: LOT_SEARCH_LIMIT, truncated: results.length === LOT_SEARCH_LIMIT },
      // Short TTL, no stale serving: a withdrawn lot must stop resolving quickly.
      { headers: { 'Cache-Control': 'public, max-age=60' } },
    );
  } catch (error) {
    console.error('[lots] search failed', error instanceof Error ? error.message : error);
    return Response.json(
      { error: 'Lot records are temporarily unavailable. Contact research@nexphaselabs.net.' },
      { status: 503 },
    );
  }
}
