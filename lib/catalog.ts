/**
 * NexPhase Labs — research materials catalog.
 *
 * SCHEMA RULES. These are not style preferences; each tracks language FDA has
 * quoted as evidence of intended human use in warning letters. Read before
 * adding or editing a product.
 *
 *  1. Products are classified by CHEMICAL CLASS, never by indication, research
 *     area, or physiological process. "Peptides" is a class. "Tissue & repair
 *     models" is a structure/function claim wearing a lab coat.
 *  2. No dose, no route of administration, no reconstitution volume, no
 *     human-relevant quantity guidance, anywhere.
 *  3. Solubility is given in LABORATORY solvents only. Solvent solubility is
 *     chemistry. A reconstitution volume in bacteriostatic water is dosing.
 *  4. No efficacy, benefit, outcome or human trial data. In vitro pharmacology
 *     only, with a named target and a measured constant, and only where a
 *     primary citation supports it.
 *  5. No disease names. No approved-drug brand names. No FDA-approval refs.
 *  6. The regulatory statement renders in the BODY of the product page, above
 *     the fold — never only in the footer.
 *  7. Every value below is sourced. `sourceNotes` records where, and flags any
 *     figure suppliers disagree on. Do not add a value you cannot attribute.
 *
 * Verified 2026-09-02 against PubChem PUG-REST, EPA CompTox, and the published
 * product inserts of Cayman Chemical, MedChemExpress and MilliporeSigma.
 */

import type { Hazard } from '@/lib/hazard';

/**
 * Chemical classes live in the `chemical_classes` table and are managed in the
 * catalog manager. The type is a plain string: the set of classes is data.
 * SEED_CLASSES below is the seed only.
 */
export type ChemicalClass = string;

export type SeedClass = {
  id: string;
  name: string;
  blurb: string;
  sortOrder: number;
};

/** Seed rows for `chemical_classes`. Blurbs describe chemistry only, never what a compound does in an organism. */
export const SEED_CLASSES: SeedClass[] = [
  {
    id: 'peptides',
    name: 'Peptides',
    blurb:
      'Synthetic peptides supplied lyophilised, with sequence and lot-specific analytical data.',
    sortOrder: 10,
  },
  {
    id: 'metal-peptide',
    name: 'Metal-peptide complexes',
    blurb:
      'Peptide coordination complexes, supplied with lot-specific analytical data.',
    sortOrder: 20,
  },
  {
    id: 'nucleotides',
    name: 'Nucleotides & cofactors',
    blurb:
      'Nucleotide cofactors and coenzymes used as substrates and redox couples in enzymatic assay work.',
    sortOrder: 30,
  },
];

/** Class names in the seed; used only to validate the seed file. */
export const CHEMICAL_CLASSES: string[] = SEED_CLASSES.map((c) => c.name);

export type ProductStatus = 'available' | 'limited' | 'enquire';

export const STATUS_LABEL: Record<ProductStatus, string> = {
  available: 'In stock',
  limited: 'Limited availability',
  enquire: 'Enquire for availability',
};

export type Solubility = {
  solvent: string;
  concentration: string;
  note?: string;
  source: string;
};

export type PackSize = {
  quantity: string;
};

export type RelatedCas = {
  form: string;
  cas: string;
};

export type Product = {
  code: string;
  slug: string;
  name: string;
  formalName: string;
  synonyms: string[];
  chemicalClass: ChemicalClass;
  casNumber: string;
  relatedCas?: RelatedCas[];
  sequenceOneLetter?: string;
  sequenceThreeLetter?: string;
  molecularFormula: string;
  molecularWeight: string;
  exactMass?: string;
  smiles?: string;
  inchiKey?: string;
  pubchemCid?: string;
  purity: string;
  form: string;
  saltForm: string;
  solubility: Solubility[];
  storageSolid: string;
  storageStock: string;
  stability: string;
  shipping: string;
  packSizes: PackSize[];
  status: ProductStatus;
  description: string;
  sourceNotes: string[];
  /**
   * GHS classification, for container labels and the hazard communication
   * programme. Undefined means nobody has classified this material yet, which
   * is not the same as a recorded finding that it is not hazardous — that is a
   * `signalWord` of `none` with a source behind it.
   */
  hazard?: Hazard;
  hasSds: boolean;
  /** Omitted where we do not yet hold a photograph of the material. */
  image?: string;
  featured: boolean;
};

/**
 * Rendered in the body of every product page above the fold, and on the
 * catalog index. Not a footer element.
 */
