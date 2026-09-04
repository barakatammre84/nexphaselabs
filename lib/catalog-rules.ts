/**
 * Catalog schema rules, enforced in code.
 *
 * Every write to `products` and `product_variants` passes through
 * `validateProductInput` before it reaches D1. The rules mirror the header of
 * lib/catalog.ts and the "Never add to this site" list in CLAUDE.md. They are
 * not style checks; each one tracks language FDA has quoted as evidence of
 * intended human use in warning letters to peptide sellers.
 *
 * The form cannot collect what this module rejects, and the seed cannot load
 * it either. If a rule here is loosened, it must be loosened knowingly.
 */

import { validateHazard, type Hazard, type HazardInput } from '@/lib/hazard';
import type { ChemicalClass, ProductStatus } from '@/lib/catalog';

/* ------------------------------------------------------------------------ */
/* Whitelists                                                                */
/* ------------------------------------------------------------------------ */

/**
 * Laboratory presentations only. Nothing here describes a product for
 * administration: no capsule, spray, pen, cartridge, pre-filled syringe or
 * dropper. A vial of solid is a reagent presentation; a nasal spray is not.
 */
export const PRESENTATIONS = [
  'Solid, sealed vial',
  'Lyophilised solid, sealed vial',
  'Solid, amber vial',
  'Solution in DMSO, sealed vial',
] as const;
export type Presentation = (typeof PRESENTATIONS)[number];
export const DEFAULT_PRESENTATION: Presentation = 'Solid, sealed vial';

/**
 * Laboratory solvents. A solubility figure is chemistry when the solvent is
 * one of these; a volume of bacteriostatic water is dosing. Matching is on
 * the leading solvent name so "PBS (pH 7.2)" and "DMSO, with sonication"
 * both resolve.
 */
export const LAB_SOLVENTS = [
  'DMSO',
  'DMF',
  'Ethanol',
  'Methanol',
  'Acetonitrile',
  'Water',
  'PBS',
  'Acetic acid',
  'Ammonium hydroxide',
  'Ammonium bicarbonate',
  'Sodium bicarbonate',
  'Tris buffer',
  'HEPES buffer',
  'Chloroform',
  'Dichloromethane',
] as const;

const SOLVENT_PATTERN = new RegExp(
  `^(?:${LAB_SOLVENTS.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?:\\b|[\\s,(])`,
  'i',
);

/** Solvents that are explicitly dosing vehicles, not laboratory solvents. */
const FORBIDDEN_SOLVENT =
  /bacteriostatic|sterile\s+water\s+for\s+injection|saline/i;

/* ------------------------------------------------------------------------ */
/* Forbidden language                                                        */
/* ------------------------------------------------------------------------ */

type Rule = { pattern: RegExp; reason: string };

