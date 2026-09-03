import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { lotTests, lots, type Lot } from '@/db/schema';
import type { DocumentType } from '@/lib/documents';

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
  const [lot] = await db.select().from(lots).where(eq(lots.lotNumber, lotNumber)).limit(1);
  if (!lot || lot.status !== 'released') return null;
  return lot;
}

export async function getPublicLot(lotNumber: string): Promise<PublicLot | null> {
  const lot = await getReleasedLot(lotNumber);
  if (!lot) return null;
  const db = getDb();
  const tests = await db.select().from(lotTests).where(eq(lotTests.lotId, lot.id));

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
  if (lot.status !== 'released') return null;
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

export function publicDocumentPath(lotNumber: string, type: DocumentType): string {
  return `/api/lots/${encodeURIComponent(lotNumber)}/documents/${type}`;
}
