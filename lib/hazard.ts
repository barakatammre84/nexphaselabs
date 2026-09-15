import { scanText, type Violation } from '@/lib/catalog-rules';

/**
 * GHS hazard classification, container labels, and what may be stated on one.
 *
 * Pure. Deciding whether a label is fit to go on a vial is separable from
 * drawing it, and it is the part that matters: an under-labelled container is
 * an OSHA citation, and an over-labelled one is a false statement about a
 * material somebody is about to handle.
 *
 * The programme this supports is due 20 November 2026.
 */

export const GHS_PICTOGRAMS = {
  GHS01: 'Exploding bomb',
  GHS02: 'Flame',
  GHS03: 'Flame over circle',
  GHS04: 'Gas cylinder',
  GHS05: 'Corrosion',
  GHS06: 'Skull and crossbones',
  GHS07: 'Exclamation mark',
  GHS08: 'Health hazard',
  GHS09: 'Environment',
} as const;

export type PictogramCode = keyof typeof GHS_PICTOGRAMS;

export const PICTOGRAM_CODES = Object.keys(GHS_PICTOGRAMS) as PictogramCode[];

export function isPictogramCode(value: string): value is PictogramCode {
  return value in GHS_PICTOGRAMS;
}

export const SIGNAL_WORDS = ['danger', 'warning', 'none'] as const;
export type SignalWord = (typeof SIGNAL_WORDS)[number];

export const SIGNAL_WORD_LABEL: Record<SignalWord, string> = {
  danger: 'DANGER',
  warning: 'WARNING',
  none: 'No signal word assigned',
};

export type Statement = { code: string; text: string };

export type Hazard = {
  signalWord: SignalWord;
  pictograms: string[];
  hazardStatements: Statement[];
  precautionaryStatements: Statement[];
  classification: string[];
  source: string;
  dissent: string | null;
  reviewedBy: string;
  reviewedAt: string;
};

const H_CODE = /^H\d{3}[A-Za-z]?$/;
const P_CODE = /^P\d{3}(\+P\d{3})*$/;

/* ------------------------------------------------------------------------ */
/* Parsing                                                                    */
/* ------------------------------------------------------------------------ */

/** `H315 Causes skin irritation.` → `{ code, text }`. */
export function parseStatement(line: string): Statement | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const match = /^([A-Za-z0-9+]+)\s+(.*)$/.exec(trimmed);
  if (!match) return null;
  const code = match[1].toUpperCase();
  const text = match[2].trim();
  if (!text) return null;
  return { code, text };
}

export function formatStatement(statement: Statement): string {
  return `${statement.code} ${statement.text}`;
}

/* ------------------------------------------------------------------------ */
/* Validation                                                                 */
/* ------------------------------------------------------------------------ */

export type HazardInput = {
  signalWord: string;
  pictograms: string[];
  hazardStatements: string[];
  precautionaryStatements: string[];
  classification: string[];
  source: string;
  dissent?: string | null;
  reviewedBy: string;
  reviewedAt: string;
};

export type HazardValidation =
  | { ok: true; value: Hazard }
  | { ok: false; errors: string[]; violations: Violation[] };

/**
 * Validate a hazard classification as entered.
 *
 * The rules that carry weight:
 *  - A classification must say where it came from. Same attributability rule
 *    the rest of the catalog follows.
 *  - `none` means the material is not classified as hazardous, and cannot
 *    then carry pictograms or hazard statements — a label saying both is
 *    incoherent to the person reading it.
 *  - Anything other than `none` needs at least one hazard statement. A signal
 *    word with nothing to qualify it tells a handler nothing.
 */
