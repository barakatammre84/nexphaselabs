import { scanText, type Violation } from '@/lib/catalog-rules';
import { REGULATORY_STATEMENT } from '@/lib/catalog';
import { documentDate } from '@/lib/pdf/layout';

/**
 * What a certificate of analysis says, assembled from the lot record, its
 * test results and the catalog entry for the product.
 *
 * Pure on purpose. The certificate is the document this business is most
 * judged on, and deciding *what it states* is separable from drawing it. The
 * rules here — that a certificate cannot be issued without a manufacturer
 * address, or while a test has no recorded outcome — are testable without
 * rendering a PDF.
 *
 * Nothing in this file invents a value. Every field is either recorded
 * against the lot or shown as not recorded. A certificate that fills a gap
 * with a plausible default is worse than one that admits the gap.
 */

export type CoaLot = {
  lotNumber: string;
  productCode: string;
  productName: string;
  casNumber: string;
  manufacturerName: string | null;
  manufacturerAddress: string | null;
  countryOfOrigin: string | null;
  manufactureDate: Date | null;
  receivedAt: Date | null;
  purityResult: string | null;
  purityMethod: string | null;
  identityConfirmed: boolean;
  identityMethod: string | null;
  waterContent: string | null;
  heavyMetalsSummary: string | null;
  netPeptideContent: string | null;
  appearance: string | null;
  accessionNumber: string | null;
  analyticalLab: string | null;
  testingStandard: string | null;
  storageCondition: string | null;
  retestDate: Date | null;
  status: string;
};

/** The catalog entry, for chemical identity. Absent for a withdrawn product. */
export type CoaProduct = {
  formalName?: string | null;
  sequenceOneLetter?: string | null;
  molecularFormula?: string | null;
  molecularWeight?: string | null;
  saltForm?: string | null;
  form?: string | null;
} | null;

export type CoaTest = {
  testType: string;
  analyte: string | null;
  method: string;
  result: string;
  specification: string | null;
  passed: boolean | null;
  testedAt: Date | null;
};

export type CoaSubject = { lot: CoaLot; product: CoaProduct; tests: CoaTest[] };

export type Field = [label: string, value: string | null];
export type CoaSection = { heading: string; fields: Field[] };

export const TEST_TYPE_LABEL: Record<string, string> = {
  identity: 'Identity',
  purity: 'Purity',
  water: 'Water content',
  endotoxin: 'Bacterial endotoxin',
  heavy_metal: 'Heavy metals',
  residual_solvent: 'Residual solvent',
};

export function testTypeLabel(type: string): string {
  return TEST_TYPE_LABEL[type] ?? type.replace(/_/g, ' ');
}

export function outcomeLabel(passed: boolean | null): string {
  if (passed === true) return 'Pass';
  if (passed === false) return 'Fail';
  return 'Not assessed';
}

/* ------------------------------------------------------------------------ */
/* Issue rules                                                                */
/* ------------------------------------------------------------------------ */

/**
 * Everything that must be true before a certificate may be issued.
 *
 * These are deliberately stricter than the release gate in one respect: the
 * release gate accepts a lot whose test rows have no recorded outcome as long
 * as an identity test passed, but a certificate that lists a result with no
 * pass or fail against it is not a certificate anyone can rely on. If a
 * result is recorded it must be assessed, or removed.
 */
export function coaBlockers(subject: CoaSubject): string[] {
  const { lot, tests } = subject;
  const blockers: string[] = [];

  if (!lot.manufacturerName || !lot.manufacturerAddress) {
    blockers.push(
      'The manufacturer name and address are not recorded. A certificate must give both (16 CCR 1736.9(d)).',
    );
  }
  if (tests.length === 0) {
    blockers.push('No test results are recorded against this lot.');
  }
  const unassessed = tests.filter((t) => t.passed === null);
  if (unassessed.length > 0) {
    const names = [...new Set(unassessed.map((t) => testTypeLabel(t.testType)))].join(', ');
    blockers.push(
      `${unassessed.length} result${unassessed.length === 1 ? ' has' : 's have'} no pass or fail recorded (${names}). Assess or remove ${unassessed.length === 1 ? 'it' : 'them'} before issuing.`,
    );
  }
  if (!lot.purityResult) {
    blockers.push('No purity result is recorded.');
  }
  if (!lot.identityConfirmed) {
    blockers.push('Identity is not confirmed on the lot record.');
  }
  if (lot.status === 'rejected' || lot.status === 'withdrawn') {
    blockers.push(`This lot is ${lot.status}. A certificate cannot be issued for it.`);
  }
  return blockers;
}

/**
 * Run the forbidden-language scanner over every free-text value that reaches
 * the certificate. The certificate travels to the customer and is quoted back
 * in disputes; it is public-facing text and is held to the catalog's rules.
 */
