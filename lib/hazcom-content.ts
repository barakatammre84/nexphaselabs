import { ENTITY } from '@/lib/entity';
import type { SettingsMap } from '@/lib/settings-keys';

/**
 * The written hazard communication programme.
 *
 * 29 CFR 1910.1200(e)(1) requires a *written* programme that describes how
 * the employer meets the labelling, safety-data-sheet and training
 * requirements, and that includes a list of the hazardous chemicals known to
 * be present. This assembles that document from the facts the owner has
 * recorded and the classifications held against the catalog.
 *
 * Pure. It states what has been recorded and, where something required has
 * not been, says so in the document rather than omitting the section — a
 * programme with a silent gap reads as complete and is not.
 */

export type HazcomChemical = {
  productCode: string;
  productName: string;
  casNumber: string;
  signalWord: string | null;
  pictograms: string[];
  /** null when nobody has classified it. */
  classified: boolean;
  hasSds: boolean;
};

export type HazcomSubject = {
  settings: SettingsMap;
  chemicals: HazcomChemical[];
};

export type HazcomSection = {
  heading: string;
  /** Paragraphs. */
  body: string[];
  /** Stated when the section rests on something not yet recorded. */
  outstanding: string | null;
};

export type HazcomContent = {
  subtitle: string;
  sections: HazcomSection[];
  inventory: {
    product: string;
    cas: string;
    classification: string;
    sds: string;
  }[];
  outstanding: string[];
};

const NOT_RECORDED = 'Not recorded.';

function paragraph(value: string | undefined, fallback: string): [string, string | null] {
  const trimmed = value?.trim();
  return trimmed ? [trimmed, null] : [NOT_RECORDED, fallback];
}

export function buildHazcomContent(subject: HazcomSubject): HazcomContent {
  const { settings, chemicals } = subject;
  const outstanding: string[] = [];

  const section = (
    heading: string,
    intro: string[],
    setting: string | undefined,
    missing: string,
  ): HazcomSection => {
    const [text, gap] = paragraph(setting, missing);
    if (gap) outstanding.push(gap);
    return { heading, body: [...intro, text], outstanding: gap };
  };

  const workplace = section(
    'Scope and responsibility',
    [
      `This programme applies to ${ENTITY.legalName}, trading as ${ENTITY.tradingName}, and covers every employee who may be exposed to a hazardous chemical in the course of their work.`,
    ],
    settings['hazcom.workplace'],
    'The workplace this programme covers has not been recorded.',
  );

  const responsible = section(
    'Programme administration',
    [
      'One named person is accountable for keeping this programme, the chemical inventory, the labels and the safety data sheets current.',
    ],
    settings['hazcom.responsible_person'],
    'The person responsible for the hazard communication programme has not been recorded.',
  );

  const unclassified = chemicals.filter((c) => !c.classified);
  const labelling: HazcomSection = {
    heading: 'Labels and other forms of warning',
    body: [
      'Every container of a hazardous chemical leaving this facility carries a label bearing the product identifier, signal word, hazard statements, pictograms, precautionary statements, and the name, address and telephone number of the responsible party.',
      'Labels are generated from the classification held against the product record, so a label cannot state something the record does not. A label is refused outright where the classification, the responsible-party details or the prescribed pictogram artwork is missing.',
      'Containers used only within this facility carry, at minimum, the product identifier and the hazards presented. No label is removed or defaced.',
      unclassified.length === 0
        ? 'Every chemical in the inventory below carries a recorded classification.'
        : `${unclassified.length} chemical${unclassified.length === 1 ? '' : 's'} in the inventory below ${unclassified.length === 1 ? 'has' : 'have'} no classification recorded and cannot be labelled until classified.`,
    ],
    outstanding:
      unclassified.length === 0
        ? null
        : `${unclassified.length} chemical${unclassified.length === 1 ? '' : 's'} in the inventory ${unclassified.length === 1 ? 'is' : 'are'} unclassified.`,
  };
  if (labelling.outstanding) outstanding.push(labelling.outstanding);

  const withoutSds = chemicals.filter((c) => !c.hasSds);
  const sds = section(
    'Safety data sheets',
    [
      'A safety data sheet is kept for every hazardous chemical known to be present, and is available to every employee during each work shift without leaving the work area and without asking permission.',
      withoutSds.length === 0
        ? 'A safety data sheet is on file for every chemical in the inventory below.'
        : `${withoutSds.length} chemical${withoutSds.length === 1 ? '' : 's'} in the inventory below ${withoutSds.length === 1 ? 'has' : 'have'} no safety data sheet on file.`,
    ],
    settings['hazcom.sds_access'],
    'How staff reach a safety data sheet has not been recorded.',
  );
  if (withoutSds.length > 0) {
    outstanding.push(
      `${withoutSds.length} chemical${withoutSds.length === 1 ? '' : 's'} in the inventory ${withoutSds.length === 1 ? 'has' : 'have'} no safety data sheet on file.`,
    );
  }

  const training = section(
    'Employee information and training',
    [
      'Employees are trained on the hazards of the chemicals in their work area at the time of their initial assignment, and whenever a new hazard is introduced. Training covers the requirements of this standard, the location of this written programme and the inventory, the methods used to detect a release, the physical and health hazards presented, the measures employees can take to protect themselves, and how to read a label and a safety data sheet.',
    ],
    settings['hazcom.training'],
    'Training arrangements have not been recorded.',
  );

  const nonRoutine = section(
    'Non-routine tasks',
    [
      'Before an employee undertakes a task outside their normal duties that may involve exposure to a hazardous chemical, they are informed of the hazards and the precautions required.',
    ],
    settings['hazcom.non_routine'],
    'Non-routine task arrangements have not been recorded.',
  );

  const contact = section(
    'Contact',
    ['Enquiries about this programme, and requests for a safety data sheet, are directed to:'],
    settings['entity.registered_address']
      ? [
          `${ENTITY.tradingName}, ${ENTITY.legalName}`,
          settings['entity.registered_address'],
          settings['entity.telephone'] ? `Tel ${settings['entity.telephone']}` : null,
          settings['entity.emergency_telephone']
            ? `Emergency ${settings['entity.emergency_telephone']}`
            : null,
          ENTITY.email,
        ]
          .filter(Boolean)
          .join('\n')
      : undefined,
    'The registered address has not been recorded.',
  );

  if (!settings['entity.telephone']) {
    outstanding.push('A telephone number for the responsible party has not been recorded.');
  }

  const inventory = [...chemicals]
    .sort((a, b) => a.productCode.localeCompare(b.productCode))
    .map((chemical) => ({
      product: `${chemical.productName} (${chemical.productCode})`,
      cas: chemical.casNumber || '—',
      classification: chemical.classified
        ? [
            chemical.signalWord && chemical.signalWord !== 'none'
              ? chemical.signalWord.toUpperCase()
              : 'No signal word',
            ...chemical.pictograms,
          ].join(' · ')
        : 'Not classified',
      sds: chemical.hasSds ? 'On file' : 'Not on file',
    }));

  return {
    subtitle: `${chemicals.length} chemical${chemicals.length === 1 ? '' : 's'} in the inventory`,
    sections: [workplace, responsible, labelling, sds, training, nonRoutine, contact],
    inventory,
    outstanding,
  };
}

/** `HAZCOM-<year>-<seq>`. The programme is reissued, never edited in place. */
export function hazcomNumber(year: number, sequence: number): string {
  return `HAZCOM-${year}-${String(sequence).padStart(3, '0')}`;
}

export function hazcomSequenceKey(year: number): string {
  return `hazcom:${year}`;
}
