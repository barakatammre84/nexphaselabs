import { describe, expect, it } from 'vitest';
import { seedProducts as products, type Product } from '@/lib/catalog';
import {
  DEFAULT_PRESENTATION,
  counselHold,
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
    hazard: null,
  sourceNotes: p.sourceNotes,
    hasSds: p.hasSds,
    image: p.image,
    featured: p.featured,
    visibility: 'published',
    variants: p.packSizes.map((s) => ({
      quantity: s.quantity,
      presentation: DEFAULT_PRESENTATION,
    })),
  };
}

describe('seed catalog passes the schema rules', () => {
  for (const p of products) {
    it(`${p.code} ${p.name}`, () => {
      const result = validateProductInput(toInput(p));
      if (!result.ok) {
        throw new Error(
          JSON.stringify(
            { errors: result.errors, violations: result.violations },
            null,
            2,
          ),
        );
      }
      expect(
        result.value.variants.every((v) => v.sku?.startsWith(p.code)),
      ).toBe(true);
    });
  }
});

describe('CAS check digit', () => {
  it('accepts real registry numbers', () => {
    for (const cas of [
      '137525-51-0',
      '53-84-9',
      '49557-75-7',
      '89030-95-5',
      '129954-34-3',
      '7732-18-5',
    ]) {
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
      solubility: [
        {
          solvent: 'Water',
          concentration: '1 mg/mL',
          note: 'reconstitute the 5 mg vial with 2 mL',
          source: 'x',
        },
      ],
    });
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(
        r.violations.some((v) => v.reason.includes('reconstitution')),
      ).toBe(true);
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
    expect(
      validateProductInput({ ...base, formalName: 'Proprietary blend' }).ok,
    ).toBe(false);
    expect(validateProductInput({ ...base, casNumber: '' }).ok).toBe(false);
    // Synonyms are displayed, so they are held to the same rule.
    const viaSynonym = validateProductInput({
      ...base,
      synonyms: ['PL 14736', 'NexPhase-2T'],
    });
    expect(viaSynonym.ok).toBe(false);
    if (!viaSynonym.ok)
      expect(viaSynonym.errors.join(' ')).toMatch(/Synonym "NexPhase-2T"/);
    // Real chemical identities still pass, including names with numbers.
    for (const p of products)
      expect(validateProductInput(toInput(p)).ok, p.name).toBe(true);
    expect(
      validateProductInput({
        ...base,
        synonyms: ['GLP-1 receptor ligand', 'NPL-001'],
      }).ok,
    ).toBe(true);
  });

  it('catches dilution phrasing without "with" or "in"', () => {
    expect(
      scanText('t', 'dilute to a final volume of 2 mL').length,
    ).toBeGreaterThan(0);
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
    expect(
      scanText('t', 'Supports lean muscle and boosts energy').length,
    ).toBeGreaterThan(0);
  });

  it('rejects prose or dosing hidden in numeric-looking fields', () => {
    const bad = [
      { exactMass: '2.4 mg weekly subcutaneous' },
      { molecularWeight: 'about 1419 give or take' },
      { smiles: 'inject 2 mL' },
      { molecularFormula: 'C62H98N16O22 (reconstitute in 2 mL)' },
      {
        solubility: [
          {
            solvent: 'Water',
            concentration: '2 mL per 5 mg vial',
            source: 'x',
          },
        ],
      },
      {
        solubility: [
          { solvent: 'Water', concentration: '250 mcg daily', source: 'x' },
        ],
      },
    ];
    for (const patch of bad) {
      expect(
        validateProductInput({ ...base, ...patch }).ok,
        JSON.stringify(patch),
      ).toBe(false);
    }
    const good = [
      { exactMass: '1418.7 Da' },
      { molecularWeight: '1419.5 g/mol' },
      { smiles: 'CC(=O)O' },
      {
        solubility: [
          { solvent: 'DMSO', concentration: '10 mg/mL', source: 'Cayman 1' },
        ],
      },
      {
        solubility: [
          {
            solvent: 'PBS (pH 7.2)',
            concentration: '5 mM',
            source: 'Cayman 1',
          },
        ],
      },
    ];
    for (const patch of good) {
      expect(
        validateProductInput({ ...base, ...patch }).ok,
        JSON.stringify(patch),
      ).toBe(true);
    }
  });

  it('derives deterministic SKUs', () => {
    expect(skuFor('NPL-001', '5 mg')).toBe('NPL-001-5MG');
    expect(skuFor('NPL-002', '1 g')).toBe('NPL-002-1G');
    expect(skuFor('NPL-002', '500 ug')).toBe('NPL-002-500UG');
  });
});