export function scanCoa(subject: CoaSubject): Violation[] {
  const { lot, tests } = subject;
  const fields: [string, string | null][] = [
    ['Product name', lot.productName],
    ['Appearance', lot.appearance],
    ['Storage condition', lot.storageCondition],
    ['Purity method', lot.purityMethod],
    ['Identity method', lot.identityMethod],
    ['Water content', lot.waterContent],
    ['Heavy metals', lot.heavyMetalsSummary],
    ['Net peptide content', lot.netPeptideContent],
    ['Testing standard', lot.testingStandard],
    ['Analytical laboratory', lot.analyticalLab],
    ['Manufacturer', lot.manufacturerName],
    ['Manufacturer address', lot.manufacturerAddress],
    ['Country of origin', lot.countryOfOrigin],
    ...tests.flatMap((t, i): [string, string | null][] => {
      const where = `Result ${i + 1} (${testTypeLabel(t.testType)})`;
      return [
        [`${where} analyte`, t.analyte],
        [`${where} method`, t.method],
        [`${where} result`, t.result],
        [`${where} specification`, t.specification],
      ];
    }),
  ];
  return fields.flatMap(([field, value]) => scanText(field, value));
}

/* ------------------------------------------------------------------------ */
/* Content                                                                    */
/* ------------------------------------------------------------------------ */

export type CoaResultRow = {
  test: string;
  method: string;
  specification: string;
  result: string;
  outcome: string;
};

export type CoaContent = {
  /** Printed under the title. */
  subtitle: string;
  identity: CoaSection;
  provenance: CoaSection;
  results: CoaResultRow[];
  summary: CoaSection;
  handling: CoaSection;
  statement: string;
  /** Shown when the lot is not released, so a draft cannot pass for a final. */
  draftNotice: string | null;
};

const dash = (value: string | null | undefined): string | null =>
  value == null || String(value).trim() === '' ? null : String(value);

export function buildCoaContent(subject: CoaSubject): CoaContent {
  const { lot, product, tests } = subject;

  const identity: CoaSection = {
    heading: 'Identity',
    fields: [
      ['Product', lot.productName],
      ['Catalog number', lot.productCode],
      ['Chemical name', dash(product?.formalName ?? null)],
      ['CAS number', dash(lot.casNumber)],
      ['Sequence', dash(product?.sequenceOneLetter ?? null)],
      ['Molecular formula', dash(product?.molecularFormula ?? null)],
      ['Molecular weight', dash(product?.molecularWeight ?? null)],
      ['Salt or counter-ion', dash(product?.saltForm ?? null)],
      ['Physical form', dash(lot.appearance ?? product?.form ?? null)],
    ],
  };

  const provenance: CoaSection = {
    heading: 'Manufacture and provenance',
    fields: [
      ['Lot number', lot.lotNumber],
      ['Manufacturer', dash(lot.manufacturerName)],
      ['Manufacturer address', dash(lot.manufacturerAddress)],
      ['Country of origin', dash(lot.countryOfOrigin)],
      ['Date of manufacture', lot.manufactureDate ? documentDate(lot.manufactureDate) : null],
      ['Date received', lot.receivedAt ? documentDate(lot.receivedAt) : null],
    ],
  };

  const results: CoaResultRow[] = tests.map((test) => ({
    test: test.analyte
      ? `${testTypeLabel(test.testType)} — ${test.analyte}`
      : testTypeLabel(test.testType),
    method: test.method,
    specification: test.specification ?? '—',
    result: test.result,
    outcome: outcomeLabel(test.passed),
  }));

  const summary: CoaSection = {
    heading: 'Summary of analysis',
    fields: [
      ['Purity', dash(lot.purityResult)],
      ['Purity method', dash(lot.purityMethod)],
      ['Identity confirmed', lot.identityConfirmed ? 'Yes' : 'No'],
      ['Identity method', dash(lot.identityMethod)],
      ['Net peptide content', dash(lot.netPeptideContent)],
      ['Water content', dash(lot.waterContent)],
      ['Heavy metals', dash(lot.heavyMetalsSummary)],
      ['Testing standard', dash(lot.testingStandard)],
      ['Analytical laboratory', dash(lot.analyticalLab)],
      ['Laboratory accession number', dash(lot.accessionNumber)],
    ],
  };

  const handling: CoaSection = {
    heading: 'Storage and retest',
    fields: [
      ['Storage condition', dash(lot.storageCondition)],
      ['Retest date', lot.retestDate ? documentDate(lot.retestDate) : null],
    ],
  };

  return {
    subtitle: `Lot ${lot.lotNumber} · ${lot.productCode}`,
    identity,
    provenance,
    results,
    summary,
    handling,
    statement: REGULATORY_STATEMENT,
    draftNotice:
      lot.status === 'released'
        ? null
        : `This lot is ${lot.status.replace(/_/g, ' ')} and has not been released for supply.`,
  };
}

/* ------------------------------------------------------------------------ */
/* Numbering                                                                  */
/* ------------------------------------------------------------------------ */

/**
 * `COA-<lot>` for the first certificate, `COA-<lot>-R1` for the first
 * reissue, and so on. The revision is visible on the document because a
 * customer holding an earlier copy needs to be able to tell that theirs has
 * been replaced.
 */
export function coaNumber(lotNumber: string, revision: number): string {
  const lot = lotNumber.trim().toUpperCase();
  return revision <= 1 ? `COA-${lot}` : `COA-${lot}-R${revision - 1}`;
}

/** The series key `claimSequence` uses for a lot's certificates. */
export function coaSequenceKey(lotNumber: string): string {
  return `coa:${lotNumber.trim().toUpperCase()}`;
}
