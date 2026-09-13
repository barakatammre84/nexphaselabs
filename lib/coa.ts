import { getProductByCode } from '@/lib/catalog-data';
import {
  buildCoaContent,
  coaBlockers,
  coaNumber,
  coaSequenceKey,
  scanCoa,
  type CoaContent,
  type CoaSubject,
} from '@/lib/coa-content';
import { attachLotDocument, getLot, getLotDetail, recordedBy } from '@/lib/lots-admin';
import {
  claimSequence,
  currentDocument,
  issueDocument,
  peekSequence,
  releaseSequence,
} from '@/lib/issued-documents';
import { renderCoa } from '@/lib/coa-render';
import type { StaffPrincipal } from '@/lib/staff-auth';
import type { IssuedDocument, Lot } from '@/db/schema';

/**
 * Issuing the certificate of analysis.
 *
 * This is the document the business exists to stand behind, so the flow is
 * deliberately two-step: staff preview the exact bytes, then issue. Issuing
 * claims a number, writes the PDF to R2, records the issue with its hash, and
 * attaches it to the lot as the certificate in force.
 *
 * Attaching supersedes whatever certificate was previously on the lot. When
 * that was a supplier's document it is not lost — `lot_documents` keeps the
 * superseded row and its file — but the lot now points at the certificate we
 * issued, which is the one that goes to the customer and the one the public
 * lot lookup serves.
 */

export type CoaPreview = {
  content: CoaContent;
  blockers: string[];
  /** The number this certificate would take if issued now. */
  documentNumber: string;
  revision: number;
  /** The certificate currently in force for the lot, if any. */
  current: IssuedDocument | null;
};

/**
 * Certificates are filed against the lot NUMBER, not the lot row id.
 *
 * A correction supersedes the row and inserts a new one with a new id, so
 * keying on the id would scatter a lot's certificate history across every
 * correction it has ever had — and a reissue would not find the certificate
 * it was replacing. The number is what the customer holds and what the
 * certificate is about, so it is what the history hangs on.
 */
function coaSubjectId(lotNumber: string): string {
  return lotNumber.trim().toUpperCase();
}

async function loadSubject(lotNumber: string): Promise<{
  subject: CoaSubject;
  lot: Lot;
} | null> {
  const detail = await getLotDetail(lotNumber);
  if (!detail) return null;
  const { lot, tests } = detail;
  const product = await getProductByCode(lot.productCode).catch(() => null);

  return {
    lot,
    subject: {
      lot: {
        lotNumber: lot.lotNumber,
        productCode: lot.productCode,
        productName: lot.productName,
        casNumber: lot.casNumber,
        manufacturerName: lot.manufacturerName,
        manufacturerAddress: lot.manufacturerAddress,
        countryOfOrigin: lot.countryOfOrigin,
        manufactureDate: lot.manufactureDate,
        receivedAt: lot.receivedAt,
        purityResult: lot.purityResult,
        purityMethod: lot.purityMethod,
        identityConfirmed: lot.identityConfirmed,
        identityMethod: lot.identityMethod,
        waterContent: lot.waterContent,
        heavyMetalsSummary: lot.heavyMetalsSummary,
        netPeptideContent: lot.netPeptideContent,
        appearance: lot.appearance,
        accessionNumber: lot.accessionNumber,
        analyticalLab: lot.analyticalLab,
        testingStandard: lot.testingStandard,
        storageCondition: lot.storageCondition,
        retestDate: lot.retestDate,
        status: lot.status,
      },
      product: product
        ? {
            formalName: product.formalName,
            sequenceOneLetter: product.sequenceOneLetter,
            molecularFormula: product.molecularFormula,
            molecularWeight: product.molecularWeight,
            saltForm: product.saltForm,
            form: product.form,
          }
        : null,
      tests: tests.map((test) => ({
        testType: test.testType,
        analyte: test.analyte,
        method: test.method,
        result: test.result,
        specification: test.specification,
        passed: test.passed,
        testedAt: test.testedAt,
      })),
    },
  };
}

