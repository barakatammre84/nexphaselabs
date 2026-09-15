import { describe, expect, it } from 'vitest';
import {
  buildCoaContent,
  coaBlockers,
  coaNumber,
  coaSequenceKey,
  outcomeLabel,
  scanCoa,
  testTypeLabel,
  type CoaSubject,
  type CoaTest,
} from '@/lib/coa-content';
import { REGULATORY_STATEMENT } from '@/lib/catalog';

const test = (over: Partial<CoaTest> = {}): CoaTest => ({
  testType: 'purity',
  analyte: null,
  method: 'RP-HPLC-UV at 214 nm',
  result: '99.2 percent',
  specification: 'Not less than 98.0 percent',
  passed: true,
  testedAt: new Date('2026-08-20T00:00:00Z'),
  ...over,
});

const subject = (over: Partial<CoaSubject['lot']> = {}, tests?: CoaTest[]): CoaSubject => ({
  lot: {
    lotNumber: 'STG-001',
    productCode: 'NPL-001',
    productName: 'Test compound',
    casNumber: '000-00-0',
    manufacturerName: 'Contract Manufacturer Ltd',
    manufacturerAddress: '1 Example Road, Example City, Country',
    countryOfOrigin: 'China',
    manufactureDate: new Date('2026-06-01T00:00:00Z'),
    receivedAt: new Date('2026-08-01T00:00:00Z'),
    purityResult: '99.2 percent',
    purityMethod: 'RP-HPLC-UV',
    identityConfirmed: true,
    identityMethod: 'ESI-MS',
    waterContent: null,
    heavyMetalsSummary: null,
    netPeptideContent: null,
    appearance: 'White lyophilised powder',
    accessionNumber: 'ACC-55',
    analyticalLab: 'Named Analytical Lab',
    testingStandard: 'USP <621>',
    storageCondition: 'Minus 20 C',
    retestDate: new Date('2028-06-01T00:00:00Z'),
    status: 'released',
    ...over,
  },
  product: {
    formalName: 'Test compound acetate',
    sequenceOneLetter: 'GEGTFTSD',
    molecularFormula: 'C10H20N2O3',
    molecularWeight: '216.28',
    saltForm: 'Acetate',
    form: 'Lyophilised powder',
  },
  tests: tests ?? [test({ testType: 'identity' }), test()],
});

describe('coaBlockers', () => {
  it('passes a complete lot', () => {
    expect(coaBlockers(subject())).toEqual([]);
  });

  it('requires both the manufacturer name and address', () => {
    expect(coaBlockers(subject({ manufacturerAddress: null }))[0]).toContain(
      '16 CCR 1736.9(d)',
    );
    expect(coaBlockers(subject({ manufacturerName: null }))[0]).toContain(
      '16 CCR 1736.9(d)',
    );
  });

  it('refuses to certify a lot with no results at all', () => {
    const blockers = coaBlockers(subject({}, []));
    expect(blockers).toContain('No test results are recorded against this lot.');
  });

  it('refuses to certify while a result has no pass or fail', () => {
    // This is the gap the release gate leaves open: a test row saved with an
    // empty outcome. A certificate must not list an unassessed result.
    const blockers = coaBlockers(subject({}, [test({ passed: null })]));
    expect(blockers.some((b) => b.includes('no pass or fail recorded'))).toBe(true);
    expect(blockers.some((b) => b.includes('Purity'))).toBe(true);
  });

  it('names each distinct unassessed test type once', () => {
    const blockers = coaBlockers(
      subject({}, [
        test({ passed: null }),
        test({ passed: null }),
        test({ testType: 'identity', passed: null }),
      ]),
    );
    const line = blockers.find((b) => b.includes('no pass or fail'))!;
    expect(line).toContain('3 results have');
    expect(line.match(/Purity/g)).toHaveLength(1);
    expect(line).toContain('Identity');
  });

  it('still allows a failing result to be certified', () => {
    // A certificate that records a failure is a legitimate document; it is an
    // unassessed result that is not.
    expect(coaBlockers(subject({}, [test({ passed: false })]))).toEqual([]);
  });

  it('requires a purity result and a confirmed identity', () => {
    expect(coaBlockers(subject({ purityResult: null }))).toContain(
      'No purity result is recorded.',
    );
    expect(coaBlockers(subject({ identityConfirmed: false }))).toContain(
      'Identity is not confirmed on the lot record.',
    );
  });

  it('refuses a rejected or withdrawn lot outright', () => {
    for (const status of ['rejected', 'withdrawn']) {
      expect(coaBlockers(subject({ status })).some((b) => b.includes(status))).toBe(true);
    }
  });

  it('allows a quarantined lot, because the certificate precedes release', () => {
    expect(coaBlockers(subject({ status: 'quarantine' }))).toEqual([]);
  });
});

