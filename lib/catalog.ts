/**
 * Single source of truth for the NexPhase Labs catalog.
 *
 * When the /manage catalog manager is built, this array is replaced by rows
 * read from the D1 database. Every page reads from here, so the shape below
 * is deliberately the same shape a database row will have.
 *
 * IMPORTANT — before launch, every value in `identity` must be checked against
 * the supplier certificate of analysis for the material actually being sold.
 * Purity is intentionally never hard-coded: it is lot-specific and must come
 * from the COA for that lot.
 */

export type ProductStatus = 'available' | 'limited' | 'pre-order';

export type ResearchArea =
  | 'Tissue & repair models'
  | 'Metabolic & endocrine models'
  | 'Neurological models'
  | 'Cellular energy models';

export type Spec = { label: string; value: string };

export type Product = {
  slug: string;
  code: string;
  name: string;
  size: string;
  form: string;
  area: ResearchArea;
  image: string;
  summary: string;
  description: string;
  identity: Spec[];
  handling: Spec[];
  documentation: string[];
  status: ProductStatus;
  featured: boolean;
};

export const RESEARCH_AREAS: ResearchArea[] = [
  'Tissue & repair models',
  'Metabolic & endocrine models',
  'Neurological models',
  'Cellular energy models',
];

const STANDARD_DOCUMENTATION = [
  'Certificate of analysis (lot-specific)',
  'HPLC purity chromatogram',
  'Mass spectrometry identity confirmation',
  'Lot number and manufacture date',
];

