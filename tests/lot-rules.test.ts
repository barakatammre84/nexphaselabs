import { describe, expect, it } from 'vitest';
import {
  formatQuantity,
  lotNumberFromParam,
  parseQuantity,
  releaseBlockers,
  validateDisposition,
  validateLotIntake,
  validateLotTest,
  type LotIntakeInput,
  type ReleaseSubject,
} from '@/lib/lot-rules';

describe('release gate', () => {
  const ready: ReleaseSubject = {
    status: 'quarantine',
    manufacturerName: 'Maker',
    manufacturerAddress: '1 Road',
    coaKey: 'lots/X/coa/a.pdf',
    identityConfirmed: true,
    purityResult: '98.7%',
    quantityRemaining: '10 g',
  };
  const tests = [
    { testType: 'identity', passed: true },
    { testType: 'purity', passed: true },
  ];

  it('has no blockers when everything is in place', () => {
    expect(releaseBlockers(ready, tests)).toEqual([]);
  });

  it('blocks on each missing condition', () => {
    expect(releaseBlockers({ ...ready, manufacturerAddress: null }, tests)[0]).toMatch(/Manufacturer/);
    expect(releaseBlockers({ ...ready, coaKey: null }, tests)[0]).toMatch(/certificate/);
    expect(releaseBlockers({ ...ready, identityConfirmed: false }, tests)[0]).toMatch(/Identity/);
    expect(releaseBlockers(ready, [{ testType: 'purity', passed: true }])[0]).toMatch(/Identity/);
    expect(releaseBlockers({ ...ready, purityResult: null }, tests)[0]).toMatch(/purity/);
    expect(releaseBlockers(ready, [...tests, { testType: 'water', passed: false }])[0]).toMatch(/failed/);
    expect(releaseBlockers({ ...ready, quantityRemaining: '0 g' }, tests)[0]).toMatch(/quantity/);
    expect(releaseBlockers({ ...ready, quantityRemaining: null }, tests)[0]).toMatch(/quantity/);
  });

  it('validates decisions against the current status', () => {
    expect(validateDisposition({ decision: 'release' }, 'quarantine').ok).toBe(true);
    expect(validateDisposition({ decision: 'release' }, 'released').ok).toBe(false);
    expect(validateDisposition({ decision: 'hold' }, 'quarantine').ok).toBe(false); // reason required
    expect(validateDisposition({ decision: 'hold', reason: 'Awaiting retest' }, 'released').ok).toBe(true);
    expect(validateDisposition({ decision: 'withdraw', reason: 'Recall' }, 'quarantine').ok).toBe(false);
    expect(validateDisposition({ decision: 'withdraw', reason: 'Recall' }, 'released').ok).toBe(true);
    expect(validateDisposition({ decision: 'release' }, 'rejected').ok).toBe(false);
    expect(validateDisposition({ decision: 'destroy' }, 'quarantine').ok).toBe(false);
    expect(validateDisposition({ decision: 'reject', reason: 'Not effective for weight loss' }, 'quarantine').ok).toBe(false);
  });
});