export function validateHazard(input: HazardInput): HazardValidation {
  const errors: string[] = [];
  const violations: Violation[] = [];

  const signalWord = String(input.signalWord ?? '').trim().toLowerCase();
  if (!(SIGNAL_WORDS as readonly string[]).includes(signalWord)) {
    errors.push('Choose a signal word: danger, warning, or none.');
  }

  const pictograms: string[] = [];
  for (const raw of input.pictograms) {
    const code = raw.trim().toUpperCase();
    if (!code) continue;
    if (!isPictogramCode(code)) {
      errors.push(`${code} is not a GHS pictogram code (GHS01 to GHS09).`);
      continue;
    }
    if (!pictograms.includes(code)) pictograms.push(code);
  }

  const hazardStatements: Statement[] = [];
  for (const raw of input.hazardStatements) {
    const parsed = parseStatement(raw);
    if (!parsed) {
      errors.push(`Could not read the hazard statement "${raw.trim()}". Use "H315 Causes skin irritation."`);
      continue;
    }
    if (!H_CODE.test(parsed.code)) {
      errors.push(`${parsed.code} is not an H-code.`);
      continue;
    }
    hazardStatements.push(parsed);
  }

  const precautionaryStatements: Statement[] = [];
  for (const raw of input.precautionaryStatements) {
    const parsed = parseStatement(raw);
    if (!parsed) {
      errors.push(`Could not read the precautionary statement "${raw.trim()}". Use "P264 Wash hands thoroughly after handling."`);
      continue;
    }
    if (!P_CODE.test(parsed.code)) {
      errors.push(`${parsed.code} is not a P-code.`);
      continue;
    }
    precautionaryStatements.push(parsed);
  }

  const classification = input.classification.map((c) => c.trim()).filter(Boolean);
  const source = String(input.source ?? '').trim();
  const dissent = String(input.dissent ?? '').trim() || null;
  const reviewedBy = String(input.reviewedBy ?? '').trim();
  const reviewedAt = String(input.reviewedAt ?? '').trim();

  if (!source) {
    errors.push('Record where this classification came from — the SDS or supplier it is taken from.');
  }
  if (!reviewedBy) errors.push('Record who reviewed this classification.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reviewedAt)) {
    errors.push('Record the date of review as YYYY-MM-DD.');
  }

  if (signalWord === 'none') {
    if (pictograms.length > 0) {
      errors.push('A material with no signal word cannot carry pictograms. Remove them, or assign a signal word.');
    }
    if (hazardStatements.length > 0) {
      errors.push('A material with no signal word cannot carry hazard statements. Remove them, or assign a signal word.');
    }
  } else {
    if (hazardStatements.length === 0) {
      errors.push('A signal word needs at least one hazard statement to qualify it.');
    }
    // 29 CFR 1910.1200(f)(1)(vi) lists precautionary statements among the six
    // elements a container label must bear. A classification saved without one
    // would print a label missing a required element.
    if (precautionaryStatements.length === 0) {
      errors.push(
        'At least one precautionary statement is required — a label must carry one (29 CFR 1910.1200(f)(1)(vi)).',
      );
    }
  }

  // Everything here reaches a container label and the product page.
  const scanned: [string, string][] = [
    ['Hazard source', source],
    ['Hazard dissent', dissent ?? ''],
    ...classification.map((c, i): [string, string] => [`Classification ${i + 1}`, c]),
    ...hazardStatements.map((s): [string, string] => [`Hazard statement ${s.code}`, s.text]),
    ...precautionaryStatements.map((s): [string, string] => [`Precautionary statement ${s.code}`, s.text]),
  ];
  for (const [field, value] of scanned) violations.push(...scanText(field, value));

  if (errors.length > 0 || violations.length > 0) return { ok: false, errors, violations };

  return {
    ok: true,
    value: {
      signalWord: signalWord as SignalWord,
      pictograms,
      hazardStatements,
      precautionaryStatements,
      classification,
      source,
      dissent,
      reviewedBy,
      reviewedAt,
    },
  };
}

/* ------------------------------------------------------------------------ */
/* Labels                                                                     */
/* ------------------------------------------------------------------------ */

/**
 * Label stock, in points. A workplace label has no mandated size, but a label
 * that does not fit the container is not a label, so the sizes here are the
 * ones actually stocked: a vial wrap, a bottle label and an outer-carton
 * label.
 */