const FORBIDDEN: Rule[] = [
  // Dose, route, schedule — verbatim category quoted against PekCura.
  {
    pattern:
      /\b(dos(e|es|ed|ing|age|ages)|mcg\/kg|mg\/kg|iu\b|units?\s+per|per\s+(day|week|dose)|(once|twice|three\s+times)\s+(daily|weekly|a\s+day|a\s+week)|\bdaily\b|\bweekly\b|\bbedtime\b)/i,
    reason: 'dose or dosing schedule',
  },
  {
    pattern:
      /\b(subcutaneous(ly)?|intramuscular(ly)?|intravenous(ly)?|intranasal(ly)?|sublingual(ly)?|transdermal(ly)?|topical(ly)?|oral(ly)?\b|inject(ed|ion|ions|ing|able)?|injections?|syringe|needle|insulin|nasal\s+spray|\bpen\b|cartridge)/i,
    reason: 'route of administration or administration device',
  },
  {
    pattern:
      /\b(reconstitut\w*|bacteriostatic|\bbac\s*water|dilut(e|ed|ion)\s+(with|in|to)\s+(a\s+)?(final\s+)?(volume\s+of\s+)?\d|per\s+vial\s+(add|use)|add\s+\d+(\.\d+)?\s*m?l\b)/i,
    reason: 'reconstitution instruction',
  },
  {
    pattern:
      /\b(stack(ed|ing)?|cycl(e|es|ing)|protocol|regimen|how\s+to\s+use|directions\s+for\s+use)\b/i,
    reason: 'stacking, cycling or protocol content',
  },
  // Structure/function claims.
  {
    pattern:
      /\b(appetite|satiety|fat[\s-]?(loss|burn\w*|oxidation)|weight[\s-]?loss|energy\s+(levels?|boost\w*|support)|boosts?\s+energy|recover(y|ing)|sleep|muscle\s+(growth|mass|gain\w*|build\w*|recovery)|lean\s+muscle|inflammat\w*|heal(s|ing|ed)?|repair(s|ing|ed)?|cognit\w*|anti[\s-]?ag(e|ing)|longevity|immune|libido|wellness|performance|endurance)\b/i,
    reason: 'structure/function claim',
  },
  // Disease names and clinical framing.
  {
    pattern:
      /\b(diabet\w*|obes\w*|cancer|tumou?r|alzheimer|parkinson|arthritis|depress\w*|anxiety|ptsd|adhd|crohn|colitis|ulcer\w*|tendon\w*|ligament|osteo\w*|hiv|aids|lipodystrophy|covid|infection|injur(y|ies)|wound\w*|disease|disorder|syndrome|medical\s+condition|symptom\w*|therap\w*|treat(s|ed|ing|ment|ments)?|cure\w*|prevent\w*|patient\w*|clinical|efficacy|placebo|trial\w*)\b/i,
    reason: 'disease name, indication or clinical claim',
  },
  // Approved-drug brand names and approval references.
  {
    pattern:
      /\b(ozempic|wegovy|mounjaro|zepbound|egrifta|saxenda|victoza|rybelsus|trulicity|semaglutide|tirzepatide|liraglutide|tesamorelin|fda[\s-]?approv\w*|approved\s+by|prescription|pharmaceutical\s+grade|human\s+grade)\b/i,
    reason: 'approved-drug brand name or approval reference',
  },
  // Human or animal use.
  {
    pattern:
      /\b(human\s+use|for\s+humans?|in\s+humans?|human\s+consumption|consum(e|ed|ption)|ingest\w*|supplement\w*|nutraceutical|cosmetic|skin\s*care|anti[\s-]?wrinkle|hair\s+growth|bodybuild\w*|athlet\w*)\b/i,
    reason: 'human use, consumption or cosmetic framing',
  },
  // Testimonials and review framing.
  {
    pattern:
      /\b(testimonial\w*|review(s|ed)?\b|before\s+and\s+after|customers?\s+(say|report)|results?\s+(in|after)\s+\d)/i,
    reason: 'testimonial or results framing',
  },
];

/**
 * Terms that look like the forbidden set but are legitimate chemistry, and
 * must not trip the scanner. Checked before the forbidden rules.
 */
const ALLOWED_PHRASES: RegExp[] = [
  /\bsolid\b/i,
  /\bstock\s+solution/i,
  /\bin\s+vitro\b/i,
  /\bsonication\b/i,
  /\breversed?-phase\b/i,
  /\bredox\s+couple\b/i,
  /\bassay\b/i,
  /\bidentity\s+(is\s+)?confirmed\b/i,
  /\bcopper\s*\(ii\)/i,
  /\bnot\s+(a\s+)?hazardous\b/i,
  /\bsafety\s+data\s+sheet\b/i,
];

function stripAllowed(text: string): string {
  let out = text;
  for (const allowed of ALLOWED_PHRASES) out = out.replace(allowed, ' ');
  return out;
}

export type Violation = { field: string; reason: string; match: string };

/** Scan one free-text field. Returns every violation found. */
export function scanText(
  field: string,
  text: string | null | undefined,
): Violation[] {
  if (!text) return [];
  const cleaned = stripAllowed(text);
  const found: Violation[] = [];
  for (const rule of FORBIDDEN) {
    const m = cleaned.match(rule.pattern);
    if (m) found.push({ field, reason: rule.reason, match: m[0] });
  }
  return found;
}

