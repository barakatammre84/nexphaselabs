import { describe, expect, it } from 'vitest';
import { seedProducts } from '@/lib/catalog';
import { formValues, productToValues, valuesToInput } from '@/lib/catalog-form';
import { DEFAULT_PRESENTATION, validateProductInput } from '@/lib/catalog-rules';
import type { CatalogProduct } from '@/lib/catalog-data';

function asCatalogProduct(i: number): CatalogProduct {
  const p = seedProducts[i];
  return {
    ...p,
    id: `prd_${i}`,
    visibility: 'published',
    withdrawnReason: null,
    sortOrder: 0,
    variants: p.packSizes.map((s, n) => ({
      id: `v${n}`,
      sku: `${p.code}-${s.quantity.replace(' ', '').toUpperCase()}`,
      quantity: s.quantity,
      presentation: DEFAULT_PRESENTATION,
      listPriceCents: null,
      institutionalPriceCents: null,
      active: true,
      sortOrder: n,
    })),
    updatedAt: new Date(0),
    updatedBy: null,
  };
}

describe('catalog form round trip', () => {
  it('product → form values → input validates and preserves the data', () => {
    for (let i = 0; i < seedProducts.length; i++) {
      const product = asCatalogProduct(i);
      const values = productToValues(product);
      const input = valuesToInput(values);
      const result = validateProductInput(input);
      expect(result.ok, product.code).toBe(true);
      if (!result.ok) continue;
      expect(result.value.synonyms).toEqual(product.synonyms);
      expect(result.value.sourceNotes).toEqual(product.sourceNotes);
      expect(result.value.solubility).toEqual(product.solubility);
      expect(result.value.relatedCas).toEqual(product.relatedCas ?? []);
      expect(result.value.variants.map((v) => v.quantity)).toEqual(product.packSizes.map((s) => s.quantity));
      expect(result.value.variants.map((v) => v.sku)).toEqual(product.variants.map((v) => v.sku));
    }
  });

  it('parses FormData including checkboxes and pipe-separated lines', () => {
    const fd = new FormData();
    fd.set('code', 'NPL-009');
    fd.set('solubility', 'DMSO | 10 mg/mL | Cayman 123 | with warming\nWater | 1 mg/mL | MCE 9');
    fd.set('variants', '5 mg\n25 mg | Solid, amber vial');
    fd.set('hasSds', 'on');
    const input = valuesToInput(formValues(fd));
    expect(input.code).toBe('NPL-009');
    expect(input.hasSds).toBe(true);
    expect(input.featured).toBe(false);
    expect(input.solubility).toEqual([
      { solvent: 'DMSO', concentration: '10 mg/mL', source: 'Cayman 123', note: 'with warming' },
      { solvent: 'Water', concentration: '1 mg/mL', source: 'MCE 9', note: undefined },
    ]);
    expect(input.variants).toEqual([
      { quantity: '5 mg', presentation: DEFAULT_PRESENTATION, sortOrder: 0 },
      { quantity: '25 mg', presentation: 'Solid, amber vial', sortOrder: 1 },
    ]);
  });

  it('an empty form fails validation with a full list of problems', () => {
    const result = validateProductInput(valuesToInput(formValues(new FormData())));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.length).toBeGreaterThan(8);
  });
});
