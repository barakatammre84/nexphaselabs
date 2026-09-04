import { describe, expect, it } from 'vitest';
import {
  LABEL_USE_STATEMENT,
  buildLabelContent,
  formatStatement,
  isPictogramCode,
  labelBlockers,
  labelNumber,
  labelSequenceKey,
  parseStatement,
  validateHazard,
  type HazardInput,
  type LabelSubject,
} from '@/lib/hazard';

const input = (over: Partial<HazardInput> = {}): HazardInput => ({
  signalWord: 'warning',
  pictograms: ['GHS07'],
  hazardStatements: ['H315 Causes skin irritation.'],
  precautionaryStatements: ['P264 Wash hands thoroughly after handling.'],
  classification: ['Skin irritation, Category 2'],
  source: 'Cayman Chemical safety data sheet 16077, revised 2025-11-02',
  dissent: null,
  reviewedBy: 'Grace QC',
  reviewedAt: '2026-09-04',
  ...over,
});

describe('parseStatement', () => {
  it('splits a code from its text', () => {
    expect(parseStatement('H315 Causes skin irritation.')).toEqual({
      code: 'H315',
      text: 'Causes skin irritation.',
    });
  });

  it('handles a combined P-code', () => {
    expect(parseStatement('P305+P351+P338 Rinse cautiously.')?.code).toBe('P305+P351+P338');
  });

  it('rejects a code with no text', () => {
    expect(parseStatement('H315')).toBeNull();
    expect(parseStatement('   ')).toBeNull();
  });

  it('round-trips through formatStatement', () => {
    const statement = parseStatement('H302 Harmful if swallowed.')!;
    expect(formatStatement(statement)).toBe('H302 Harmful if swallowed.');
  });
});