/* ------------------------------------------------------------------------ */
/* Input shape and validation                                                */
/* ------------------------------------------------------------------------ */

export type SolubilityInput = {
  solvent: string;
  concentration: string;
  note?: string;
  source: string;
};
export type RelatedCasInput = { form: string; cas: string };
export type VariantInput = {
  sku?: string;
  quantity: string;
  presentation: string;
  sortOrder?: number;
  active?: boolean;
  /** Dollars as typed, e.g. "45" or "45.00"; blank means not priced. */
  listPrice?: string | null;
  institutionalPrice?: string | null;
  /** Normalised on validation. */
  listPriceCents?: number | null;
  institutionalPriceCents?: number | null;
};

const PRICE_PATTERN = /^\d{1,6}(?:\.\d{1,2})?$/;

/** "45" | "45.5" | "45.00" → cents; null for blank; NaN for malformed. */
export function parsePriceCents(
  value: string | null | undefined,
): number | null {
  const t = (value ?? '').trim().replace(/^\$/, '');
  if (!t) return null;
  if (!PRICE_PATTERN.test(t)) return Number.NaN;
  return Math.round(Number(t) * 100);
}

export type ProductInput = {
  code: string;
  slug: string;
  name: string;
  formalName: string;
  synonyms: string[];
  chemicalClass: string;
  casNumber: string;
  relatedCas: RelatedCasInput[];
  sequenceOneLetter?: string | null;
  sequenceThreeLetter?: string | null;
  molecularFormula: string;
  molecularWeight: string;
  exactMass?: string | null;
  smiles?: string | null;
  inchiKey?: string | null;
  pubchemCid?: string | null;
  purity: string;
  form: string;
  saltForm: string;
  solubility: SolubilityInput[];
  storageSolid: string;
  storageStock: string;
  stability: string;
  shipping: string;
  status: string;
  description: string;
  sourceNotes: string[];
  /** The validated classification, produced by `validateProductInput`. */
  hazard: Hazard | null;
  /** The classification as typed into the form, before validation. */
  hazardDraft?: HazardInput | null;
  hasSds: boolean;
  /** null, a repository asset `/products/<slug>.<ext>`, or an R2 key `products/<CODE>/image/<id>.<ext>` set by the upload tool. */
  image?: string | null;
  featured: boolean;
  /** Display order on the catalog index and home page (lower first). */
  sortOrder?: number | null;
  visibility: string;
  withdrawnReason?: string | null;
  variants: VariantInput[];
};

export type ValidateOptions = {
  /** Active chemical-class names from the database. When given, the product's class must be one of them. */
  classes?: string[];
};

const STATIC_IMAGE = /^\/products\/([a-z0-9-]+)\.(png|jpe?g|webp)$/;
const R2_IMAGE =
  /^products\/(NPL-\d{3,4})\/image\/[a-f0-9]{32}\.(png|jpg|webp)$/;

export const PRODUCT_STATUSES: ProductStatus[] = [
  'available',
  'limited',
  'enquire',
];
export const VISIBILITIES = ['draft', 'published', 'withdrawn'] as const;
export type Visibility = (typeof VISIBILITIES)[number];

const CODE_PATTERN = /^NPL-\d{3,4}$/;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CAS_PATTERN = /^\d{2,7}-\d{2}-\d$/;
const QUANTITY_PATTERN = /^\d+(?:\.\d+)?\s?(?:mg|g|ug|µg)$/;
/** "1419.5 g/mol", "663.43 g/mol", "1418.7 Da" */
const MASS_PATTERN = /^\d+(?:\.\d+)?\s?(?:g\/mol|Da)$/;
/** "10 mg/mL", "100 mg/mL", "5 mM", "50 µM" — a concentration, never a volume. */
const CONCENTRATION_PATTERN =
  /^(?:~|≥|>=|up to )?\d+(?:\.\d+)?\s?(?:mg|ug|µg|g)\/mL$|^(?:~|≥|>=|up to )?\d+(?:\.\d+)?\s?(?:mM|µM|uM|nM|M)$/;
