import { describe, expect, it } from 'vitest';
import { formatQuantity, parseQuantity, validateLotIntake, type LotIntakeInput } from '@/lib/lot-rules';

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