describe('validateHazard', () => {
  it('accepts a complete classification', () => {
    const result = validateHazard(input());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.signalWord).toBe('warning');
      expect(result.value.hazardStatements[0].code).toBe('H315');
    }
  });

  it('requires a source, because every figure here is attributable', () => {
    const result = validateHazard(input({ source: '  ' }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes('where this classification came from'))).toBe(true);
    }
  });

  it('requires who reviewed it and when', () => {
    const result = validateHazard(input({ reviewedBy: '', reviewedAt: '4 Sept' }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes('who reviewed'))).toBe(true);
      expect(result.errors.some((e) => e.includes('YYYY-MM-DD'))).toBe(true);
    }
  });

  it('rejects a pictogram code that is not GHS01 to GHS09', () => {
    const result = validateHazard(input({ pictograms: ['GHS12'] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.includes('GHS12'))).toBe(true);
  });

  it('drops a repeated pictogram rather than printing it twice', () => {
    const result = validateHazard(input({ pictograms: ['GHS07', 'ghs07'] }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.pictograms).toEqual(['GHS07']);
  });

  it('rejects a hazard statement that is not an H-code', () => {
    const result = validateHazard(input({ hazardStatements: ['P264 Wash hands.'] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.includes('not an H-code'))).toBe(true);
  });

  it('rejects a precautionary statement that is not a P-code', () => {
    const result = validateHazard(input({ precautionaryStatements: ['H315 Causes irritation.'] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.includes('not a P-code'))).toBe(true);
  });

  it('refuses a signal word with nothing to qualify it', () => {
    const result = validateHazard(input({ hazardStatements: [] }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes('at least one hazard statement'))).toBe(true);
    }
  });

  it('records "not hazardous" as a finding, with a source', () => {
    // A material found not to be hazardous is a decision somebody made, not
    // an empty field — but it cannot then carry pictograms or hazards.
    const result = validateHazard(
      input({
        signalWord: 'none',
        pictograms: [],
        hazardStatements: [],
        precautionaryStatements: [],
        source: 'MilliporeSigma SDS N8285: not a hazardous substance or mixture',
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.signalWord).toBe('none');
  });

  it('refuses an incoherent label: no signal word but hazards stated', () => {
    const result = validateHazard(input({ signalWord: 'none' }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes('cannot carry pictograms'))).toBe(true);
      expect(result.errors.some((e) => e.includes('cannot carry hazard statements'))).toBe(true);
    }
  });

  it('keeps a supplier disagreement rather than resolving it', () => {
    const result = validateHazard(
      input({ dissent: 'Cayman 16077 assigns GHS07 Warning with H315, H319 and H335.' }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.dissent).toContain('Cayman');
  });

  it('runs the forbidden-language scanner over what reaches the label', () => {
    const result = validateHazard(
      input({ classification: ['Recommended for treating obesity in patients'] }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.violations.length).toBeGreaterThan(0);
  });

  it('rejects an unknown signal word', () => {
    const result = validateHazard(input({ signalWord: 'caution' }));
    expect(result.ok).toBe(false);
  });
});

describe('isPictogramCode', () => {
  it('accepts the nine codes and nothing else', () => {
    expect(isPictogramCode('GHS01')).toBe(true);
    expect(isPictogramCode('GHS09')).toBe(true);
    expect(isPictogramCode('GHS10')).toBe(false);
    expect(isPictogramCode('ghs07')).toBe(false);
  });
});

const subject = (over: Partial<LabelSubject> = {}): LabelSubject => ({
  productCode: 'NPL-001',
  productName: 'BPC-157',
  casNumber: '137525-51-0',
  lotNumber: 'CERT-001',
  packSize: '5 mg',
  hazard: (validateHazard(input()) as { ok: true; value: never }).value,
  responsibleParty: {
    name: 'NexPhase Labs · 8486 Ventures LLC',
    address: '1 Example Street, Oakland, CA',
    telephone: '+1 555 0100',
  },
  artworkAvailable: ['GHS07'],
  ...over,
});

describe('labelBlockers', () => {
  it('passes a classified product with artwork and a contactable party', () => {
    expect(labelBlockers(subject())).toEqual([]);
  });

  it('refuses an unclassified product', () => {
    expect(labelBlockers(subject({ hazard: null }))[0]).toContain('no hazard classification');
  });

  it('refuses without the responsible party address', () => {
    const blockers = labelBlockers(
      subject({
        responsibleParty: { name: 'x', address: null, telephone: '+1 555 0100' },
      }),
    );
    expect(blockers.some((b) => b.includes('1910.1200(f)(1)(v)'))).toBe(true);
  });

  it('refuses without a telephone number', () => {
    const blockers = labelBlockers(
      subject({
        responsibleParty: { name: 'x', address: 'somewhere', telephone: null },
      }),
    );
    expect(blockers.some((b) => b.includes('telephone'))).toBe(true);
  });

  it('refuses when prescribed pictogram artwork is missing', () => {
    // An empty red diamond is not a pictogram.
    const blockers = labelBlockers(subject({ artworkAvailable: [] }));
    expect(blockers.some((b) => b.includes('GHS07'))).toBe(true);
  });

  it('needs no artwork for a product carrying no pictograms', () => {
    const none = validateHazard(
      input({
        signalWord: 'none',
        pictograms: [],
        hazardStatements: [],
        precautionaryStatements: [],
      }),
    );
    expect(none.ok).toBe(true);
    if (none.ok) {
      expect(labelBlockers(subject({ hazard: none.value, artworkAvailable: [] }))).toEqual([]);
    }
  });
});

describe('buildLabelContent', () => {
  it('states the product identifier, lot and the research-use condition', () => {
    const content = buildLabelContent(subject());
    expect(content.productIdentifier).toBe('BPC-157 (NPL-001)');
    expect(content.lotNumber).toBe('CERT-001');
    expect(content.useStatement).toBe(LABEL_USE_STATEMENT);
  });

  it('carries the responsible party on the label, dropping lines with no value', () => {
    const content = buildLabelContent(
      subject({
        responsibleParty: { name: 'NexPhase Labs', address: 'Oakland, CA', telephone: null },
      }),
    );
    expect(content.responsible).toEqual(['NexPhase Labs', 'Oakland, CA']);
  });

  it('formats statements back to code-then-text for printing', () => {
    expect(buildLabelContent(subject()).hazardStatements[0]).toBe(
      'H315 Causes skin irritation.',
    );
  });
});

describe('label numbering', () => {
  it('numbers labels for reference without archiving them', () => {
    expect(labelNumber('cert-001', 1)).toBe('GHS-CERT-001');
    expect(labelNumber('CERT-001', 3)).toBe('GHS-CERT-001-R2');
    expect(labelSequenceKey(' cert-001 ')).toBe('ghs_label:CERT-001');
  });
});
