import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { lotTests, lots } from '@/db/schema';

/**
 * Public lot lookup.
 *
 * Returns the analytical record for a lot someone already holds. This mirrors
 * what Cayman Chemical and Chemyo publish, and it is the strongest genuine
 * trust signal available in this category — it is also entirely compliant,
 * because a certificate of analysis is a document, not a claim.
 *
 * Two limits are deliberate and must survive future edits:
 *
 *  1. Only RELEASED lots resolve. A quarantined, held, rejected or withdrawn
 *     lot returns 404 rather than leaking its existence and status.
 *  2. Nothing from `lotMovements` is ever returned here. Consignees, addresses
 *     and shipment records are not public, and this endpoint has no access to
 *     them.
 */

export const runtime = 'edge';

type PublicLot = {
  lotNumber: string;
  productCode: string;
  productName: string;
  casNumber: string;
  manufacturerName: string | null;
  manufacturerAddress: string | null;
  countryOfOrigin: string | null;
  manufactureDate: string | null;
  purityResult: string | null;
  purityMethod: string | null;
  identityConfirmed: boolean;
  identityMethod: string | null;
  waterContent: string | null;
  heavyMetalsSummary: string | null;
  retestDate: string | null;
  storageCondition: string | null;
  documents: { coa: boolean; chromatogram: boolean; massSpec: boolean; sds: boolean };
  tests: {
    testType: string;
    analyte: string | null;
    method: string;
    result: string;
    specification: string | null;
    passed: boolean | null;
  }[];
};

function iso(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ lotNumber: string }> },
) {
  const { lotNumber } = await params;
  const normalised = lotNumber.trim().toUpperCase();

  if (!/^[A-Z0-9-]{3,32}$/.test(normalised)) {
    return Response.json({ error: 'Invalid lot number format.' }, { status: 400 });
  }

  const unavailable = () =>
    Response.json(
      { error: 'Lot records are temporarily unavailable. Contact research@nexphaselabs.net.' },
      { status: 503 },
    );

  let db: ReturnType<typeof getDb>;
  try {
    db = getDb();
  } catch {
    return unavailable();
  }

  let lot: typeof lots.$inferSelect | undefined;
  let tests: (typeof lotTests.$inferSelect)[];
  try {
    [lot] = await db.select().from(lots).where(eq(lots.lotNumber, normalised)).limit(1);

    // Limit 1: unreleased lots do not resolve, and do not reveal that they exist.
    if (!lot || lot.status !== 'released') {
      return Response.json({ error: 'No released lot found with that number.' }, { status: 404 });
    }

    tests = await db.select().from(lotTests).where(eq(lotTests.lotId, lot.id));
  } catch (error) {
    // A missing migration or a D1 outage is an operational fault, not a lot
    // that does not exist. Never surface the query or the driver error.
    console.error('[lots] query failed', error instanceof Error ? error.message : error);
    return unavailable();
  }

  const payload: PublicLot = {
    lotNumber: lot.lotNumber,
    productCode: lot.productCode,
    productName: lot.productName,
    casNumber: lot.casNumber,
    manufacturerName: lot.manufacturerName,
    manufacturerAddress: lot.manufacturerAddress,
    countryOfOrigin: lot.countryOfOrigin,
    manufactureDate: iso(lot.manufactureDate),
    purityResult: lot.purityResult,
    purityMethod: lot.purityMethod,
    identityConfirmed: lot.identityConfirmed,
    identityMethod: lot.identityMethod,
    waterContent: lot.waterContent,
    heavyMetalsSummary: lot.heavyMetalsSummary,
    retestDate: iso(lot.retestDate),
    storageCondition: lot.storageCondition,
    documents: {
      coa: Boolean(lot.coaKey),
      chromatogram: Boolean(lot.chromatogramKey),
      massSpec: Boolean(lot.massSpecKey),
      sds: Boolean(lot.sdsKey),
    },
    tests: tests.map((t) => ({
      testType: t.testType,
      analyte: t.analyte,
      method: t.method,
      result: t.result,
      specification: t.specification,
      passed: t.passed,
    })),
  };

  // Short TTL and no stale serving: a withdrawn or recalled lot must stop
  // resolving within a minute, not an hour.
  return Response.json(payload, {
    headers: { 'Cache-Control': 'public, max-age=60, must-revalidate' },
  });
}