describe('scanCoa', () => {
  it('passes ordinary analytical text', () => {
    expect(scanCoa(subject())).toEqual([]);
  });

  it('catches forbidden language in a lot field and names the field', () => {
    const violations = scanCoa(subject({ appearance: 'For weight loss in patients' }));
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].field).toBe('Appearance');
  });

  it('catches forbidden language inside a test result and points at the row', () => {
    const violations = scanCoa(
      subject({}, [test({ result: 'Confirmed for treatment of obesity' })]),
    );
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].field).toContain('Result 1');
  });
});

describe('buildCoaContent', () => {
  it('carries the regulatory statement in the body', () => {
    expect(buildCoaContent(subject()).statement).toBe(REGULATORY_STATEMENT);
  });

  it('shows a dash for values that are not recorded rather than inventing them', () => {
    const content = buildCoaContent(subject({ waterContent: null }));
    const water = content.summary.fields.find(([label]) => label === 'Water content');
    expect(water?.[1]).toBeNull();
  });

  it('treats a blank string as not recorded', () => {
    const content = buildCoaContent(subject({ analyticalLab: '   ' }));
    const lab = content.summary.fields.find(([l]) => l === 'Analytical laboratory');
    expect(lab?.[1]).toBeNull();
  });

  it('falls back to the catalog form when the lot has no appearance', () => {
    const content = buildCoaContent(subject({ appearance: null }));
    const form = content.identity.fields.find(([l]) => l === 'Physical form');
    expect(form?.[1]).toBe('Lyophilised powder');
  });

  it('survives a withdrawn product with no catalog entry', () => {
    const s = { ...subject(), product: null };
    const content = buildCoaContent(s);
    expect(content.identity.fields.find(([l]) => l === 'Sequence')?.[1]).toBeNull();
    expect(content.identity.fields.find(([l]) => l === 'Product')?.[1]).toBe('Test compound');
  });

  it('labels a result row with its analyte when there is one', () => {
    const content = buildCoaContent(
      subject({}, [test({ testType: 'heavy_metal', analyte: 'Lead' })]),
    );
    expect(content.results[0].test).toBe('Heavy metals — Lead');
  });

  it('marks a lot that has not been released, so a draft cannot pass for final', () => {
    expect(buildCoaContent(subject({ status: 'quarantine' })).draftNotice).toContain(
      'quarantine',
    );
    expect(buildCoaContent(subject({ status: 'released' })).draftNotice).toBeNull();
  });

  it('spells dates out on the certificate', () => {
    const content = buildCoaContent(subject());
    expect(content.handling.fields.find(([l]) => l === 'Retest date')?.[1]).toBe(
      '1 June 2028',
    );
  });
});

describe('numbering', () => {
  it('gives the first certificate an unsuffixed number', () => {
    expect(coaNumber('stg-001', 1)).toBe('COA-STG-001');
  });

  it('numbers reissues from R1', () => {
    expect(coaNumber('STG-001', 2)).toBe('COA-STG-001-R1');
    expect(coaNumber('STG-001', 5)).toBe('COA-STG-001-R4');
  });

  it('keys the series per lot', () => {
    expect(coaSequenceKey(' stg-001 ')).toBe('coa:STG-001');
  });
});

describe('labels', () => {
  it('humanises unknown test types instead of printing the raw key', () => {
    expect(testTypeLabel('residual_solvent')).toBe('Residual solvent');
    expect(testTypeLabel('some_new_assay')).toBe('some new assay');
  });

  it('distinguishes not assessed from fail', () => {
    expect(outcomeLabel(true)).toBe('Pass');
    expect(outcomeLabel(false)).toBe('Fail');
    expect(outcomeLabel(null)).toBe('Not assessed');
  });
});

describe('results that never leave the staff system', () => {
  const endotoxin = test({
    testType: 'endotoxin',
    method: 'LAL kinetic chromogenic',
    result: 'Below 1 EU/mg',
    specification: null,
    passed: null,
  });

  it('keeps an endotoxin result off the certificate', () => {
    const content = buildCoaContent(subject({}, [test({ testType: 'identity' }), test(), endotoxin]));
    expect(content.results).toHaveLength(2);
    expect(content.results.map((row) => row.test).join(' ')).not.toMatch(/endotoxin/i);
  });

  it('does not let an unpublished result block or pass a certificate', () => {
    expect(coaBlockers(subject({}, [test({ testType: 'identity' }), test(), endotoxin]))).toEqual([]);
    expect(coaBlockers(subject({}, [endotoxin]))).toContain('No test results are recorded against this lot.');
  });
});
