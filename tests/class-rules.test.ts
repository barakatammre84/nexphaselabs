import { describe, expect, it } from 'vitest';
import { validateClassInput } from '@/lib/class-rules';

const base = {
  id: 'peptides',
  name: 'Peptides',
  blurb:
    'Synthetic peptides supplied lyophilised, with sequence and lot-specific analytical data.',
  sortOrder: 10,
  active: true,
};

describe('validateClassInput', () => {
  it('accepts a chemistry class', () => {
    const r = validateClassInput(base);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual(base);
  });
  it('normalises anchor and whitespace and parses order from a string', () => {
    const r = validateClassInput({
      ...base,
      id: ' Metal-Peptide ',
      name: '  Metal-peptide   complexes ',
      sortOrder: '20',
    });
    expect(r.ok).toBe(true);
    if (r.ok)
      expect(r.value).toMatchObject({
        id: 'metal-peptide',
        name: 'Metal-peptide complexes',
        sortOrder: 20,
      });
  });
  it('refuses indication, effect or research-area framing', () => {
    for (const name of [
      'Tissue & repair models',
      'Weight management peptides',
      'Cognitive research compounds',
      'Anti-aging complexes',
      'Healing peptides',
      'Growth factors for recovery',
    ]) {
      const r = validateClassInput({ ...base, id: 'x-class', name });
      expect(r.ok, name).toBe(false);
    }
    expect(
      validateClassInput({
        ...base,
        blurb: 'Peptides studied for wound healing.',
      }).ok,
    ).toBe(false);
  });
  it('does not mistake chemistry vocabulary for indication framing', () => {
    expect(
      validateClassInput({
        ...base,
        id: 'small-molecules',
        name: 'Small molecules',
        blurb:
          'Low-molecular-weight organic compounds supplied as solids, with lot-specific analytical data.',
      }).ok,
    ).toBe(true);
    expect(
      validateClassInput({
        ...base,
        blurb: 'Molecular weight confirmed by mass spectrometry.',
      }).ok,
    ).toBe(true);
  });
  it('refuses bad anchors and orders', () => {
    expect(validateClassInput({ ...base, id: 'Peptides!' }).ok).toBe(false);
    expect(validateClassInput({ ...base, id: 'a' }).ok).toBe(false);
    expect(validateClassInput({ ...base, sortOrder: -1 }).ok).toBe(false);
    expect(validateClassInput({ ...base, sortOrder: 'ten' }).ok).toBe(false);
    expect(validateClassInput({ ...base, name: 'P' }).ok).toBe(false);
  });
  it('runs the forbidden-language scanner on the description', () => {
    const r = validateClassInput({
      ...base,
      blurb: 'Reconstitute with bacteriostatic water before use.',
    });
    expect(r.ok).toBe(false);
  });
});