/** What would be issued, and what stops it, without taking a number. */
export async function previewCoa(lotNumber: string): Promise<CoaPreview | null> {
  const loaded = await loadSubject(lotNumber);
  if (!loaded) return null;
  const { subject } = loaded;
  const [revision, current] = await Promise.all([
    peekSequence(coaSequenceKey(lotNumber)),
    currentDocument('coa', 'lot', coaSubjectId(lotNumber)),
  ]);
  const violations = scanCoa(subject);
  return {
    content: buildCoaContent(subject),
    blockers: [
      ...coaBlockers(subject),
      ...violations.map((v) => `${v.field}: ${v.reason} ("${v.match}")`),
    ],
    documentNumber: coaNumber(subject.lot.lotNumber, revision),
    revision,
    current,
  };
}

/* ------------------------------------------------------------------------ */
/* Issuing                                                                    */
/* ------------------------------------------------------------------------ */

export type IssueCoaResult =
  | { ok: true; documentNumber: string; documentId: string }
  | { ok: false; errors: string[] };

/**
 * Render and issue the certificate, then point the lot at it.
 *
 * The number is claimed only after the blockers pass, so a rejected attempt
 * does not burn a certificate number and leave a gap in the series that
 * nobody can explain later.
 */
export async function issueCoa(
  lotNumber: string,
  staff: StaffPrincipal,
  options: { reason?: string | null } = {},
): Promise<IssueCoaResult> {
  const loaded = await loadSubject(lotNumber);
  if (!loaded) return { ok: false, errors: ['Lot not found.'] };
  const { subject, lot } = loaded;
  const subjectId = coaSubjectId(lot.lotNumber);

  const violations = scanCoa(subject);
  const blockers = [
    ...coaBlockers(subject),
    ...violations.map((v) => `${v.field}: ${v.reason} ("${v.match}")`),
  ];
  if (blockers.length > 0) return { ok: false, errors: blockers };

  const current = await currentDocument('coa', 'lot', subjectId);
  const revision = await claimSequence(coaSequenceKey(lotNumber));
  const documentNumber = coaNumber(lot.lotNumber, revision);
  const issuedAt = new Date();
  const issuedBy = recordedBy(staff);

  // The number is printed on the document, so it has to be claimed before
  // rendering. Until the issue is written the claim can still be handed back,
  // so the series carries no gap nobody can account for; once it is written
  // the number is permanently spent and must not be released.
  let issued = false;
  try {
    const bytes = await renderCoa(buildCoaContent(subject), {
      documentNumber,
      issuedAt,
      issuedBy,
      supersedes: current?.documentNumber ?? null,
    });

    // Everything above was computed from a snapshot taken before the number
    // was claimed and the document drawn. A correction or a disposition in
    // that window would make this certificate a statement about a record that
    // no longer stands, so the lot is re-read and the issue abandoned if it
    // has moved. Same guard as `setLotDisposition`.
    const fresh = await getLot(lotNumber);
    if (!fresh || fresh.id !== lot.id || fresh.status !== lot.status) {
      await releaseSequence(coaSequenceKey(lotNumber), revision).catch(() => false);
      return {
        ok: false,
        errors: [
          'The lot record changed while the certificate was being prepared. Reload the lot and issue again.',
        ],
      };
    }

    const record = await issueDocument({
      kind: 'coa',
      subjectType: 'lot',
      subjectId,
      documentNumber,
      bytes,
      issuedBy,
      issuedAt,
      supersedes: current
        ? {
            id: current.id,
            reason: options.reason?.trim() || `Reissued as ${documentNumber}.`,
          }
        : null,
    });
    issued = true;

    // Point the lot at the certificate we just issued, using the same path an
    // uploaded certificate takes so the release gate and the public lot
    // lookup need no special case.
    await attachLotDocument(
      fresh,
      'coa',
      {
        key: record.objectKey,
        contentType: record.contentType,
        size: record.sizeBytes,
        uploadedAt: issuedAt,
        sha256: record.sha256,
      },
      `${documentNumber}.pdf`,
      staff,
    );

    return { ok: true, documentNumber, documentId: record.id };
  } catch (error) {
    if (!issued) {
      await releaseSequence(coaSequenceKey(lotNumber), revision).catch(() => false);
    }
    throw error;
  }
}
