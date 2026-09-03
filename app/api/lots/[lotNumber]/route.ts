import { getDb } from '@/db';
import { lotNumberFromParam } from '@/lib/lot-rules';
import { getPublicLot } from '@/lib/lots-public';

/**
 * Public lot lookup.
 *
 * Returns the analytical record for a lot someone already holds. This mirrors
 * what Cayman Chemical and Chemyo publish, and it is the strongest genuine
 * trust signal available in this category — it is also entirely compliant,
 * because a certificate of analysis is a document, not a claim.
 *
 * Only RELEASED lots resolve (see lib/lots-public.ts). A quarantined, held,
 * rejected or withdrawn lot returns the same 404 as an unknown one.
 */

export async function GET(_request: Request, { params }: { params: Promise<{ lotNumber: string }> }) {
  const { lotNumber } = await params;
  const normalised = lotNumberFromParam(lotNumber);
  if (!normalised) {
    return Response.json({ error: 'Invalid lot number format.' }, { status: 400 });
  }

  const unavailable = () =>
    Response.json(
      { error: 'Lot records are temporarily unavailable. Contact research@nexphaselabs.net.' },
      { status: 503 },
    );

  try {
    getDb();
  } catch {
    return unavailable();
  }

  let payload;
  try {
    payload = await getPublicLot(normalised);
  } catch (error) {
    // A missing migration or a D1 outage is an operational fault, not a lot
    // that does not exist. Never surface the query or the driver error.
    console.error('[lots] query failed', error instanceof Error ? error.message : error);
    return unavailable();
  }

  if (!payload) {
    return Response.json({ error: 'No released lot found with that number.' }, { status: 404 });
  }

  // Short TTL and no stale serving: a withdrawn or recalled lot must stop
  // resolving within a minute, not an hour.
  return Response.json(payload, {
    headers: { 'Cache-Control': 'public, max-age=60, must-revalidate' },
  });
}
