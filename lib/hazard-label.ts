import { getProductByCode } from '@/lib/catalog-data';
import {
  buildLabelContent,
  labelBlockers,
  type LabelContent,
  type LabelSize,
  type LabelSubject,
} from '@/lib/hazard';
import { LabelTooSmallError, renderLabel, type LabelArtwork } from '@/lib/hazard-label-render';
import { getLot } from '@/lib/lots-admin';
import { availablePictograms, getPictogram, readSettings, responsiblePartyFrom } from '@/lib/settings';

/**
 * Generating a container label for a lot.
 *
 * Labels are produced on demand and not archived — see the note on
 * `DOCUMENT_KINDS`. What is archived is the classification they are generated
 * from, which is what an inspector actually asks to see.
 */

export type LabelPreparation =
  | { ok: true; content: LabelContent; artwork: LabelArtwork }
  | { ok: false; errors: string[] };

async function subjectForLot(lotNumber: string): Promise<LabelSubject | null> {
  const lot = await getLot(lotNumber);
  if (!lot) return null;
  const [product, settings, artworkCodes] = await Promise.all([
    getProductByCode(lot.productCode).catch(() => null),
    readSettings(),
    availablePictograms().catch(() => [] as string[]),
  ]);

  return {
    productCode: lot.productCode,
    productName: lot.productName,
    casNumber: lot.casNumber,
    lotNumber: lot.lotNumber,
    packSize: null,
    hazard: product?.hazard ?? null,
    responsibleParty: responsiblePartyFrom(settings),
    artworkAvailable: artworkCodes,
  };
}

/** What stops a label being printed for this lot, without rendering one. */
export async function labelPreviewForLot(
  lotNumber: string,
): Promise<{ blockers: string[]; subject: LabelSubject } | null> {
  const subject = await subjectForLot(lotNumber);
  if (!subject) return null;
  return { blockers: labelBlockers(subject), subject };
}

async function prepare(subject: LabelSubject): Promise<LabelPreparation> {
  const blockers = labelBlockers(subject);
  if (blockers.length > 0) return { ok: false, errors: blockers };

  const artwork: LabelArtwork = {};
  for (const code of subject.hazard?.pictograms ?? []) {
    const bytes = await getPictogram(code);
    // labelBlockers has already refused a code with no artwork; a null here
    // means it vanished between the check and the fetch.
    if (!bytes) return { ok: false, errors: [`Pictogram artwork for ${code} is missing.`] };
    artwork[code] = bytes;
  }
  return { ok: true, content: buildLabelContent(subject), artwork };
}

export type LabelResult =
  | { ok: true; bytes: Uint8Array; filename: string }
  | { ok: false; errors: string[] };

export async function renderLabelForLot(
  lotNumber: string,
  size: LabelSize,
  copies: number,
): Promise<LabelResult | null> {
  const subject = await subjectForLot(lotNumber);
  if (!subject) return null;

  const prepared = await prepare(subject);
  if (!prepared.ok) return prepared;

  const issuedAt = new Date();
  const documentNumber = `LABEL-${subject.lotNumber ?? subject.productCode}`;
  try {
    const bytes = await renderLabel(prepared.content, size, prepared.artwork, {
      issuedAt,
      documentNumber,
      copies,
    });
    return { ok: true, bytes, filename: `${documentNumber}-${size}.pdf` };
  } catch (error) {
    // A label that does not fit its stock is refused rather than trimmed:
    // every element on it is required.
    if (error instanceof LabelTooSmallError) {
      return { ok: false, errors: [error.message] };
    }
    throw error;
  }
}