export const LABEL_SIZES = {
  vial: { label: 'Vial, 51 × 25 mm', width: 144, height: 72 },
  bottle: { label: 'Bottle, 102 × 51 mm', width: 288, height: 144 },
  carton: { label: 'Carton, 102 × 76 mm', width: 288, height: 216 },
} as const;

export type LabelSize = keyof typeof LABEL_SIZES;

export function isLabelSize(value: string): value is LabelSize {
  return value in LABEL_SIZES;
}

/** Who is responsible for the material, as a label must state. */
export type ResponsibleParty = {
  name: string;
  address: string | null;
  telephone: string | null;
};

export type LabelSubject = {
  productCode: string;
  productName: string;
  casNumber: string;
  lotNumber: string | null;
  packSize: string | null;
  hazard: Hazard | null;
  responsibleParty: ResponsibleParty;
  /** GHS codes for which official pictogram artwork has been supplied. */
  artworkAvailable: string[];
};

/**
 * Everything that must be true before a label may be printed for a container.
 *
 * 29 CFR 1910.1200(f)(1) requires the product identifier, signal word,
 * hazard statements, pictograms, precautionary statements, and the name,
 * address and telephone number of the responsible party. Each of those is
 * checked here, because a label missing one of them is the citation.
 *
 * Pictogram artwork is treated as a blocker rather than a warning. The UN
 * symbols are prescribed artwork; an empty red diamond is not a pictogram,
 * and a label that quietly ships without one is worse than no label.
 */
export function labelBlockers(subject: LabelSubject): string[] {
  const blockers: string[] = [];
  const { hazard, responsibleParty } = subject;

  if (!hazard) {
    blockers.push(
      'This product has no hazard classification recorded. Classify it before printing labels.',
    );
  }
  if (!responsibleParty.address) {
    blockers.push(
      'No registered address is recorded. A label must give the address of the responsible party (29 CFR 1910.1200(f)(1)(v)).',
    );
  }
  if (!responsibleParty.telephone) {
    blockers.push(
      'No telephone number is recorded. A label must give the telephone number of the responsible party (29 CFR 1910.1200(f)(1)(v)).',
    );
  }

  if (hazard && hazard.signalWord !== 'none' && hazard.precautionaryStatements.length === 0) {
    blockers.push(
      'The classification carries no precautionary statement. A label must bear at least one (29 CFR 1910.1200(f)(1)(vi)).',
    );
  }

  if (hazard) {
    const missing = hazard.pictograms.filter(
      (code) => !subject.artworkAvailable.includes(code),
    );
    if (missing.length > 0) {
      blockers.push(
        `Pictogram artwork has not been supplied for ${missing.join(', ')}. The UN symbols are prescribed artwork; upload them before printing.`,
      );
    }
  }

  return blockers;
}

export type LabelContent = {
  productIdentifier: string;
  casNumber: string;
  lotNumber: string | null;
  packSize: string | null;
  signalWord: SignalWord;
  pictograms: string[];
  hazardStatements: string[];
  precautionaryStatements: string[];
  responsible: string[];
  /** The research-use condition, which travels on the container too. */
  useStatement: string;
};

export const LABEL_USE_STATEMENT =
  'For laboratory research use only. Not for human or veterinary use.';

export function buildLabelContent(subject: LabelSubject): LabelContent {
  const { hazard, responsibleParty } = subject;
  return {
    productIdentifier: `${subject.productName} (${subject.productCode})`,
    casNumber: subject.casNumber,
    lotNumber: subject.lotNumber,
    packSize: subject.packSize,
    signalWord: hazard?.signalWord ?? 'none',
    pictograms: hazard?.pictograms ?? [],
    hazardStatements: (hazard?.hazardStatements ?? []).map(formatStatement),
    precautionaryStatements: (hazard?.precautionaryStatements ?? []).map(formatStatement),
    responsible: [
      responsibleParty.name,
      responsibleParty.address,
      responsibleParty.telephone ? `Tel ${responsibleParty.telephone}` : null,
    ].filter((line): line is string => Boolean(line)),
    useStatement: LABEL_USE_STATEMENT,
  };
}
