import { getDb } from '@/db';
import { products, type IssuedDocument } from '@/db/schema';
import {
  buildHazcomContent,
  hazcomNumber,
  hazcomSequenceKey,
  type HazcomChemical,
  type HazcomContent,
} from '@/lib/hazcom-content';
import { renderHazcom } from '@/lib/hazcom-render';
import {
  claimSequence,
  currentDocument,
  issueDocument,
  peekSequence,
  releaseSequence,
} from '@/lib/issued-documents';
import { recordedBy } from '@/lib/lots-admin';
import { readSettings } from '@/lib/settings';
import type { StaffPrincipal } from '@/lib/staff-auth';

/**
 * Issuing the written hazard communication programme.
 *
 * The programme is a snapshot: it states the inventory and the arrangements
 * as they stood when it was issued. It is reissued rather than edited, so an
 * inspector asking what the programme said in March can be shown the document
 * that was in force in March.
 *
 * The subject is the facility rather than any product or lot — there is one
 * programme, and it supersedes itself.
 */

const FACILITY = 'FACILITY';

export type HazcomPreview = {
  content: HazcomContent;
  documentNumber: string;
  current: IssuedDocument | null;
};

async function loadChemicals(): Promise<HazcomChemical[]> {
  const rows = await getDb()
    .select({
      productCode: products.code,
      productName: products.name,
      casNumber: products.casNumber,
      hazard: products.hazard,
      hasSds: products.hasSds,
      visibility: products.visibility,
    })
    .from(products);

  // Withdrawn products are still in the building until the material is gone,
  // so the inventory lists everything the catalog knows about rather than
  // only what is on sale.
  return rows.map((row) => ({
    productCode: row.productCode,
    productName: row.productName,
    casNumber: row.casNumber,
    signalWord: row.hazard?.signalWord ?? null,
    pictograms: row.hazard?.pictograms ?? [],
    classified: Boolean(row.hazard),
    hasSds: row.hasSds,
  }));
}

export async function previewHazcom(now = new Date()): Promise<HazcomPreview> {
  const year = now.getUTCFullYear();
  const [settings, chemicals, sequence, current] = await Promise.all([
    readSettings(),
    loadChemicals(),
    peekSequence(hazcomSequenceKey(year)),
    currentDocument('hazcom', 'facility', FACILITY),
  ]);
  return {
    content: buildHazcomContent({ settings, chemicals }),
    documentNumber: hazcomNumber(year, sequence),
    current,
  };
}

export type IssueHazcomResult =
  | { ok: true; documentNumber: string; documentId: string }
  | { ok: false; errors: string[] };

/**
 * Issue the programme.
 *
 * Deliberately not blocked on the outstanding items. A programme that names
 * its own gaps is a better artefact than no programme at all, and OSHA's
 * requirement is that a written programme exists — the gaps are printed on
 * the first page rather than hidden, so issuing one cannot be mistaken for
 * completing one.
 */
export async function issueHazcom(
  staff: StaffPrincipal,
  options: { reason?: string | null } = {},
): Promise<IssueHazcomResult> {
  const settings = await readSettings();
  const chemicals = await loadChemicals();
  const content = buildHazcomContent({ settings, chemicals });

  const current = await currentDocument('hazcom', 'facility', FACILITY);
  const issuedAt = new Date();
  const year = issuedAt.getUTCFullYear();
  const sequence = await claimSequence(hazcomSequenceKey(year));
  const documentNumber = hazcomNumber(year, sequence);
  const issuedBy = recordedBy(staff);

  try {
    const bytes = await renderHazcom(content, {
      documentNumber,
      issuedAt,
      issuedBy,
      supersedes: current?.documentNumber ?? null,
    });
    const record = await issueDocument({
      kind: 'hazcom',
      subjectType: 'facility',
      subjectId: FACILITY,
      documentNumber,
      bytes,
      issuedBy,
      issuedAt,
      supersedes: current
        ? {
            id: current.id,
            reason: options.reason?.trim() || `Replaced by ${documentNumber}.`,
          }
        : null,
    });
    return { ok: true, documentNumber, documentId: record.id };
  } catch (error) {
    await releaseSequence(hazcomSequenceKey(year), sequence).catch(() => false);
    throw error;
  }
}
