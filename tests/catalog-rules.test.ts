import { describe, expect, it } from 'vitest';
import { products, type Product } from '@/lib/catalog';
import {
  DEFAULT_PRESENTATION,
  isLabSolvent,
  isValidCas,
  scanText,
  skuFor,
  validateProductInput,
  type ProductInput,
} from '@/lib/catalog-rules';

function toInput(p: Product): ProductInput {
  return {
    code: p.code,
    slug: p.slug,
    name: p.name,
    formalName: p.formalName,
    synonyms: p.synonyms,
    chemicalClass: p.chemicalClass,
    casNumber: p.casNumber,
    relatedCas: p.relatedCas ?? [],
    sequenceOneLetter: p.sequenceOneLetter,
    sequenceThreeLetter: p.sequenceThreeLetter,
    molecularFormula: p.molecularFormula,
    molecularWeight: p.molecularWeight,
    exactMass: p.exactMass,
    smiles: p.smiles,
    inchiKey: p.inchiKey,
    pubchemCid: p.pubchemCid,
    purity: p.purity,
    form: p.form,
    saltForm: p.saltForm,
    solubility: p.solubility,
    storageSolid: p.storageSolid,
    storageStock: p.storageStock,
    stability: p.stability,
    shipping: p.shipping,
    status: p.status,
    description: p.description,
    sourceNotes: p.sourceNotes,
    hasSds: p.hasSds,
    image: p.image,
    featured: p.featured,
    visibility: 'published',
    variants: p.packSizes.map((s) => ({ quantity: s.quantity, presentation: DEFAULT_PRESENTATION })),
  };
}

describe('seed catalog passes the schema rules', () => {
  for (const p of products) {
    it(`${p.code} ${p.name}`, () => {
      const result = validateProductInput(toInput(p));
      if (!result.ok) {
        throw new Error(JSON.stringify({ errors: result.errors, violations: result.violations }, null, 2));
      }
      expect(result.value.variants.every((v) => v.sku?.startsWith(p.code))).toBe(true);
    });
  }
});

describe('CAS check digit', () => {
  it('accepts real registry numbers', () => {
    for (const cas of ['137525-51-0', '53-84-9', '49557-75-7', '89030-95-5', '129954-34-3', '7732-18-5']) {
      expect(isValidCas(cas), cas).toBe(true);
    }
  });
  it('rejects a wrong check digit and bad shapes', () => {
    expect(isValidCas('137525-51-1')).toBe(false);
    expect(isValidCas('1375-25-51-0')).toBe(false);
    expect(isValidCas('abc')).toBe(false);
  });
});

describe('solvents', () => {
  it('accepts laboratory solvents', () => {
    expect(isLabSolvent('PBS (pH 7.2)')).toBe(true);
    expect(isLabSolvent('DMSO')).toBe(true);
    expect(isLabSolvent('Water')).toBe(true);
  });
  it('rejects dosing vehicles', () => {
    expect(isLabSolvent('Bacteriostatic water')).toBe(false);
    expect(isLabSolvent('Sterile water for injection')).toBe(false);
    expect(isLabSolvent('Saline')).toBe(false);
    expect(isLabSolvent('Olive oil')).toBe(false);
  });
});

describe('forbidden language scanner', () => {
  const cases: [string, string][] = [
    ['dose', '2.4 mg weekly subcutaneous'],
    ['route', 'Inject intramuscularly'],
    ['reconstitution', 'Reconstitute with 2 mL bacteriostatic water'],
    ['syringe', 'Draw up in an insulin syringe'],
    ['structure/function', 'Supports tissue repair and recovery'],
    ['disease', 'Studied for research into diabetes'],
    ['brand', 'Same active ingredient as Ozempic'],
    ['approval', 'FDA-approved for'],
    ['human', 'Suitable for human consumption'],
    ['protocol', 'A typical stacking protocol'],
    ['testimonial', 'Customers report results in two weeks'],
    ['capsule presentation', 'Nasal spray, 10 mL'],
  ];
  for (const [label, text] of cases) {
    it(`rejects ${label}: "${text}"`, () => {
      expect(scanText('t', text).length).toBeGreaterThan(0);
    });
  }

  it('does not trip on legitimate chemistry', () => {
    const clean = [
      'Supplied lyophilised as the acetate salt. Identity is confirmed by mass spectrometry.',
      'Prepare fresh; store aliquots at minus 20 C and avoid repeated freeze-thaw',
      'PBS (pH 7.2), 100 mg/mL with sonication and warming to 60 C',
      'A pyridine nucleotide cofactor used as a substrate and redox couple in enzymatic assay work.',
      'The 1:1 copper(II) coordination complex of the tripeptide Gly-His-Lys.',
      'Cayman 16077 assigns GHS07 Warning with H315, H319 and H335. The SDS issued with the supplied lot governs.',
    ];
    for (const text of clean) expect(scanText('t', text), text).toEqual([]);
  });
});