export const REGULATORY_STATEMENT =
  'For laboratory research use only. Not for human or veterinary use. Not for diagnostic or therapeutic use.';

export const STANDARD_DOCUMENTATION = [
  'Lot-specific certificate of analysis',
  'HPLC purity chromatogram for the lot supplied',
  'Mass spectrometry identity confirmation for the lot supplied',
  'Safety data sheet',
];

/**
 * SEED DATA. The live catalog is the `products` table in D1, edited through
 * the catalog manager. This array is loaded once by scripts/seed-catalog.ts
 * and is not read by any page. Keep it as the verified baseline record.
 */
export const seedProducts: Product[] = [
  {
    code: 'NPL-001',
    slug: 'bpc-157',
    name: 'BPC-157',
    formalName:
      'glycyl-L-alpha-glutamyl-L-prolyl-L-prolyl-L-prolylglycyl-L-lysyl-L-prolyl-L-alanyl-L-alpha-aspartyl-L-alpha-aspartyl-L-alanylglycyl-L-leucyl-L-valine',
    synonyms: [
      'Body Protection Compound-157',
      'PL 14736',
      'Pentadecapeptide BPC 157',
    ],
    chemicalClass: 'Peptides',
    casNumber: '137525-51-0',
    relatedCas: [
      { form: 'Acetate salt', cas: '1628202-19-6' },
      { form: 'Acetate salt (alternate registry)', cas: '216441-37-1' },
    ],
    sequenceOneLetter: 'GEPPPGKPADDAGLV',
    sequenceThreeLetter:
      'Gly-Glu-Pro-Pro-Pro-Gly-Lys-Pro-Ala-Asp-Asp-Ala-Gly-Leu-Val',
    molecularFormula: 'C62H98N16O22',
    molecularWeight: '1419.5 g/mol',
    inchiKey: 'HEEWEZGQMLZMFE-RKGINYAYSA-N',
    pubchemCid: '9941957',
    purity: 'Greater than or equal to 95% by HPLC',
    form: 'Solid',
    saltForm:
      'Supplied as the acetate salt (C64H102N16O24, 1479.6 g/mol) unless otherwise stated on the lot certificate',
    solubility: [],
    storageSolid: 'Minus 20 C',
    storageStock:
      'Prepare fresh; store aliquots at minus 20 C and avoid repeated freeze-thaw',
    stability: 'At least 4 years when stored as supplied at minus 20 C',
    shipping: 'Ambient',
    packSizes: [
      { quantity: '1 mg' },
      { quantity: '5 mg' },
      { quantity: '10 mg' },
      { quantity: '25 mg' },
    ],
    status: 'available',
    description:
      'A synthetic pentadecapeptide of sequence GEPPPGKPADDAGLV. Supplied lyophilised as the acetate salt. Identity is confirmed by mass spectrometry and purity determined by reversed-phase HPLC against the lot certificate. No USP or NF monograph exists for this substance.',
    sourceNotes: [
      'CAS, formula, molecular weight, sequence and InChI Key verified against PubChem CID 9941957 and EPA CompTox.',
      'Acetate salt data (C64H102N16O24, 1479.6 g/mol) from PubChem CID 155977614.',
      'Purity specification, storage, stability and ambient shipping per Cayman Chemical catalog 30989.',
      'Suppliers disagree on shipping condition: Cayman lists ambient, MilliporeSigma SML1719 lists wet ice. Confirm against the supplying lot.',
      'Physical form is published only as "a solid" (Cayman) and "film, colorless" (Sigma). Not described here as a white lyophilised powder, which is unsourced.',
      'Cayman publishes no solubility data for this compound. The solubility list is deliberately empty rather than estimated.',
    ],
    hasSds: true,
    image: '/products/bpc-157.png',
    featured: true,
  },
  {
    code: 'NPL-002',
    slug: 'nad',
    name: 'beta-NAD+',
    formalName: 'beta-Nicotinamide adenine dinucleotide, oxidised form',
    synonyms: [
      'NAD+',
      'beta-NAD',
      'Nicotinamide adenine dinucleotide',
      'Coenzyme I',
      'DPN',
    ],
    chemicalClass: 'Nucleotides & cofactors',
    casNumber: '53-84-9',
    relatedCas: [{ form: 'Monosodium salt', cas: '20111-18-6' }],
    molecularFormula: 'C21H27N7O14P2',
    molecularWeight: '663.43 g/mol',
    pubchemCid: '5892',
    purity: 'Greater than or equal to 95% by HPLC',
    form: 'Solid',
    saltForm:
      'Free acid. Hydrate forms are supplied under the same registry number',
    solubility: [
      {
        solvent: 'PBS (pH 7.2)',
        concentration: '10 mg/mL',
        source: 'Cayman Chemical 16077',
      },
      {
        solvent: 'PBS (pH 7.2)',
        concentration: '100 mg/mL',
        note: 'with sonication and warming to 60 C',
        source: 'MedChemExpress HY-B0445',
      },
    ],
    storageSolid: 'Minus 20 C, protected from moisture',
    storageStock:
      'Prepare fresh in aqueous buffer; do not store aqueous stocks long term',
    stability:
      'Hygroscopic. Hydrolyses in aqueous solution; stability is pH and temperature dependent',
    shipping: 'Not published by suppliers - confirm at order',
    packSizes: [
      { quantity: '100 mg' },
      { quantity: '500 mg' },
      { quantity: '1 g' },
      { quantity: '5 g' },
    ],
    status: 'available',
    description:
      'The oxidised form of nicotinamide adenine dinucleotide, a pyridine nucleotide cofactor used as a substrate and redox couple in enzymatic assay work. Supplied as the free acid. beta-NAD appears in the USP-NF Reagents section as a reagent specification; it has no drug substance monograph.',
    sourceNotes: [
      'Use PubChem CID 5892. CID 925 is the stereo-undefined record and carries no CAS.',
      'CAS, formula and molecular weight verified against PubChem and EPA CompTox.',
      'Suppliers disagree on solubility: Cayman 16077 publishes 10 mg/mL in PBS; MedChemExpress HY-B0445 publishes 100 mg/mL with sonication and heating. Both are shown rather than reconciled.',
      'Suppliers disagree on hazard classification: MilliporeSigma N8285 states not a hazardous substance or mixture; Cayman 16077 assigns GHS07 Warning with H315, H319 and H335. The SDS issued with the supplied lot governs.',
      'CAS 606-68-8 appears in searches for NAD disodium but is NADH disodium, the reduced form. Not used here.',
      'USP-NF reagent entry USPNF_R2223_01_01. A reagent specification, not a monograph.',
    ],
    hasSds: true,
    featured: true,
  },
  {
    code: 'NPL-003',
    slug: 'ghk',
    name: 'GHK',
    formalName: 'glycyl-L-histidyl-L-lysine',
    synonyms: ['Gly-His-Lys', 'Tripeptide-1'],
    chemicalClass: 'Peptides',
    casNumber: '49557-75-7',
    relatedCas: [{ form: 'Acetate salt', cas: '72957-37-0' }],
    sequenceOneLetter: 'GHK',
    sequenceThreeLetter: 'Gly-His-Lys',
    molecularFormula: 'C14H24N6O4',
    molecularWeight: '340.38 g/mol',
    pubchemCid: '73587',
    purity: 'Greater than or equal to 95% by HPLC',
    form: 'Solid',
    saltForm:
      'Free peptide. Acetate salt (400.43 g/mol) supplied under CAS 72957-37-0',
    solubility: [],
    storageSolid: 'Minus 20 C',
    storageStock: 'Prepare fresh; store aliquots at minus 20 C',
    stability: 'Refer to the lot certificate',
    shipping: 'Ambient',
    packSizes: [
      { quantity: '5 mg' },
      { quantity: '25 mg' },
      { quantity: '100 mg' },
    ],
    status: 'available',
    description:
      'A tripeptide of sequence Gly-His-Lys. Supplied as the free peptide; the acetate salt is available under a separate registry number. Identity confirmed by mass spectrometry, purity by reversed-phase HPLC. Distinct from the copper(II) complex, listed separately as NPL-004.',
    sourceNotes: [
      'CAS 49557-75-7, formula and molecular weight verified against PubChem CID 73587.',
      'Acetate salt CAS 72957-37-0 confirmed via MilliporeSigma G1887 (400.43 g/mol).',
      'Cayman catalog 27168. MedChemExpress HY-P0063 is the copper complex, not this item.',
      'Solubility in ethanol and DMF is unpublished by all suppliers checked. The list is left empty rather than estimated.',
    ],
    hasSds: true,
    featured: false,
  },
  {
    code: 'NPL-004',
    slug: 'ghk-cu',
    name: 'GHK-Cu',
    formalName: 'Copper(II) complex of glycyl-L-histidyl-L-lysine',
    synonyms: ['Copper tripeptide-1', 'Cu-GHK'],
    chemicalClass: 'Metal-peptide complexes',
    casNumber: '89030-95-5',
    sequenceOneLetter: 'GHK',
    sequenceThreeLetter: 'Gly-His-Lys',
    molecularFormula: 'C14H22CuN6O4',
    molecularWeight: '401.91 g/mol',
    pubchemCid: '71587328',
    purity: 'Greater than or equal to 98% by HPLC',
    form: 'Blue to purple solid',
    saltForm: 'Copper(II) complex, 1:1',
    solubility: [],
    storageSolid: 'Minus 20 C',
    storageStock: 'Prepare fresh in aqueous buffer',
    stability: 'Refer to the lot certificate',
    shipping: 'Ambient',
    packSizes: [
      { quantity: '5 mg' },
      { quantity: '25 mg' },
      { quantity: '100 mg' },
    ],
    status: 'available',
    description:
      'The 1:1 copper(II) coordination complex of the tripeptide Gly-His-Lys. Supplied as a blue to purple solid. Molecular formulae in circulation for this complex differ by ligand protonation state; the value shown is the commercial consensus used by Cayman Chemical and MedChemExpress.',
    sourceNotes: [
      'CAS 89030-95-5 and PubChem CID 71587328 verified.',
      'Molecular formula is unsettled: four values are in circulation (401.91, 402.92, 403.92 and 400.90 g/mol) differing in ligand protonation. C14H22CuN6O4 at 401.91 is used by both Cayman 28259 and MedChemExpress HY-P0063 and is adopted here. No InChI Key is published because the structure is not settled.',
      'Suppliers disagree on hazard classification: Cayman 28259 does not classify; MedChemExpress HY-P0063 assigns Warning with H302, H315, H319 and H335. The SDS issued with the supplied lot governs.',
      'CAS 300801-03-0 (GHK-Cu acetate) is ambiguous - PubChem maps it to several structures including the 2:1 bis complex. Not used.',
      'MilliporeSigma does not carry this compound.',
      'Appearance verified as blue to purple. Not a white powder.',
    ],
    hasSds: true,
    image: '/products/ghk-cu.png',
    featured: false,
  },
  {
    code: 'NPL-005',
    slug: 'selank',
    name: 'Selank',
    formalName:
      'L-threonyl-L-lysyl-L-prolyl-L-arginyl-L-prolylglycyl-L-proline',
    synonyms: ['TP-7'],
    chemicalClass: 'Peptides',
    casNumber: '129954-34-3',
    relatedCas: [{ form: 'Monoacetate salt', cas: '2703745-90-6' }],
    sequenceOneLetter: 'TKPRPGP',
    sequenceThreeLetter: 'Thr-Lys-Pro-Arg-Pro-Gly-Pro',
    molecularFormula: 'C33H57N11O9',
    molecularWeight: '751.9 g/mol',
    purity: 'Greater than or equal to 98% by HPLC',
    form: 'Solid',
    saltForm:
      'Monoacetate salt (C35H61N11O11, 811.9 g/mol) supplied under CAS 2703745-90-6. The diacetate is supplied under the free-base registry number',
    solubility: [],
    storageSolid: 'Minus 20 C',
    storageStock: 'Prepare fresh; store aliquots at minus 20 C',
    stability: 'Refer to the lot certificate',
    shipping: 'Ambient',
    packSizes: [{ quantity: '5 mg' }, { quantity: '25 mg' }],
    status: 'limited',
    description:
      'A synthetic heptapeptide of sequence TKPRPGP. Supplied lyophilised. Identity confirmed by mass spectrometry, purity determined by reversed-phase HPLC against the lot certificate. No USP or NF monograph exists for this substance.',
    sourceNotes: [
      'CAS 129954-34-3, sequence, formula and molecular weight verified.',
      'The monoacetate has its own registry number, 2703745-90-6 (C35H61N11O11, 811.9 g/mol). The diacetate does not - suppliers reuse the free-base CAS.',
      'Cayman catalog 27720. MedChemExpress HY-105042.',
      'MilliporeSigma listing unconfirmed.',
    ],
    hasSds: true,
    image: '/products/selank.png',
    featured: false,
  },
  {
    code: 'NPL-006',
    slug: 'ipamorelin',
    name: 'Ipamorelin',
    formalName:
      '2-amino-2-methylpropanoyl-L-histidyl-3-(naphthalen-2-yl)-D-alanyl-D-phenylalanyl-L-lysinamide',
    synonyms: ['NNC 26-0161', 'Aib-His-D-2-Nal-D-Phe-Lys-NH2'],
    chemicalClass: 'Peptides',
    casNumber: '170851-70-4',
    sequenceThreeLetter: 'Aib-His-D-2-Nal-D-Phe-Lys-NH2',
    molecularFormula: 'C38H49N9O5',
    molecularWeight: '711.9 g/mol',
    pubchemCid: '9831659',
    purity: 'Greater than or equal to 98% by HPLC',
    form: 'Solid',
    saltForm: 'Supplied as the acetate salt unless otherwise stated on the lot certificate',
    solubility: [],
    storageSolid: 'Minus 20 C',
    storageStock: 'Prepare fresh; store aliquots at minus 20 C',
    stability: 'Refer to the lot certificate',
    shipping: 'Ambient',
    packSizes: [{ quantity: '5 mg' }, { quantity: '10 mg' }],
    status: 'enquire',
    description:
      'A synthetic pentapeptide amide containing 2-aminoisobutyric acid at position 1 and D-amino acids at positions 3 and 4. No standard one-letter sequence applies. Supplied lyophilised. Identity confirmed by mass spectrometry, purity determined by reversed-phase HPLC against the lot certificate. No USP or NF monograph exists for this substance.',
    sourceNotes: [
      'CAS 170851-70-4, formula C38H49N9O5 and molecular weight 711.9 g/mol verified against PubChem CID 9831659 on 19 Sep 2026.',
      'Formal name written from the published residue sequence; confirm against the supplier certificate before the first lot is released.',
      'Salt form is not published consistently by suppliers; the lot certificate governs.',
    ],
    hasSds: false,
    featured: false,
  },
  {
    code: 'NPL-007',
    slug: 'semax',
    name: 'Semax',
    formalName:
      'L-methionyl-L-alpha-glutamyl-L-histidyl-L-phenylalanyl-L-prolylglycyl-L-proline',
    synonyms: ['Met-Glu-His-Phe-Pro-Gly-Pro', 'ACTH (4-7)-Pro-Gly-Pro'],
    chemicalClass: 'Peptides',
    casNumber: '80714-61-0',
    sequenceOneLetter: 'MEHFPGP',
    sequenceThreeLetter: 'Met-Glu-His-Phe-Pro-Gly-Pro',
    molecularFormula: 'C37H51N9O10S',
    molecularWeight: '813.9 g/mol',
    pubchemCid: '9811102',
    purity: 'Greater than or equal to 98% by HPLC',
    form: 'Solid',
    saltForm: 'Supplied as the acetate salt unless otherwise stated on the lot certificate',
    solubility: [],
    storageSolid: 'Minus 20 C',
    storageStock: 'Prepare fresh; store aliquots at minus 20 C',
    stability: 'Refer to the lot certificate',
    shipping: 'Ambient',
    packSizes: [{ quantity: '5 mg' }, { quantity: '10 mg' }],
    status: 'enquire',
    description:
      'A synthetic heptapeptide of sequence MEHFPGP. Supplied lyophilised. Identity confirmed by mass spectrometry, purity determined by reversed-phase HPLC against the lot certificate. No USP or NF monograph exists for this substance.',
    sourceNotes: [
      'CAS 80714-61-0, formula C37H51N9O10S and molecular weight 813.9 g/mol verified against PubChem CID 9811102 on 19 Sep 2026.',
      'Salt form is not published consistently by suppliers; the lot certificate governs.',
    ],
    hasSds: false,
    featured: false,
  },
  {
    code: 'NPL-008',
    slug: 'thymosin-alpha-1',
    name: 'Thymosin alpha-1',
    formalName:
      'N-acetyl-L-seryl-L-alpha-aspartyl-L-alanyl-L-alanyl-L-valyl-L-alpha-aspartyl-L-threonyl-L-seryl-L-seryl-L-alpha-glutamyl-L-isoleucyl-L-threonyl-L-threonyl-L-lysyl-L-alpha-aspartyl-L-leucyl-L-lysyl-L-alpha-glutamyl-L-lysyl-L-lysyl-L-alpha-glutamyl-L-valyl-L-valyl-L-alpha-glutamyl-L-alpha-glutamyl-L-alanyl-L-alpha-glutamyl-L-asparagine',
    synonyms: ['Thymalfasin', 'Ta1', 'Ac-SDAAVDTSSEITTKDLKEKKEVVEEAEN'],
    chemicalClass: 'Peptides',
    casNumber: '62304-98-7',
    sequenceOneLetter: 'SDAAVDTSSEITTKDLKEKKEVVEEAEN',
    sequenceThreeLetter:
      'Ac-Ser-Asp-Ala-Ala-Val-Asp-Thr-Ser-Ser-Glu-Ile-Thr-Thr-Lys-Asp-Leu-Lys-Glu-Lys-Lys-Glu-Val-Val-Glu-Glu-Ala-Glu-Asn',
    molecularFormula: 'C129H215N33O55',
    molecularWeight: '3108.3 g/mol',
    pubchemCid: '16130571',
    purity: 'Greater than or equal to 98% by HPLC',
    form: 'Solid',
    saltForm: 'Supplied as the acetate salt unless otherwise stated on the lot certificate',
    solubility: [],
    storageSolid: 'Minus 20 C',
    storageStock: 'Prepare fresh; store aliquots at minus 20 C',
    stability: 'Refer to the lot certificate',
    shipping: 'Ambient',
    packSizes: [{ quantity: '5 mg' }, { quantity: '10 mg' }],
    status: 'enquire',
    description:
      'A synthetic N-acetylated 28-residue peptide of sequence SDAAVDTSSEITTKDLKEKKEVVEEAEN. Supplied lyophilised. Identity confirmed by mass spectrometry, purity determined by reversed-phase HPLC against the lot certificate. No USP or NF monograph exists for this substance.',
    sourceNotes: [
      'CAS 62304-98-7, formula C129H215N33O55 and molecular weight 3108.3 g/mol verified against PubChem CID 16130571 (thymalfasin) on 19 Sep 2026.',
      'Salt form is not published consistently by suppliers; the lot certificate governs.',
    ],
    hasSds: false,
    featured: false,
  },
  {
    code: 'NPL-009',
    slug: 'tb-500',
    name: 'TB-500',
    formalName:
      'N-acetyl-L-leucyl-L-lysyl-L-lysyl-L-threonyl-L-alpha-glutamyl-L-threonyl-L-glutamine',
    synonyms: ['Ac-LKKTETQ', 'N-acetyl thymosin beta-4 (17-23)'],
    chemicalClass: 'Peptides',
    casNumber: '885340-08-9',
    sequenceOneLetter: 'LKKTETQ',
    sequenceThreeLetter: 'Ac-Leu-Lys-Lys-Thr-Glu-Thr-Gln',
    molecularFormula: 'C38H68N10O14',
    molecularWeight: '889.0 g/mol',
    purity: 'Greater than or equal to 98% by HPLC',
    form: 'Solid',
    saltForm: 'Supplied as the acetate salt unless otherwise stated on the lot certificate',
    solubility: [],
    storageSolid: 'Minus 20 C',
    storageStock: 'Prepare fresh; store aliquots at minus 20 C',
    stability: 'Refer to the lot certificate',
    shipping: 'Ambient',
    packSizes: [{ quantity: '5 mg' }, { quantity: '10 mg' }],
    status: 'enquire',
    description:
      'A synthetic N-acetylated heptapeptide of sequence LKKTETQ, corresponding to residues 17 to 23 of thymosin beta-4. It is not the full-length 43-residue protein, which is a different substance under a different registry number. Supplied lyophilised. Identity confirmed by mass spectrometry, purity determined by reversed-phase HPLC against the lot certificate.',
    sourceNotes: [
      'CAS 885340-08-9, formula C38H68N10O14 and molecular weight 889.02 g/mol per ChemicalBook CB34713831, checked 19 Sep 2026. No PubChem CID located for the acetylated fragment.',
      'Full-length thymosin beta-4 is CAS 77591-33-4 and is not this item. Suppliers sell both under the name TB-500; the lot certificate must state which substance was supplied.',
      'Salt form is not published consistently by suppliers; the lot certificate governs.',
    ],
    hasSds: false,
    featured: false,
  },
  {
    code: 'NPL-010',
    slug: 'modified-grf-1-29',
    name: 'Modified GRF (1-29)',
    formalName:
      'L-tyrosyl-D-alanyl-L-alpha-aspartyl-L-alanyl-L-isoleucyl-L-phenylalanyl-L-threonyl-L-glutaminyl-L-seryl-L-tyrosyl-L-arginyl-L-lysyl-L-valyl-L-leucyl-L-alanyl-L-glutaminyl-L-leucyl-L-seryl-L-alanyl-L-arginyl-L-lysyl-L-leucyl-L-leucyl-L-glutaminyl-L-alpha-aspartyl-L-isoleucyl-L-leucyl-L-seryl-L-argininamide',
    synonyms: ['CJC-1295 without DAC', 'Mod GRF 1-29', 'Tetrasubstituted GRF (1-29) amide'],
    chemicalClass: 'Peptides',
    casNumber: '863288-34-0',
    sequenceOneLetter: 'YADAIFTQSYRKVLAQLSARKLLQDILSR',
    sequenceThreeLetter:
      'Tyr-D-Ala-Asp-Ala-Ile-Phe-Thr-Gln-Ser-Tyr-Arg-Lys-Val-Leu-Ala-Gln-Leu-Ser-Ala-Arg-Lys-Leu-Leu-Gln-Asp-Ile-Leu-Ser-Arg-NH2',
    molecularFormula: 'C152H252N44O42',
    molecularWeight: '3367.9 g/mol',
    pubchemCid: '56841945',
    purity: 'Greater than or equal to 98% by HPLC',
    form: 'Solid',
    saltForm: 'Supplied as the acetate salt unless otherwise stated on the lot certificate',
    solubility: [],
    storageSolid: 'Minus 20 C',
    storageStock: 'Prepare fresh; store aliquots at minus 20 C',
    stability: 'Refer to the lot certificate',
    shipping: 'Ambient',
    packSizes: [{ quantity: '5 mg' }, { quantity: '10 mg' }],
    status: 'enquire',
    description:
      'A synthetic 29-residue peptide amide with four substitutions (D-Ala2, Gln8, Ala15, Leu27) relative to the 1-29 fragment it is derived from. Sold commercially as CJC-1295 without DAC; the DAC conjugate is a different substance. Supplied lyophilised. Identity confirmed by mass spectrometry, purity determined by reversed-phase HPLC against the lot certificate.',
    sourceNotes: [
      'CAS 863288-34-0 resolves in PubChem to CID 56841945, the 29-residue amide without the DAC group; formula C152H252N44O42 and molecular weight 3367.9 g/mol taken from that record on 19 Sep 2026.',
      'Some suppliers list the same CAS against the DAC conjugate. The lot certificate must state which substance was supplied; only the non-DAC form is catalogued here.',
      'Formal name taken verbatim from the PubChem record title.',
    ],
    hasSds: false,
    featured: false,
  },
  {
    code: 'NPL-011',
    slug: 'aod-9604',
    name: 'AOD-9604',
    formalName:
      'L-tyrosyl-L-leucyl-L-arginyl-L-isoleucyl-L-valyl-L-glutaminyl-L-cysteinyl-L-arginyl-L-seryl-L-valyl-L-alpha-glutamylglycyl-L-seryl-L-cysteinylglycyl-L-phenylalanine, cyclic (7-14)-disulfide',
    synonyms: ['Tyr-hGH (177-191)', 'AOD 9604'],
    chemicalClass: 'Peptides',
    casNumber: '221231-10-3',
    sequenceOneLetter: 'YLRIVQCRSVEGSCGF',
    sequenceThreeLetter:
      'Tyr-Leu-Arg-Ile-Val-Gln-Cys-Arg-Ser-Val-Glu-Gly-Ser-Cys-Gly-Phe (disulfide Cys7-Cys14)',
    molecularFormula: 'C78H123N23O23S2',
    molecularWeight: '1815.1 g/mol',
    pubchemCid: '71300630',
    purity: 'Greater than or equal to 98% by HPLC',
    form: 'Solid',
    saltForm: 'Supplied as the acetate salt unless otherwise stated on the lot certificate',
    solubility: [],
    storageSolid: 'Minus 20 C',
    storageStock: 'Prepare fresh; store aliquots at minus 20 C',
    stability: 'Refer to the lot certificate',
    shipping: 'Ambient',
    packSizes: [{ quantity: '5 mg' }],
    status: 'enquire',
    description:
      'A synthetic 16-residue peptide corresponding to residues 177 to 191 of the 191-residue human somatotropin sequence with an added N-terminal tyrosine, containing one intramolecular disulfide. Supplied lyophilised. Identity confirmed by mass spectrometry, purity determined by reversed-phase HPLC against the lot certificate.',
    sourceNotes: [
      'CAS 221231-10-3, formula C78H123N23O23S2 and molecular weight 1815.1 g/mol verified against PubChem CID 71300630 on 19 Sep 2026.',
      'Formal name written from the published residue sequence and disulfide position; confirm against the supplier certificate before the first lot is released.',
    ],
    hasSds: false,
    featured: false,
  },
  {
    code: 'NPL-012',
    slug: 'kpv',
    name: 'KPV',
    formalName: 'L-lysyl-L-prolyl-L-valine',
    synonyms: ['Lys-Pro-Val', 'alpha-MSH (11-13)'],
    chemicalClass: 'Peptides',
    casNumber: '67727-97-3',
    sequenceOneLetter: 'KPV',
    sequenceThreeLetter: 'Lys-Pro-Val',
    molecularFormula: 'C16H30N4O4',
    molecularWeight: '342.4 g/mol',
    pubchemCid: '125672',
    purity: 'Greater than or equal to 98% by HPLC',
    form: 'Solid',
    saltForm: 'Free peptide unless otherwise stated on the lot certificate',
    solubility: [],
    storageSolid: 'Minus 20 C',
    storageStock: 'Prepare fresh; store aliquots at minus 20 C',
    stability: 'Refer to the lot certificate',
    shipping: 'Ambient',
    packSizes: [{ quantity: '10 mg' }],
    status: 'enquire',
    description:
      'A tripeptide of sequence Lys-Pro-Val, the C-terminal three residues of alpha-melanocyte-stimulating hormone. Supplied lyophilised. Identity confirmed by mass spectrometry, purity determined by reversed-phase HPLC against the lot certificate.',
    sourceNotes: [
      'CAS 67727-97-3, formula C16H30N4O4, molar mass 342.44 g/mol and PubChem CID 125672 per the compound infobox on Wikipedia (KPV tripeptide), checked 19 Sep 2026. Re-verify directly against PubChem before the first lot is released.',
    ],
    hasSds: false,
    featured: false,
  },
  {
    code: 'NPL-013',
    slug: 'mots-c',
    name: 'MOTS-c',
    formalName:
      'L-methionyl-L-arginyl-L-tryptophyl-L-glutaminyl-L-alpha-glutamyl-L-methionylglycyl-L-tyrosyl-L-isoleucyl-L-phenylalanyl-L-tyrosyl-L-prolyl-L-arginyl-L-lysyl-L-leucyl-L-arginine',
    synonyms: ['MOTS-c (human)', 'Mitochondrial ORF of the 12S rRNA type-c'],
    chemicalClass: 'Peptides',
    casNumber: '1627580-64-6',
    sequenceOneLetter: 'MRWQEMGYIFYPRKLR',
    sequenceThreeLetter:
      'Met-Arg-Trp-Gln-Glu-Met-Gly-Tyr-Ile-Phe-Tyr-Pro-Arg-Lys-Leu-Arg',
    molecularFormula: 'C101H152N28O22S2',
    molecularWeight: '2174.6 g/mol',
    pubchemCid: '146675088',
    purity: 'Greater than or equal to 98% by HPLC',
    form: 'Solid',
    saltForm: 'Supplied as the acetate salt unless otherwise stated on the lot certificate',
    solubility: [],
    storageSolid: 'Minus 20 C',
    storageStock: 'Prepare fresh; store aliquots at minus 20 C',
    stability: 'Refer to the lot certificate',
    shipping: 'Ambient',
    packSizes: [{ quantity: '5 mg' }, { quantity: '10 mg' }],
    status: 'enquire',
    description:
      'A synthetic 16-residue peptide of sequence MRWQEMGYIFYPRKLR, the human sequence encoded within the mitochondrial 12S rRNA gene. Supplied lyophilised. Identity confirmed by mass spectrometry, purity determined by reversed-phase HPLC against the lot certificate.',
    sourceNotes: [
      'CAS 1627580-64-6, formula C101H152N28O22S2 and molecular weight 2174.6 g/mol verified against PubChem CIDs 146675088 and 155885767 (identical composition) on 19 Sep 2026.',
      'Formal name written from the published residue sequence; confirm against the supplier certificate before the first lot is released.',
    ],
    hasSds: false,
    featured: false,
  },
];

/* ---------------------------------------------------------------------------
 * REMOVED FROM CATALOG - 2026-09-02. Recorded here deliberately rather than
 * deleted silently, so the reason survives in version control.
 *
 *  Tesamorelin - the active ingredient of an approved biologic (BLA 022505,
 *    marketed as Egrifta and Egrifta WR). Distributing it carries Public
 *    Health Service Act exposure the other items do not, and it is not a
 *    normal research-reagent listing.
 *
 *  "NexPhase-2T" and "NexPhase-3R" - undisclosed proprietary blends under
 *    invented alphanumeric brand names. A material of undisclosed composition
 *    cannot function as a research reagent: no CAS, no sequence, nothing
 *    citable or reproducible. A compliant safety data sheet is also impossible,
 *    since Section 3 requires composition disclosure. FDA issued seven warning
 *    letters on 31 March 2026 against this exact naming pattern.
 * ------------------------------------------------------------------------- */
