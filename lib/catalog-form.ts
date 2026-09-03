import type { CatalogProduct } from '@/lib/catalog-data';
import { DEFAULT_PRESENTATION, type ProductInput } from '@/lib/catalog-rules';

/**
 * Translate between the catalog manager form and ProductInput.
 *
 * Multi-value fields use one entry per line with " | " separators, which is
 * simpler to fill in reliably than dynamic row widgets and is validated in
 * full by lib/catalog-rules.ts before anything is written.
 */

export type FormValues = Record<string, string>;

export const FORM_FIELDS = [
  'code',
  'slug',
  'name',
  'formalName',
  'synonyms',
  'chemicalClass',
  'casNumber',
  'relatedCas',
  'sequenceOneLetter',
  'sequenceThreeLetter',
  'molecularFormula',
  'molecularWeight',
  'exactMass',
  'smiles',
  'inchiKey',
  'pubchemCid',
  'purity',
  'form',
  'saltForm',
  'solubility',
  'storageSolid',
  'storageStock',
  'stability',
  'shipping',
  'status',
  'description',
  'sourceNotes',
  'hasSds',
  'image',
  'featured',
  'visibility',
  'withdrawnReason',
  'variants',
  'note',
] as const;
export type FormField = (typeof FORM_FIELDS)[number];

function lines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

function cells(line: string): string[] {
  return line.split('|').map((c) => c.trim());
}

/** Pull every known field out of FormData as plain strings. */
export function formValues(data: FormData): FormValues {
  const out: FormValues = {};
  for (const field of FORM_FIELDS) {
    const raw = data.get(field);
    out[field] = typeof raw === 'string' ? raw : raw ? 'on' : '';
  }
  return out;
}

export function valuesToInput(v: FormValues): ProductInput {
  return {
    code: v.code ?? '',
    slug: v.slug ?? '',
    name: v.name ?? '',
    formalName: v.formalName ?? '',
    synonyms: (v.synonyms ?? '')
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean),
    chemicalClass: v.chemicalClass ?? '',
    casNumber: v.casNumber ?? '',
    relatedCas: lines(v.relatedCas ?? '').map((line) => {
      const [form = '', cas = ''] = cells(line);
      return { form, cas };
    }),
    sequenceOneLetter: v.sequenceOneLetter || null,
    sequenceThreeLetter: v.sequenceThreeLetter || null,
    molecularFormula: v.molecularFormula ?? '',
    molecularWeight: v.molecularWeight ?? '',
    exactMass: v.exactMass || null,
    smiles: v.smiles || null,
    inchiKey: v.inchiKey || null,
    pubchemCid: v.pubchemCid || null,
    purity: v.purity ?? '',
    form: v.form ?? '',
    saltForm: v.saltForm ?? '',
    solubility: lines(v.solubility ?? '').map((line) => {
      const [solvent = '', concentration = '', source = '', note = ''] = cells(line);
      return { solvent, concentration, source, note: note || undefined };
    }),
    storageSolid: v.storageSolid ?? '',
    storageStock: v.storageStock ?? '',
    stability: v.stability ?? '',
    shipping: v.shipping ?? '',
    status: v.status ?? '',
    description: v.description ?? '',
    sourceNotes: lines(v.sourceNotes ?? ''),
    hasSds: v.hasSds === 'on' || v.hasSds === 'true',
    image: v.image || null,
    featured: v.featured === 'on' || v.featured === 'true',
    visibility: v.visibility || 'draft',
    withdrawnReason: v.withdrawnReason || null,
    variants: lines(v.variants ?? '').map((line, i) => {
      const [quantity = '', presentation = '', listPrice = '', institutionalPrice = ''] = cells(line);
      return {
        quantity,
        presentation: presentation || DEFAULT_PRESENTATION,
        sortOrder: i,
        listPrice: listPrice || null,
        institutionalPrice: institutionalPrice || null,
      };
    }),
  };
}

/** Initial form values for editing an existing product. */
export function productToValues(p: CatalogProduct): FormValues {
  return {
    code: p.code,
    slug: p.slug,
    name: p.name,
    formalName: p.formalName,
    synonyms: p.synonyms.join(', '),
    chemicalClass: p.chemicalClass,
    casNumber: p.casNumber,
    relatedCas: (p.relatedCas ?? []).map((r) => `${r.form} | ${r.cas}`).join('\n'),
    sequenceOneLetter: p.sequenceOneLetter ?? '',
    sequenceThreeLetter: p.sequenceThreeLetter ?? '',
    molecularFormula: p.molecularFormula,
    molecularWeight: p.molecularWeight,
    exactMass: p.exactMass ?? '',
    smiles: p.smiles ?? '',
    inchiKey: p.inchiKey ?? '',
    pubchemCid: p.pubchemCid ?? '',
    purity: p.purity,
    form: p.form,
    saltForm: p.saltForm,
    solubility: p.solubility
      .map((s) => [s.solvent, s.concentration, s.source, s.note ?? ''].join(' | ').replace(/ \| $/, ''))
      .join('\n'),
    storageSolid: p.storageSolid,
    storageStock: p.storageStock,
    stability: p.stability,
    shipping: p.shipping,
    status: p.status,
    description: p.description,
    sourceNotes: p.sourceNotes.join('\n'),
    hasSds: p.hasSds ? 'on' : '',
    image: p.image ?? '',
    featured: p.featured ? 'on' : '',
    visibility: p.visibility,
    withdrawnReason: p.withdrawnReason ?? '',
    variants: p.variants
      .filter((v) => v.active)
      .map((v) => {
        const dollars = (c: number | null) => (c === null ? '' : (c / 100).toFixed(2));
        const cells = [v.quantity, v.presentation, dollars(v.listPriceCents), dollars(v.institutionalPriceCents)];
        while (cells.length > 2 && cells[cells.length - 1] === '') cells.pop();
        return cells.join(' | ');
      })
      .join('\n'),
    note: '',
  };
}

export const EMPTY_VALUES: FormValues = Object.fromEntries(FORM_FIELDS.map((f) => [f, ''])) as FormValues;
