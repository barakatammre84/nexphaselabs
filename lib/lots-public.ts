import { and, desc, eq, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { lotFamilyIds } from '@/lib/lot-family';
import { lotTests, lots, type Lot } from '@/db/schema';
import type { DocumentType } from '@/lib/documents';
import { isPublishable } from '@/lib/lot-rules';

/**
 * SQL form of the publication rule (see lot-rules.ts publicationBlockers). Every
 * public query composes this so a released-but-unpublishable lot never resolves.
 */
export const publishableLot = () =>
  and(
    eq(lots.status, 'released'),
    isNull(lots.supersededById),
    isNotNull(lots.analyticalLab),
    isNotNull(lots.accessionNumber),
    isNotNull(lots.testingStandard),
    sql`trim(${lots.analyticalLab}) <> ''`,
    sql`trim(${lots.accessionNumber}) <> ''`,
    sql`trim(${lots.testingStandard}) <> ''`,
  );

/**
 * Public lot record.
 *
 * Two limits are deliberate and must survive future edits:
 *
 *  1. Only RELEASED lots resolve. Anything else returns null, and callers
 *     answer 404 exactly as they would for a lot that never existed.
 *  2. Nothing from `lotMovements`, `lotStatusEvents` or `lotDocuments`
 *     metadata is ever returned. Consignees, addresses, shipment records,
 *     who released the lot and who uploaded what are not public.
 */

export type PublicLot = {
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
  accessionNumber: string | null;
  analyticalLab: string | null;
  netPeptideContent: string | null;
  appearance: string | null;
  testingStandard: string | null;
  retestDate: string | null;
  storageCondition: string | null;
  releasedOn: string | null;
  documents: Record<DocumentType, boolean>;
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

/** The released lot row, or null. Never returns an unreleased lot. */
export async function getReleasedLot(lotNumber: string): Promise<Lot | null> {
  const db = getDb();
  const [lot] = await db
    .select()
    .from(lots)
    .where(and(eq(lots.lotNumber, lotNumber), isNull(lots.supersededById)))
    .limit(1);
  if (!lot || lot.status !== 'released') return null;
  if (!isPublishable(lot)) return null;
  return lot;
}

export async function getPublicLot(
  lotNumber: string,
): Promise<PublicLot | null> {
  const lot = await getReleasedLot(lotNumber);
  if (!lot) return null;
  const db = getDb();
  const family = await lotFamilyIds(lot.id);
  const tests = await db
    .select()
    .from(lotTests)
    .where(
      sql`${lotTests.lotId} IN (SELECT value FROM json_each(${JSON.stringify(family)}))`,
    );

  return {
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
    accessionNumber: lot.accessionNumber,
    analyticalLab: lot.analyticalLab,
    netPeptideContent: lot.netPeptideContent,
    appearance: lot.appearance,
    testingStandard: lot.testingStandard,
    retestDate: iso(lot.retestDate),
    storageCondition: lot.storageCondition,
    releasedOn: iso(lot.releasedAt),
    documents: {
      coa: Boolean(lot.coaKey),
      chromatogram: Boolean(lot.chromatogramKey),
      mass_spec: Boolean(lot.massSpecKey),
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
}

/** Object key of the current document of a type on a RELEASED lot, or null. */
export function publicDocumentKey(lot: Lot, type: DocumentType): string | null {
  if (lot.status !== 'released' || !isPublishable(lot)) return null;
  switch (type) {
    case 'coa':
      return lot.coaKey;
    case 'chromatogram':
      return lot.chromatogramKey;
    case 'mass_spec':
      return lot.massSpecKey;
    case 'sds':
      return lot.sdsKey;
    default:
      return null;
  }
}

export function publicDocumentPath(
  lotNumber: string,
  type: DocumentType,
): string {
  return `/api/lots/${encodeURIComponent(lotNumber)}/documents/${type}`;
}

export type ReleasedLotSummary = {
  lotNumber: string;
  releasedOn: string | null;
  retestDate: string | null;
  manufacturerName: string | null;
};

/** Released lots for a product, newest first. Quantities are not included; they are internal. */
export async function listReleasedLotsForProduct(
  productCode: string,
): Promise<ReleasedLotSummary[]> {
  const db = getDb();
  const rows = await db
    .select({
      lotNumber: lots.lotNumber,
      releasedAt: lots.releasedAt,
      retestDate: lots.retestDate,
      manufacturerName: lots.manufacturerName,
    })
    .from(lots)
    .where(
      and(eq(lots.productCode, productCode), publishableLot()),
    )
    .orderBy(desc(lots.releasedAt));
  return rows.map((r) => ({
    lotNumber: r.lotNumber,
    releasedOn: iso(r.releasedAt),
    retestDate: iso(r.retestDate),
    manufacturerName: r.manufacturerName,
  }));
}

/**
 * Public lot search — product name, lot number, or accession number.
 *
 * Three axes, matching what the best archive in this category offers. The
 * accession axis is the important one: it is the analytical lab's reference,
 * so a customer holding a certificate can confirm it resolves here, and can
 * take that same number to the lab.
 *
 * Released lots only, and the same fields the single-lot lookup returns —
 * never quantities, never movements, never who released it.
 */
/** Lot numbers a stranger may discover. Composes publishableLot(), so nothing quarantined, held, rejected, withdrawn or superseded is listed. */
export async function listPublishableLotNumbers(): Promise<string[]> {
  const rows = await getDb()
    .select({ lotNumber: lots.lotNumber })
    .from(lots)
    .where(publishableLot())
    .orderBy(desc(lots.releasedAt));
  return rows.map((r) => r.lotNumber);
}

export type LotSearchHit = {
  lotNumber: string;
  productCode: string;
  productName: string;
  casNumber: string;
  accessionNumber: string | null;
  analyticalLab: string | null;
  purityResult: string | null;
  releasedOn: string | null;
};

export const LOT_SEARCH_LIMIT = 25;

export async function searchReleasedLots(
  query: string,
): Promise<LotSearchHit[]> {
  const term = query.trim();
  if (term.length < 2) return [];

  // Escape LIKE wildcards so a user cannot turn the box into a full scan.
  const escaped = term.replace(/[\\%_]/g, (c) => `\\${c}`);
  const pattern = `%${escaped}%`;
  const db = getDb();

  const rows = await db
    .select({
      lotNumber: lots.lotNumber,
      productCode: lots.productCode,
      productName: lots.productName,
      casNumber: lots.casNumber,
      accessionNumber: lots.accessionNumber,
      analyticalLab: lots.analyticalLab,
      purityResult: lots.purityResult,
      releasedAt: lots.releasedAt,
    })
    .from(lots)
    .where(
      and(
        publishableLot(),
        or(
          sql`upper(${lots.lotNumber}) LIKE upper(${pattern}) ESCAPE '\\'`,
          sql`upper(${lots.productName}) LIKE upper(${pattern}) ESCAPE '\\'`,
          sql`upper(${lots.productCode}) LIKE upper(${pattern}) ESCAPE '\\'`,
          sql`upper(${lots.accessionNumber}) LIKE upper(${pattern}) ESCAPE '\\'`,
        ),
      ),
    )
    .orderBy(desc(lots.releasedAt))
    .limit(LOT_SEARCH_LIMIT);

  return rows.map((r) => ({
    lotNumber: r.lotNumber,
    productCode: r.productCode,
    productName: r.productName,
    casNumber: r.casNumber,
    accessionNumber: r.accessionNumber,
    analyticalLab: r.analyticalLab,
    purityResult: r.purityResult,
    releasedOn: iso(r.releasedAt),
  }));
}
