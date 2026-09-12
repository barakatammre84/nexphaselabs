import { describe, expect, it } from 'vitest';
import { parsePriceCents, validateProductInput } from '@/lib/catalog-rules';
import { formValues, valuesToInput } from '@/lib/catalog-form';
import { seedProducts } from '@/lib/catalog';
import { formatCents, priceFor, visibilityFor } from '@/lib/visibility-rules';

describe('visibilityFor', () => {
  it('shows nothing to anonymous visitors', () => {
    expect(visibilityFor(null, false)).toMatchObject({ pricing: 'none', availability: false, reason: 'anonymous' });
  });
  it('shows institutional pricing only to approved organisations with current acknowledgements', () => {
    const base = { tier: 'institutional' as const, verificationStatus: 'approved', acknowledgementsCurrent: true };
    expect(visibilityFor(base, false)).toMatchObject({ pricing: 'institutional', availability: true, reason: null });
    expect(visibilityFor({ ...base, verificationStatus: 'submitted' }, false)).toMatchObject({ pricing: 'none', reason: 'unverified' });
    expect(visibilityFor({ ...base, verificationStatus: 'none' }, false)).toMatchObject({ pricing: 'none', reason: 'unverified' });
    expect(visibilityFor({ ...base, acknowledgementsCurrent: false }, false)).toMatchObject({ pricing: 'none', reason: 'acknowledgement' });
  });
  it('shows consumer pricing only while the owner enables the tier', () => {
    const c = { tier: 'researcher' as const, verificationStatus: 'none', acknowledgementsCurrent: true };
    expect(visibilityFor(c, false)).toMatchObject({ pricing: 'none', reason: 'researcher_tier_closed' });
    expect(visibilityFor(c, true)).toMatchObject({ pricing: 'researcher', availability: true });
  });
  it('picks the right price column', () => {
    const v = { listPriceCents: 6000, institutionalPriceCents: 4500 };
    expect(priceFor(v, 'institutional')).toBe(4500);
    expect(priceFor(v, 'researcher')).toBe(6000);
    expect(priceFor(v, 'none')).toBeNull();
    expect(formatCents(4500)).toBe('$45.00');
    expect(formatCents(123456)).toBe('$1,234.56');
  });
});

describe('prices in the catalog form', () => {
  it('parses dollars to cents and rejects malformed amounts', () => {
    expect(parsePriceCents('45')).toBe(4500);
    expect(parsePriceCents('$45.5')).toBe(4550);
    expect(parsePriceCents('')).toBeNull();
    expect(Number.isNaN(parsePriceCents('forty'))).toBe(true);
    expect(Number.isNaN(parsePriceCents('45.123'))).toBe(true);
  });
  it('round-trips a priced pack size line through validation', () => {
    const p = seedProducts[0];
    const fd = new FormData();
    const fields: Record<string, string> = {
      code: p.code, slug: p.slug, name: p.name, formalName: p.formalName, chemicalClass: p.chemicalClass, casNumber: p.casNumber,
      molecularFormula: p.molecularFormula, molecularWeight: p.molecularWeight, purity: p.purity, form: p.form, saltForm: p.saltForm,
      storageSolid: p.storageSolid, storageStock: p.storageStock, stability: p.stability, shipping: p.shipping, status: p.status,
      description: p.description, sourceNotes: p.sourceNotes.join('\n'), visibility: 'published',
      variants: '5 mg | Solid, sealed vial | 60 | 45.00\n10 mg | | | 80',
    };
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    const r = validateProductInput(valuesToInput(formValues(fd)));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.variants[0]).toMatchObject({ sku: 'NPL-001-5MG', listPriceCents: 6000, institutionalPriceCents: 4500 });
      expect(r.value.variants[1]).toMatchObject({ sku: 'NPL-001-10MG', listPriceCents: null, institutionalPriceCents: 8000 });
    }
    fd.set('variants', '5 mg | Solid, sealed vial | free');
    expect(validateProductInput(valuesToInput(formValues(fd))).ok).toBe(false);
  });
});
