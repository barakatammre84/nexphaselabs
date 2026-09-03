import { describe, expect, it } from 'vitest';
import { formatPoNumber, landedCostByLine, poNumberFromParam, validatePurchaseOrder, validateSupplier } from '@/lib/procurement-rules';

describe('validateSupplier', () => {
  it('normalises and accepts a supplier', () => {
    const r = validateSupplier({ name: '  Example  Peptide Works ', website: 'examplepeptide.example', contactEmail: 'QC@Example.Example', country: 'China' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toMatchObject({ name: 'Example Peptide Works', website: 'https://examplepeptide.example', contactEmail: 'QC@Example.Example', country: 'China', address: null });
  });
  it('refuses bad names, emails and websites', () => {
    expect(validateSupplier({ name: 'A' }).ok).toBe(false);
    expect(validateSupplier({ name: 'Acme', contactEmail: 'nope' }).ok).toBe(false);
    expect(validateSupplier({ name: 'Acme', website: 'not a url' }).ok).toBe(false);
  });
  it('scans the name but leaves internal notes alone', () => {
    expect(validateSupplier({ name: 'Acme Weight Loss Peptides' }).ok).toBe(false);
    expect(validateSupplier({ name: 'Acme', notes: 'Reviewed ISO certificate and three reference COAs; results on file.' }).ok).toBe(true);
  });
});

describe('validatePurchaseOrder', () => {
  const base = { supplierId: 'sup_0123456789abcdef', orderedOn: '2026-09-01', expectedOn: '2026-09-20', freight: '120', duty: '45.50', lines: [{ productCode: 'npl-001', quantity: '25 g', lineCost: '1200.00' }] };
  it('accepts a well-formed order', () => {
    const r = validatePurchaseOrder(base);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.freightCents).toBe(12000);
      expect(r.value.dutyCents).toBe(4550);
      expect(r.value.lines[0]).toEqual({ productCode: 'NPL-001', quantity: '25 g', lineCostCents: 120000 });
    }
  });
  it('normalises line quantities exactly and refuses sub-microgram ones', () => {
    const r = validatePurchaseOrder({ ...base, lines: [{ productCode: 'NPL-001', quantity: '1.0001 g', lineCost: '10' }] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.lines[0].quantity).toBe('1000.1 mg');
    expect(validatePurchaseOrder({ ...base, lines: [{ productCode: 'NPL-001', quantity: '0.0000005 g', lineCost: '10' }] }).ok).toBe(false);
  });
  it('ignores blank rows and refuses bad ones', () => {
    const r = validatePurchaseOrder({ ...base, lines: [...base.lines, { productCode: '', quantity: '', lineCost: '' }] });
    expect(r.ok).toBe(true);
    expect(validatePurchaseOrder({ ...base, lines: [{ productCode: 'NPL-001', quantity: 'lots', lineCost: '1' }] }).ok).toBe(false);
    expect(validatePurchaseOrder({ ...base, lines: [] }).ok).toBe(false);
    expect(validatePurchaseOrder({ ...base, lines: [{ productCode: 'NPL-001', quantity: '25 g', lineCost: 'twelve' }] }).ok).toBe(false);
    expect(validatePurchaseOrder({ ...base, freight: 'abc' }).ok).toBe(false);
    expect(validatePurchaseOrder({ ...base, expectedOn: '2026-08-01' }).ok).toBe(false);
    expect(validatePurchaseOrder({ ...base, orderedOn: '2026-02-30' }).ok).toBe(false);
    expect(validatePurchaseOrder({ ...base, supplierId: 'x' }).ok).toBe(false);
  });
});

describe('landedCostByLine', () => {
  it('allocates freight and duty by line cost and sums exactly', () => {
    const m = landedCostByLine([{ id: 'a', lineCostCents: 10000 }, { id: 'b', lineCostCents: 20000 }, { id: 'c', lineCostCents: 3 }], 1001, 0);
    const total = [...m.values()].reduce((x, y) => x + y, 0);
    expect(total).toBe(30003 + 1001);
    expect(m.get('b')! > m.get('a')!).toBe(true);
  });
  it('handles zero-cost lines', () => {
    const m = landedCostByLine([{ id: 'a', lineCostCents: 0 }, { id: 'b', lineCostCents: 0 }], 100, 0);
    expect((m.get('a') ?? 0) + (m.get('b') ?? 0)).toBe(100);
  });
});

describe('PO numbers', () => {
  it('formats and parses', () => {
    expect(formatPoNumber(new Date('2026-09-03T12:00:00Z'), 7)).toBe('PO-260903-0007');
    expect(poNumberFromParam('po-260903-0007')).toBe('PO-260903-0007');
    expect(poNumberFromParam('PO-1')).toBeNull();
  });
});