export const products: Product[] = [
  {
    slug: 'bpc-157',
    code: 'NPL-001',
    name: 'BPC-157',
    size: '5 mg',
    form: 'Lyophilized powder',
    area: 'Tissue & repair models',
    image: '/products/bpc-157.png',
    summary: 'Synthetic pentadecapeptide supplied as a lyophilized research material.',
    description:
      'A synthetic 15-amino-acid peptide fragment studied in preclinical tissue and gastrointestinal models. Supplied lyophilized in a sealed vial with lot-specific analytical documentation. NexPhase Labs makes no representation about biological activity outside a controlled research setting.',
    identity: [
      { label: 'Sequence', value: 'Gly-Glu-Pro-Pro-Pro-Gly-Lys-Pro-Ala-Asp-Asp-Ala-Gly-Leu-Val' },
      { label: 'Molecular formula', value: 'C62H98N16O22' },
      { label: 'Molecular weight', value: '1419.5 g/mol' },
      { label: 'CAS number', value: '137525-51-0' },
      { label: 'Purity', value: 'Reported per lot on the certificate of analysis' },
    ],
    handling: [
      { label: 'Storage (sealed)', value: '-20 °C, protected from light' },
      { label: 'Storage (reconstituted)', value: '2-8 °C, short term' },
      { label: 'Reconstitution', value: 'Bacteriostatic or sterile water, per the receiving laboratory protocol' },
      { label: 'Shipping', value: 'Ambient with insulated packaging; cold-chain available on request' },
    ],
    documentation: STANDARD_DOCUMENTATION,
    status: 'available',
    featured: true,
  },
  {
    slug: 'nad-plus',
    code: 'NPL-002',
    name: 'NAD+',
    size: '500 mg',
    form: 'Lyophilized powder',
    area: 'Cellular energy models',
    image: '/products/nad-plus.png',
    summary: 'Beta-nicotinamide adenine dinucleotide, supplied for in vitro and assay work.',
    description:
      'A coenzyme central to redox reactions and widely used as a reagent in enzymatic assays and cellular energy research. Supplied lyophilized with lot-specific analytical documentation.',
    identity: [
      { label: 'Chemical name', value: 'beta-Nicotinamide adenine dinucleotide' },
      { label: 'Molecular formula', value: 'C21H27N7O14P2' },
      { label: 'Molecular weight', value: '663.43 g/mol' },
      { label: 'CAS number', value: '53-84-9' },
      { label: 'Purity', value: 'Reported per lot on the certificate of analysis' },
    ],
    handling: [
      { label: 'Storage (sealed)', value: '-20 °C, desiccated' },
      { label: 'Storage (in solution)', value: 'Prepare fresh; aliquot and freeze for short-term use' },
      { label: 'Solubility', value: 'Water soluble' },
      { label: 'Shipping', value: 'Ambient with insulated packaging; cold-chain available on request' },
    ],
    documentation: STANDARD_DOCUMENTATION,
    status: 'available',
    featured: true,
  },
  {
    slug: 'ghk-cu',
    code: 'NPL-003',
    name: 'GHK-Cu',
    size: '50 mg',
    form: 'Lyophilized powder',
    area: 'Tissue & repair models',
    image: '/products/ghk-cu.png',
    summary: 'Copper tripeptide complex used in dermatological and matrix research.',
    description:
      'The tripeptide glycyl-L-histidyl-L-lysine in complex with copper(II), studied in extracellular matrix and dermatological research models. Supplied lyophilized with lot-specific analytical documentation.',
    identity: [
      { label: 'Sequence', value: 'Gly-His-Lys (copper(II) complex)' },
      { label: 'Chemical name', value: 'Glycyl-L-histidyl-L-lysine copper(II)' },
      { label: 'Molecular weight', value: '340.9 g/mol (complex)' },
      { label: 'CAS number', value: '89030-95-5' },
      { label: 'Purity', value: 'Reported per lot on the certificate of analysis' },
    ],
    handling: [
      { label: 'Storage (sealed)', value: '-20 °C, protected from light' },
      { label: 'Storage (reconstituted)', value: '2-8 °C, short term' },
      { label: 'Appearance', value: 'Blue to blue-violet solid' },
      { label: 'Shipping', value: 'Ambient with insulated packaging; cold-chain available on request' },
    ],
    documentation: STANDARD_DOCUMENTATION,
    status: 'available',
    featured: true,
  },
  {
    slug: 'tesamorelin',
    code: 'NPL-004',
    name: 'Tesamorelin',
    size: '2 mg',
    form: 'Lyophilized powder',
    area: 'Metabolic & endocrine models',
    image: '/products/tesamorelin.png',
    summary: 'Synthetic growth hormone-releasing factor analog for endocrine research models.',
    description:
      'A synthetic 44-amino-acid analog of human growth hormone-releasing hormone, used in preclinical endocrine and metabolic research. Supplied lyophilized with lot-specific analytical documentation.',
    identity: [
      { label: 'Class', value: 'Synthetic GHRH (1-44) analog' },
      { label: 'Residues', value: '44 amino acids' },
      { label: 'Molecular weight', value: '5135.9 g/mol' },
      { label: 'CAS number', value: '218949-48-5' },
      { label: 'Purity', value: 'Reported per lot on the certificate of analysis' },
    ],
    handling: [
      { label: 'Storage (sealed)', value: '-20 °C, protected from light' },
      { label: 'Storage (reconstituted)', value: '2-8 °C, short term' },
      { label: 'Reconstitution', value: 'Sterile water, per the receiving laboratory protocol' },
      { label: 'Shipping', value: 'Cold-chain recommended' },
    ],
    documentation: STANDARD_DOCUMENTATION,
    status: 'available',
    featured: false,
  },
  {
    slug: 'selank',
    code: 'NPL-005',
    name: 'Selank',
    size: '5 mg',
    form: 'Lyophilized powder',
    area: 'Neurological models',
    image: '/products/selank.png',
    summary: 'Synthetic heptapeptide studied in neurological research models.',
    description:
      'A synthetic heptapeptide derived from a tuftsin fragment, studied in preclinical neurological and behavioral research models. Supplied lyophilized with lot-specific analytical documentation.',
    identity: [
      { label: 'Sequence', value: 'Thr-Lys-Pro-Arg-Pro-Gly-Pro' },
      { label: 'Molecular formula', value: 'C33H57N11O9' },
      { label: 'Molecular weight', value: '751.9 g/mol' },
      { label: 'CAS number', value: '129954-34-3' },
      { label: 'Purity', value: 'Reported per lot on the certificate of analysis' },
    ],
    handling: [
      { label: 'Storage (sealed)', value: '-20 °C, protected from light' },
      { label: 'Storage (reconstituted)', value: '2-8 °C, short term' },
      { label: 'Reconstitution', value: 'Sterile water, per the receiving laboratory protocol' },
      { label: 'Shipping', value: 'Ambient with insulated packaging; cold-chain available on request' },
    ],
    documentation: STANDARD_DOCUMENTATION,
    status: 'available',
    featured: false,
  },
  {
    slug: 'nexphase-2t',
    code: 'NPL-010',
    name: 'NexPhase-2T',
    size: '10 mg',
    form: 'Lyophilized proprietary blend',
    area: 'Tissue & repair models',
    image: '/products/nexphase-2t.png',
    summary: 'House proprietary blend prepared for tissue and repair research models.',
    description:
      'A NexPhase Labs proprietary blend prepared in-house and supplied lyophilized. Full component identity and ratios are disclosed to verified research accounts under the terms of the account agreement. Lot-specific analytical documentation accompanies every vial.',
    identity: [
      { label: 'Composition', value: 'Proprietary blend - disclosed to verified accounts' },
      { label: 'Format', value: 'Lyophilized, single-vial presentation' },
      { label: 'Fill weight', value: '10 mg total' },
      { label: 'Purity', value: 'Component purity reported per lot on the certificate of analysis' },
    ],
    handling: [
      { label: 'Storage (sealed)', value: '-20 °C, protected from light' },
      { label: 'Storage (reconstituted)', value: '2-8 °C, short term' },
      { label: 'Reconstitution', value: 'Per the technical sheet supplied with the lot' },
      { label: 'Shipping', value: 'Cold-chain recommended' },
    ],
    documentation: [...STANDARD_DOCUMENTATION, 'Blend technical sheet (verified accounts)'],
    status: 'limited',
    featured: false,
  },
  {
    slug: 'nexphase-3r',
    code: 'NPL-011',
    name: 'NexPhase-3R',
    size: '10 mg',
    form: 'Lyophilized proprietary blend',
    area: 'Metabolic & endocrine models',
    image: '/products/nexphase-3r.png',
    summary: 'House proprietary blend prepared for metabolic and endocrine research models.',
    description:
      'A NexPhase Labs proprietary blend prepared in-house and supplied lyophilized. Full component identity and ratios are disclosed to verified research accounts under the terms of the account agreement. Lot-specific analytical documentation accompanies every vial.',
    identity: [
      { label: 'Composition', value: 'Proprietary blend - disclosed to verified accounts' },
      { label: 'Format', value: 'Lyophilized, single-vial presentation' },
      { label: 'Fill weight', value: '10 mg total' },
      { label: 'Purity', value: 'Component purity reported per lot on the certificate of analysis' },
    ],
    handling: [
      { label: 'Storage (sealed)', value: '-20 °C, protected from light' },
      { label: 'Storage (reconstituted)', value: '2-8 °C, short term' },
      { label: 'Reconstitution', value: 'Per the technical sheet supplied with the lot' },
      { label: 'Shipping', value: 'Cold-chain recommended' },
    ],
    documentation: [...STANDARD_DOCUMENTATION, 'Blend technical sheet (verified accounts)'],
    status: 'pre-order',
    featured: false,
  },
];

export const STATUS_LABEL: Record<ProductStatus, string> = {
  available: 'In catalog',
  limited: 'Limited lot',
  'pre-order': 'Pre-order',
};

export function getProduct(slug: string): Product | undefined {
  return products.find((product) => product.slug === slug);
}

export function featuredProducts(): Product[] {
  return products.filter((product) => product.featured);
}

export function productsByArea(area: ResearchArea): Product[] {
  return products.filter((product) => product.area === area);
}