describe('validateProductInput', () => {
  const base = toInput(products[0]);

  it('requires a source note', () => {
    const r = validateProductInput({ ...base, sourceNotes: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/source note/i);
  });

  it('rejects a non-laboratory presentation', () => {
    const r = validateProductInput({
      ...base,
      variants: [{ quantity: '5 mg', presentation: 'Pre-filled syringe' }],
    });
    expect(r.ok).toBe(false);
  });

  it('rejects a reconstitution volume hidden in a solubility note', () => {
    const r = validateProductInput({
      ...base,
      solubility: [{ solvent: 'Water', concentration: '1 mg/mL', note: 'reconstitute the 5 mg vial with 2 mL', source: 'x' }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violations.some((v) => v.reason.includes('reconstitution'))).toBe(true);
  });

  it('rejects a withdrawn product with no reason', () => {
    const r = validateProductInput({ ...base, visibility: 'withdrawn' });
    expect(r.ok).toBe(false);
  });

  it('rejects an invented alphanumeric name or a blend, with or without adjacent words', () => {
    for (const name of [
      'NexPhase-2T',
      'NexPhase-3R',
      'GLP-1-S',
      'NPL 4X',
      'Recovery Blend',
      'NexPhase-2T Complex',
      'Research NexPhase-2T',
      'Peptide Matrix',
    ]) {
      const r = validateProductInput({ ...base, name });
      expect(r.ok, name).toBe(false);
    }
    expect(validateProductInput({ ...base, formalName: 'Proprietary blend' }).ok).toBe(false);
    expect(validateProductInput({ ...base, casNumber: '' }).ok).toBe(false);
    // Synonyms are displayed, so they are held to the same rule.
    const viaSynonym = validateProductInput({ ...base, synonyms: ['PL 14736', 'NexPhase-2T'] });
    expect(viaSynonym.ok).toBe(false);
    if (!viaSynonym.ok) expect(viaSynonym.errors.join(' ')).toMatch(/Synonym "NexPhase-2T"/);
    // Real chemical identities still pass, including names with numbers.
    for (const p of products) expect(validateProductInput(toInput(p)).ok, p.name).toBe(true);
    expect(validateProductInput({ ...base, synonyms: ['GLP-1 receptor ligand', 'NPL-001'] }).ok).toBe(true);
  });

  it('catches dilution phrasing without "with" or "in"', () => {
    expect(scanText('t', 'dilute to a final volume of 2 mL').length).toBeGreaterThan(0);
    expect(scanText('t', 'Add 1 mL to the vial').length).toBeGreaterThan(0);
  });

  it('does not block legitimate pharmacology vocabulary', () => {
    for (const text of [
      'Activation energy determined by Arrhenius analysis',
      'Assayed in a smooth muscle cell line',
      'Binding to the muscle nicotinic receptor subtype, Ki 12 nM',
    ]) {
      expect(scanText('t', text), text).toEqual([]);
    }
    expect(scanText('t', 'Supports lean muscle and boosts energy').length).toBeGreaterThan(0);
  });

  it('derives deterministic SKUs', () => {
    expect(skuFor('NPL-001', '5 mg')).toBe('NPL-001-5MG');
    expect(skuFor('NPL-002', '1 g')).toBe('NPL-002-1G');
    expect(skuFor('NPL-002', '500 ug')).toBe('NPL-002-500UG');
  });
});
