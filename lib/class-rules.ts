import { scanText, type Violation } from '@/lib/catalog-rules';

/**
 * Rules for chemical classes. A class describes what a material IS
 * (peptide, nucleotide, coordination complex), never what it is studied for
 * or does in an organism. CLAUDE.md rule 2: chemical class is the only
 * classification axis; "Tissue & repair models" was removed for exactly
 * this reason and the tool must not let it back in.
 */

export type ClassInput = {
  id: string;
  name: string;
  blurb: string;
  sortOrder: number | string;
  active: boolean;
};

export type ClassValidation =
  | {
      ok: true;
      value: {
        id: string;
        name: string;
        blurb: string;
        sortOrder: number;
        active: boolean;
      };
      violations: Violation[];
    }
  | { ok: false; errors: string[]; violations: Violation[] };

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Words that frame a group by indication, effect or research area rather than chemistry. */
const INDICATION_WORDS =
  /\b(repair|recovery|tissue|wound|healing|(?<!molecular[- ])weight|(?<!\w)fat|metabolic|cognitive|cognition|nootropic|longevity|anti-?ag(e|ing)|wellness|performance|muscle|sleep|immune|inflammat\w*|hormon\w*|growth|therap\w*|treatment|disease|health|beauty|skin\s*care|vitality|energy|libido|sexual|mood|stress|focus)\b/i;

export function validateClassInput(raw: ClassInput): ClassValidation {
  const errors: string[] = [];
  const violations: Violation[] = [];
  const id = (raw.id ?? '').trim().toLowerCase();
  const name = (raw.name ?? '').trim().replace(/\s+/g, ' ');
  const blurb = (raw.blurb ?? '').trim().replace(/\s+/g, ' ');
  const sortOrder =
    typeof raw.sortOrder === 'number'
      ? raw.sortOrder
      : Number((raw.sortOrder ?? '').toString().trim() || '0');

  if (!ID_PATTERN.test(id) || id.length < 2 || id.length > 40)
    errors.push(
      'Anchor must be 2–40 characters of lowercase letters, digits and hyphens (it is the URL anchor).',
    );
  if (name.length < 2 || name.length > 60)
    errors.push('Name must be 2–60 characters.');
  if (blurb.length > 300)
    errors.push('Description must be 300 characters or fewer.');
  if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 999)
    errors.push('Display order must be a whole number from 0 to 999.');

  for (const [field, text] of [
    ['name', name],
    ['blurb', blurb],
  ] as const) {
    const m = text.match(INDICATION_WORDS);
    if (m)
      errors.push(
        `${field === 'name' ? 'Name' : 'Description'} frames the class by indication or effect ("${m[0]}"). Classes describe chemistry only.`,
      );
    violations.push(...scanText(field, text));
  }

  if (errors.length || violations.length)
    return { ok: false, errors, violations };
  return {
    ok: true,
    value: { id, name, blurb, sortOrder, active: Boolean(raw.active) },
    violations: [],
  };
}