describe('validateLotTest', () => {
  const good = { testType: 'purity', method: 'RP-HPLC, 220 nm', result: '98.7%', specification: '>= 95%', passed: 'pass', testedAt: '2026-09-01' };

  it('accepts a complete purity result', () => {
    const r = validateLotTest(good, new Date('2026-09-02'));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toMatchObject({ testType: 'purity', passed: true, analyte: null });
  });

  it('requires method, result, a known type, and a spec when judged', () => {
    expect(validateLotTest({ ...good, method: '' }).ok).toBe(false);
    expect(validateLotTest({ ...good, result: '' }).ok).toBe(false);
    expect(validateLotTest({ ...good, testType: 'potency' }).ok).toBe(false);
    expect(validateLotTest({ ...good, specification: '' }).ok).toBe(false);
    expect(validateLotTest({ ...good, specification: '', passed: '' }).ok).toBe(true);
    expect(validateLotTest({ ...good, passed: 'maybe' }).ok).toBe(false);
  });

  it('requires an analyte for heavy metals and residual solvents', () => {
    expect(validateLotTest({ ...good, testType: 'heavy_metal' }).ok).toBe(false);
    expect(validateLotTest({ ...good, testType: 'heavy_metal', analyte: 'Lead', result: '< 0.5 ppm', specification: '<= 10 ppm' }).ok).toBe(true);
  });

  it('rejects future dates and forbidden language', () => {
    expect(validateLotTest({ ...good, testedAt: '2030-01-01' }, new Date('2026-09-02')).ok).toBe(false);
    const r = validateLotTest({ ...good, result: 'Effective for weight loss' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violations[0]?.field).toBe('result');
  });
});

describe('lotNumberFromParam', () => {
  it('normalises well-formed values and rejects the rest', () => {
    expect(lotNumberFromParam('npl1-260902-b')).toBe('NPL1-260902-B');
    expect(lotNumberFromParam('NPL1%2D260902%2DB')).toBe('NPL1-260902-B');
    expect(lotNumberFromParam('%E0%A4%A')).toBeNull();
    expect(lotNumberFromParam('a b')).toBeNull();
    expect(lotNumberFromParam('../etc')).toBeNull();
  });
});

const base: LotIntakeInput = {
  lotNumber: 'npl1-260901-a',
  productCode: 'npl-001',
  manufacturerName: 'Example Peptide Manufacturing Co.',
  manufacturerAddress: '1 Example Road, Example City',
  supplierName: 'Example Distribution LLC',
  countryOfOrigin: 'United States',
  receivedAt: '2026-09-01',
  quantityReceived: '25 g',
  storageLocation: 'Freezer A2',
  storageCondition: 'Minus 20 C, desiccated',
  note: 'Seals intact.',
};

describe('quantities', () => {
  it('parses number + unit and normalises', () => {
    expect(parseQuantity('25 g')).toEqual({ amount: 25, unit: 'g' });
    expect(parseQuantity('40vials')).toEqual({ amount: 40, unit: 'vials' });
    expect(parseQuantity('2.5 kg')).toEqual({ amount: 2.5, unit: 'kg' });
    expect(parseQuantity('25')).toBeNull();
    expect(parseQuantity('25 mL')).toBeNull();
    expect(formatQuantity(2.5, 'kg')).toBe('2.5 kg');
    expect(formatQuantity(40, 'vials')).toBe('40 vials');
  });
});

describe('validateLotIntake', () => {
  it('accepts a complete intake and normalises case', () => {
    const r = validateLotIntake(base, new Date('2026-09-02T12:00:00Z'));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.lotNumber).toBe('NPL1-260901-A');
      expect(r.value.productCode).toBe('NPL-001');
      expect(r.value.receivedAtDate.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    }
  });

  it('accepts intake without manufacturer (required only at release)', () => {
    const r = validateLotIntake({ ...base, manufacturerName: '', manufacturerAddress: '' });
    expect(r.ok).toBe(true);
  });

  it('rejects half a manufacturer record', () => {
    const r = validateLotIntake({ ...base, manufacturerAddress: '' });
    expect(r.ok).toBe(false);
  });

  it('rejects bad lot numbers, quantities, dates and future receipts', () => {
    expect(validateLotIntake({ ...base, lotNumber: 'a b' }).ok).toBe(false);
    expect(validateLotIntake({ ...base, quantityReceived: '25 mL' }).ok).toBe(false);
    expect(validateLotIntake({ ...base, quantityReceived: '0 g' }).ok).toBe(false);
    expect(validateLotIntake({ ...base, quantityReceived: '1.5 ug' }).ok).toBe(false);
    expect(validateLotIntake({ ...base, quantityReceived: '0.0005 mg' }).ok).toBe(false);
    expect(validateLotIntake({ ...base, quantityReceived: '0.001 mg' }).ok).toBe(true);
    expect(validateLotIntake({ ...base, quantityReceived: '9.985 g' }).ok).toBe(true);
    expect(validateLotIntake({ ...base, quantityReceived: '0.999999999 kg' }).ok).toBe(true);
    // Counted stock must say what one container holds: it is the only pack size the lot can supply.
    expect(validateLotIntake({ ...base, quantityReceived: '40 vials' }).ok).toBe(false);
    expect(validateLotIntake({ ...base, quantityReceived: '40 vials', containerSize: '50 mg' }).ok).toBe(true);
    expect(validateLotIntake({ ...base, quantityReceived: '40 vials', containerSize: '3 mL' }).ok).toBe(false);
    expect(validateLotIntake({ ...base, quantityReceived: '10 mg', containerSize: '50 mg' }).ok).toBe(false);
    expect(validateLotIntake({ ...base, receivedAt: '' }).ok).toBe(false);
    expect(validateLotIntake({ ...base, receivedAt: '2026-02-30' }).ok).toBe(false);
    expect(validateLotIntake({ ...base, receivedAt: '2030-01-01' }, new Date('2026-09-02')).ok).toBe(false);
    expect(validateLotIntake({ ...base, manufactureDate: '2026-12-01' }).ok).toBe(false);
    expect(validateLotIntake({ ...base, retestDate: '2026-08-01' }).ok).toBe(false);
    expect(validateLotIntake({ ...base, retestDate: '2028-09-01' }).ok).toBe(true);
  });

  it('scans public-facing text for forbidden language', () => {
    const r = validateLotIntake({ ...base, storageCondition: 'Reconstitute with 2 mL before use' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violations[0]?.field).toBe('storageCondition');
  });
});

describe('quantity normalisation', () => {
  it('keeps whole micrograms exactly and refuses finer', async () => {
    const { finerThanMicrogram, normalizeQuantity } = await import('@/lib/lot-rules');
    expect(normalizeQuantity(1.0001, 'g')).toBe('1000.1 mg');
    expect(normalizeQuantity(0.00015, 'kg')).toBe('0.15 g');
    expect(normalizeQuantity(25, 'g')).toBe('25 g');
    expect(normalizeQuantity(5000, 'mg')).toBe('5000 mg');
    expect(normalizeQuantity(0.0000005, 'g')).toBe('0.001 mg');
    expect(normalizeQuantity(40, 'vials')).toBe('40 vials');
    expect(finerThanMicrogram(0.0000005, 'g')).toBe(true);
    expect(finerThanMicrogram(1.0001, 'g')).toBe(false);
    expect(finerThanMicrogram(0.5, 'ug')).toBe(true);
    expect(finerThanMicrogram(3, 'vials')).toBe(false);
  });
});