/** Hill-style formula: element symbols with optional counts, optional charge. */
const FORMULA_PATTERN = /^(?:[A-Z][a-z]?\d*)+(?:[+-]\d*)?$/;
const SMILES_PATTERN = /^[A-Za-z0-9@+\-[\]()=#$%.\\/:*]+$/;
const SKU_PATTERN = /^NPL-\d{3,4}-[A-Z0-9.]{1,12}$/;
/**
 * "NexPhase-2T", "NPL-3R", "GLP-1-S": a brand or code prefix, a number, a
 * letter suffix — anywhere in the string, so "NexPhase-2T Complex" and
 * "Research NexPhase-2T" are caught too. "GLP-1" alone (no letter suffix) and
 * catalog codes like "NPL-001" do not match.
 */
const INVENTED_NAME_PATTERN =
  /\b(?:nexphase|npl|glp)[\s-]*\d+[\s-]*[a-z]{1,2}\b/i;
const BLEND_PATTERN =
  /\b(blend|blends|proprietary|undisclosed|complex\s+formula|matrix|stack)\b/i;

/** True when a displayed name is a brand code or a blend rather than a chemical identity. */
export function isInventedName(text: string): boolean {
  return INVENTED_NAME_PATTERN.test(text) || BLEND_PATTERN.test(text);
}

/** CAS check digit, per CAS registry rules. */
export function isValidCas(cas: string): boolean {
  if (!CAS_PATTERN.test(cas)) return false;
  const digits = cas.replace(/-/g, '');
  const body = digits.slice(0, -1);
  const check = Number(digits.slice(-1));
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    sum += Number(body[body.length - 1 - i]) * (i + 1);
  }
  return sum % 10 === check;
}

/** Deterministic SKU from product code and pack quantity: NPL-001 + "5 mg" → NPL-001-5MG. */
export function skuFor(code: string, quantity: string): string {
  const q = quantity.replace(/\s+/g, '').replace('µg', 'UG').toUpperCase();
  return `${code}-${q}`;
}

export function isLabSolvent(solvent: string): boolean {
  return (
    SOLVENT_PATTERN.test(solvent.trim()) && !FORBIDDEN_SOLVENT.test(solvent)
  );
}

export function isPresentation(value: string): value is Presentation {
  return (PRESENTATIONS as readonly string[]).includes(value);
}

export type ValidationResult =
  | { ok: true; value: ProductInput }
  | { ok: false; errors: string[]; violations: Violation[] };

/**
 * Validate a product before it is written. Returns either the normalised
 * value or every problem found, so the form can show them all at once.
 */