describe('photograph and display order', () => {
  it('accepts a repository asset carrying this slug, or an uploaded key carrying this code', () => {
    const base = toInput(products[0]);
    const ok = (image: string | null) =>
      validateProductInput({ ...base, image }).ok;
    expect(ok(null)).toBe(true);
    expect(ok(`/products/${base.slug}.png`)).toBe(true);
    expect(ok(`/products/${base.slug}.jpeg`)).toBe(true);
    expect(ok(`products/${base.code}/image/${'a'.repeat(32)}.png`)).toBe(true);
    expect(ok('/products/other-compound.png')).toBe(false);
    expect(ok(`products/NPL-999/image/${'a'.repeat(32)}.png`)).toBe(false);
    expect(ok('https://example.com/vial.png')).toBe(false);
    expect(ok('/products/../secret.png')).toBe(false);
  });
  it('bounds the display order', () => {
    const base = toInput(products[0]);
    for (const [so, expected] of [
      [0, true],
      [9999, true],
      [10000, false],
      [-1, false],
      [1.5, false],
      [null, true],
    ] as const) {
      expect(
        validateProductInput({ ...base, sortOrder: so }).ok,
        String(so),
      ).toBe(expected);
    }
  });
});

describe('counselHold', () => {
  it('holds a held compound named in any identity field', () => {
    expect(counselHold({ name: 'Retatrutide' })).toMatch(/investigational compound/);
    expect(counselHold({ name: 'NP-3R', formalName: 'Retatrutide' })).toMatch(/investigational compound/);
    expect(counselHold({ name: 'Peptide 9', formalName: null, synonyms: ['retatrutide'] })).toMatch(/investigational compound/);
    expect(counselHold({ name: 'Tirzepatide' })).toMatch(/warning letters/);
  });

  // The 2026-09 inventory sheet lists these compounds under house codes only.
  // A product created as "NP-3R" with no formal name and no synonym must not
  // walk past the hold: a hold a naming choice can switch off is not a hold.
  it('holds the house code on its own, with no compound name anywhere', () => {
    expect(counselHold({ name: 'NP-3R', formalName: null, synonyms: [] })).toMatch(/house code for retatrutide/);
    expect(counselHold({ name: 'NP3R', formalName: null, synonyms: [] })).toMatch(/house code for retatrutide/);
    expect(counselHold({ name: 'NP-2T 10 mg', formalName: null, synonyms: [] })).toMatch(/house code for tirzepatide/);
    expect(counselHold({ name: 'np-2t', formalName: null, synonyms: [] })).toMatch(/house code for tirzepatide/);
  });

  it('does not hold the compounds this catalog actually sells', () => {
    expect(counselHold({ name: 'GHK-Cu', formalName: 'Glycyl-L-histidyl-L-lysine copper(II)' })).toBeNull();
    expect(counselHold({ name: 'BPC-157' })).toBeNull();
    expect(counselHold({ name: 'beta-NAD+' })).toBeNull();
    expect(counselHold({ name: 'Selank' })).toBeNull();
  });

  it('does not fire on unrelated codes that merely share the prefix', () => {
    expect(counselHold({ name: 'NP-3RX-treated resin' })).toBeNull();
    expect(counselHold({ name: 'NPL-004' })).toBeNull();
  });
});
