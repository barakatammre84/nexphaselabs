import { describe, expect, it } from 'vitest';
import { describeChanges, validateLotCorrection, type LotIntakeInput } from '@/lib/lot-rules';

const current: LotIntakeInput = {
  lotNumber: 'NPL1-260902-B',
  productCode: 'NPL-001',
  manufacturerName: 'Example Peptide Works',
  manufacturerAddress: '1 Synthesis Way, Shanghai',
  supplierName: null,
  countryOfOrigin: 'China',
  entryNumber: null,
  manufactureDate: '2026-07-01',
  receivedAt: '2026-09-02',
  quantityReceived: '10 g',
  storageLocation: 'Freezer A',
  storageCondition: 'Minus 20 C, desiccated',
  retestDate: '2027-07-01',
};
const now = new Date('2026-09-03T12:00:00Z');

describe('validateLotCorrection', () => {
  it('records only real changes and requires a reason', () => {
    const r = validateLotCorrection(current, { supplierName: 'Acme Distribution', storageLocation: ' Freezer A ' }, 'Supplier omitted at receipt', now);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.changes).toEqual([{ field: 'supplierName', from: null, to: 'Acme Distribution' }]);
      expect(r.value.supplierName).toBe('Acme Distribution');
      expect(describeChanges(r.changes)).toBe('Supplier: — → Acme Distribution');
    }
  });
  it('refuses a correction that changes nothing', () => {
    const r = validateLotCorrection(current, { supplierName: null }, 'reason', now);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/Nothing changed/);
  });
  it('applies the intake rules to the corrected record', () => {
    expect(validateLotCorrection(current, { quantityReceived: 'ten grams' }, 'typo', now).ok).toBe(false);
    expect(validateLotCorrection(current, { receivedAt: '2030-01-01' }, 'typo', now).ok).toBe(false);
    expect(validateLotCorrection(current, { manufacturerAddress: null }, 'typo', now).ok).toBe(false); // name without address
  });
  it('scans the reason for forbidden language', () => {
    const r = validateLotCorrection(current, { supplierName: 'Acme' }, 'Reconstitute with 2 mL bacteriostatic water', now);
    expect(r.ok).toBe(false);
  });
});