export function validateProductInput(
  raw: ProductInput,
  options: ValidateOptions = {},
): ValidationResult {
  const errors: string[] = [];
  const violations: Violation[] = [];
  const t = (s: string | null | undefined) => (s ?? '').trim();

  const value: ProductInput = {
    ...raw,
    code: t(raw.code).toUpperCase(),
    slug: t(raw.slug).toLowerCase(),
    name: t(raw.name),
    formalName: t(raw.formalName),
    synonyms: (raw.synonyms ?? []).map(t).filter(Boolean),
    chemicalClass: t(raw.chemicalClass),
    casNumber: t(raw.casNumber),
    relatedCas: (raw.relatedCas ?? []).map((r) => ({
      form: t(r.form),
      cas: t(r.cas),
    })),
    sequenceOneLetter: t(raw.sequenceOneLetter) || null,
    sequenceThreeLetter: t(raw.sequenceThreeLetter) || null,
    molecularFormula: t(raw.molecularFormula),
    molecularWeight: t(raw.molecularWeight),
    exactMass: t(raw.exactMass) || null,
    smiles: t(raw.smiles) || null,
    inchiKey: t(raw.inchiKey) || null,
    pubchemCid: t(raw.pubchemCid) || null,
    purity: t(raw.purity),
    form: t(raw.form),
    saltForm: t(raw.saltForm),
    solubility: (raw.solubility ?? []).map((s) => ({
      solvent: t(s.solvent),
      concentration: t(s.concentration),
      note: t(s.note) || undefined,
      source: t(s.source),
    })),
    storageSolid: t(raw.storageSolid),
    storageStock: t(raw.storageStock),
    stability: t(raw.stability),
    shipping: t(raw.shipping),
    status: t(raw.status),
    description: t(raw.description),
    sourceNotes: (raw.sourceNotes ?? []).map(t).filter(Boolean),
    hazard: raw.hazard ?? null,
    hazardDraft: raw.hazardDraft ?? null,
    hasSds: Boolean(raw.hasSds),
    image: t(raw.image) || null,
    featured: Boolean(raw.featured),
    sortOrder:
      raw.sortOrder === undefined ||
      raw.sortOrder === null ||
      (raw.sortOrder as unknown) === ''
        ? null
        : Number(raw.sortOrder),
    visibility: t(raw.visibility) || 'draft',
    withdrawnReason: t(raw.withdrawnReason) || null,
    variants: (raw.variants ?? []).map((v, i) => ({
      quantity: t(v.quantity),
      presentation: t(v.presentation) || DEFAULT_PRESENTATION,
      sku: t(v.sku) || undefined,
      sortOrder: v.sortOrder ?? i,
      active: v.active ?? true,
      listPrice: t(v.listPrice) || null,
      institutionalPrice: t(v.institutionalPrice) || null,
      listPriceCents: v.listPriceCents ?? null,
      institutionalPriceCents: v.institutionalPriceCents ?? null,
    })),
  };

  // Identity
  if (!CODE_PATTERN.test(value.code))
    errors.push('Code must look like NPL-001.');
  if (!SLUG_PATTERN.test(value.slug))
    errors.push('Slug must be lowercase letters, digits and hyphens.');
  if (!value.name) errors.push('Name is required.');
  // Invented brand-code names ("NexPhase-2T", "GLP-1-S") and undisclosed blends
  // are not chemical identities. FDA issued seven letters in one day against
  // exactly this pattern; the withdrawn NexPhase-2T/-3R entries are in lib/catalog.ts.
  if (isInventedName(value.name)) {
    errors.push(
      'Product name must be a chemical identity, not an invented brand code or a blend.',
    );
  }
  if (isInventedName(value.formalName)) {
    errors.push(
      'Formal name must be an IUPAC or peptide name; a blend has no chemical identity.',
    );
  }
  for (const s of value.synonyms) {
    if (isInventedName(s))
      errors.push(
        `Synonym "${s}" is an invented brand code or blend name, not a chemical identity.`,
      );
  }
  if (!value.formalName)
    errors.push('Formal (IUPAC or peptide) name is required.');
  if (!value.chemicalClass) {
    errors.push('Chemical class is required.');
  } else if (
    options.classes &&
    !options.classes.includes(value.chemicalClass)
  ) {
    errors.push(
      `Chemical class must be one of the active classes: ${options.classes.join(', ')}.`,
    );
  }
  if (value.image) {
    // Rule 5: a photograph belongs to exactly one product. A repository asset must carry this
    // product's slug; an uploaded key must carry this product's code.
    const r2 = value.image.match(R2_IMAGE);
    const staticMatch = value.image.match(STATIC_IMAGE);
    if (
      !(staticMatch && staticMatch[1] === value.slug) &&
      !(r2 && r2[1] === value.code)
    ) {
      errors.push(
        'Photograph must be uploaded through the product page; the path is not a photograph of this product.',
      );
    }
  }
  if (
    value.sortOrder !== null &&
    value.sortOrder !== undefined &&
    (!Number.isInteger(value.sortOrder) ||
      value.sortOrder < 0 ||
      value.sortOrder > 9999)
  ) {
    errors.push('Display order must be a whole number from 0 to 9999.');
  }
  if (!isValidCas(value.casNumber))
    errors.push('CAS number is malformed or fails its check digit.');
  for (const r of value.relatedCas) {
    if (!r.form)
      errors.push('Each related CAS entry needs a form (e.g. "Acetate salt").');
    if (!isValidCas(r.cas))
      errors.push(
        `Related CAS ${r.cas || '(empty)'} is malformed or fails its check digit.`,
      );
  }
  if (value.sequenceOneLetter && !/^[A-Z]{2,}$/.test(value.sequenceOneLetter)) {
    errors.push('One-letter sequence must be uppercase letters only.');
  }
  if (!FORMULA_PATTERN.test(value.molecularFormula)) {
    errors.push(
      'Molecular formula must be a Hill-style formula such as C62H98N16O22.',
    );
  }
  if (!MASS_PATTERN.test(value.molecularWeight)) {
    errors.push(
      'Molecular weight must be a number with unit, e.g. "1419.5 g/mol".',
    );
  }
  if (value.exactMass && !MASS_PATTERN.test(value.exactMass)) {
    errors.push('Exact mass must be a number with unit, e.g. "1418.7 Da".');
  }
  if (value.smiles && !SMILES_PATTERN.test(value.smiles)) {
    errors.push('SMILES may only contain SMILES symbols, with no spaces.');
  }
  if (value.inchiKey && !/^[A-Z]{14}-[A-Z]{10}-[A-Z]$/.test(value.inchiKey)) {
    errors.push('InChI Key format is invalid.');
  }
  if (value.pubchemCid && !/^\d+$/.test(value.pubchemCid))
    errors.push('PubChem CID must be numeric.');

  // Specification
  if (!value.purity)
    errors.push('Purity is required and must state the analytical method.');
  else if (!/hplc|lc-ms|uplc|nmr|gc/i.test(value.purity)) {
    errors.push('Purity must state the analytical method (e.g. "by HPLC").');
  }
  if (!value.form) errors.push('Physical form is required.');
  if (!value.saltForm) errors.push('Salt / counter-ion is required.');
  for (const s of value.solubility) {
    if (!s.solvent || !s.concentration)
      errors.push('Each solubility entry needs a solvent and a concentration.');
    if (s.concentration && !CONCENTRATION_PATTERN.test(s.concentration)) {
      errors.push(
        `Solubility "${s.concentration}" must be a concentration such as "10 mg/mL" or "5 mM".`,
      );
    }
    if (s.solvent && !isLabSolvent(s.solvent)) {
      errors.push(
        `"${s.solvent}" is not an accepted laboratory solvent. Accepted: ${LAB_SOLVENTS.join(', ')}.`,
      );
    }
    if (!s.source)
      errors.push(`Solubility in ${s.solvent || '(solvent)'} needs a source.`);
  }
  if (!value.storageSolid) errors.push('Storage (solid) is required.');
  if (!value.storageStock) errors.push('Storage (stock solution) is required.');
  if (!value.stability) errors.push('Stability is required.');
  if (!value.shipping) errors.push('Shipping condition is required.');
  if (!(PRODUCT_STATUSES as string[]).includes(value.status)) {
    errors.push(`Status must be one of: ${PRODUCT_STATUSES.join(', ')}.`);
  }
  if (!value.description) errors.push('Description is required.');

  // Provenance — every published figure needs a source (CLAUDE.md rule 4).
  if (value.sourceNotes.length === 0)
    errors.push('At least one source note is required before saving.');

  // GHS classification. Left blank the product is simply unclassified, which
  // is a state the hazard communication programme reports rather than hides.
  const draft = raw.hazardDraft;
  const drafted =
    draft &&
    Boolean(
      draft.signalWord?.trim() ||
        draft.source?.trim() ||
        draft.reviewedBy?.trim() ||
        draft.reviewedAt?.trim() ||
        draft.pictograms?.length ||
        draft.hazardStatements?.length ||
        draft.precautionaryStatements?.length ||
        draft.classification?.length,
    );
  if (drafted && draft) {
    const checked = validateHazard(draft);
    if (checked.ok) {
      value.hazard = checked.value;
    } else {
      errors.push(...checked.errors);
      violations.push(...checked.violations);
    }
  } else {
    value.hazard = null;
  }

  // Visibility
  if (!(VISIBILITIES as readonly string[]).includes(value.visibility)) {
    errors.push(`Visibility must be one of: ${VISIBILITIES.join(', ')}.`);
  }
  if (value.visibility === 'withdrawn' && !value.withdrawnReason) {
    errors.push('A withdrawn product must record the reason.');
  }

  // Variants
  if (value.variants.length === 0)
    errors.push('At least one pack size is required.');
  const skus = new Set<string>();
  for (const v of value.variants) {
    if (!QUANTITY_PATTERN.test(v.quantity)) {
      errors.push(
        `Pack size "${v.quantity}" must be a mass such as "5 mg", "1 g" or "500 ug".`,
      );
    }
    if (!isPresentation(v.presentation)) {
      errors.push(
        `Presentation "${v.presentation}" is not a laboratory presentation. Accepted: ${PRESENTATIONS.join('; ')}.`,
      );
    }
    const sku = v.sku ?? skuFor(value.code, v.quantity);
    if (!SKU_PATTERN.test(sku)) errors.push(`SKU "${sku}" is malformed.`);
    if (skus.has(sku)) errors.push(`Duplicate SKU ${sku}.`);
    skus.add(sku);
    v.sku = sku;
    for (const [label, key, target] of [
      ['List price', 'listPrice', 'listPriceCents'],
      ['Institutional price', 'institutionalPrice', 'institutionalPriceCents'],
    ] as const) {
      const cents =
        v[key] != null ? parsePriceCents(v[key]) : (v[target] ?? null);
      if (cents !== null && Number.isNaN(cents))
        errors.push(
          `${label} for ${v.quantity} must be a dollar amount such as 45 or 45.00.`,
        );
      else v[target] = cents;
    }
  }

  // Language scan across every field that renders on the site, including
  // JSON entries and the numeric-looking ones (which are also format-checked
  // above, so prose cannot hide in them).
  const textFields: [string, string | null | undefined][] = [
    ['name', value.name],
    ['formalName', value.formalName],
    ['description', value.description],
    ['molecularFormula', value.molecularFormula],
    ['molecularWeight', value.molecularWeight],
    ['exactMass', value.exactMass],
    ['smiles', value.smiles],
    ['image', value.image],
    ['purity', value.purity],
    ['form', value.form],
    ['saltForm', value.saltForm],
    ['storageSolid', value.storageSolid],
    ['storageStock', value.storageStock],
    ['stability', value.stability],
    ['shipping', value.shipping],
    ['withdrawnReason', value.withdrawnReason],
    ...value.synonyms.map((s, i): [string, string] => [`synonyms[${i}]`, s]),
    ...value.sourceNotes.map((s, i): [string, string] => [
      `sourceNotes[${i}]`,
      s,
    ]),
    ...value.solubility.flatMap((s, i): [string, string | undefined][] => [
      [`solubility[${i}].solvent`, s.solvent],
      [`solubility[${i}].concentration`, s.concentration],
      [`solubility[${i}].note`, s.note],
      [`solubility[${i}].source`, s.source],
    ]),
    ...value.relatedCas.map((r, i): [string, string] => [
      `relatedCas[${i}].form`,
      r.form,
    ]),
    ...value.variants.map((v, i): [string, string] => [
      `variants[${i}].presentation`,
      v.presentation,
    ]),
  ];
  for (const [field, text] of textFields)
    violations.push(...scanText(field, text));

  if (errors.length || violations.length)
    return { ok: false, errors, violations };
  return {
    ok: true,
    value: { ...value, chemicalClass: value.chemicalClass as ChemicalClass },
  };
}
