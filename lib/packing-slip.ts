import { inArray } from 'drizzle-orm';
import { getDb } from '@/db';
import { lots, type IssuedDocument } from '@/db/schema';
import {
  buildPackingSlipContent,
  packingSlipBlockers,
  packingSlipNumber,
  packingSlipSequenceKey,
  type PackingSlipContent,
  type PackingSlipSubject,
} from '@/lib/packing-slip-content';
import { renderPackingSlip } from '@/lib/packing-slip-render';
import {
  claimSequence,
  currentDocument,
  issueDocument,
  peekSequence,
  releaseSequence,
} from '@/lib/issued-documents';
import { getOrderByNumber } from '@/lib/orders';
import { recordedBy } from '@/lib/lots-admin';
import type { StaffPrincipal } from '@/lib/staff-auth';

/**
 * Issuing the packing slip.
 *
 * The slip is filed against the order number for the same reason certificates
 * are filed against the lot number: it is what a person holding the paper can
 * quote back.
 */

export type PackingSlipPreview = {
  content: PackingSlipContent;
  blockers: string[];
  documentNumber: string;
  current: IssuedDocument | null;
};

function subjectId(orderNumber: string): string {
  return orderNumber.trim().toUpperCase();
}

async function loadSubject(
  orderNumber: string,
): Promise<PackingSlipSubject | null> {
  const detail = await getOrderByNumber(orderNumber);
  if (!detail) return null;
  const { order, items } = detail;

  // Storage condition and the certificate number come from the lot each line
  // was picked from, so the slip states how to handle what is actually in the
  // box rather than what the catalog says in general.
  const lotNumbers = [
    ...new Set(items.map((item) => item.lotNumber).filter((n): n is string => Boolean(n))),
  ];
  const lotRows = lotNumbers.length
    ? await getDb()
        .select({
          lotNumber: lots.lotNumber,
          storageCondition: lots.storageCondition,
        })
        .from(lots)
        .where(inArray(lots.lotNumber, lotNumbers))
    : [];
  const storageByLot = new Map(lotRows.map((row) => [row.lotNumber, row.storageCondition]));

  const certificates = new Map<string, string | null>();
  for (const lotNumber of lotNumbers) {
    const certificate = await currentDocument('coa', 'lot', lotNumber);
    certificates.set(lotNumber, certificate?.documentNumber ?? null);
  }

  return {
    order: {
      orderNumber: order.orderNumber,
      status: order.status,
      submittedAt: order.submittedAt,
      carrier: order.carrier,
      trackingNumber: order.trackingNumber,
      consigneeName: order.consigneeName,
      consigneeInstitution: order.consigneeInstitution,
      shipToLine1: order.shipToLine1,
      shipToLine2: order.shipToLine2,
      shipToCity: order.shipToCity,
      shipToRegion: order.shipToRegion,
      shipToPostalCode: order.shipToPostalCode,
      shipToCountry: order.shipToCountry,
      customerNote: order.customerNote,
    },
    lines: items.map((item) => ({
      sku: item.sku,
      productCode: item.productCode,
      productName: item.productName,
      packSize: item.packSize,
      presentation: item.presentation,
      quantity: item.quantity,
      lotNumber: item.lotNumber,
      certificateNumber: item.lotNumber
        ? (certificates.get(item.lotNumber) ?? null)
        : null,
      storageCondition: item.lotNumber
        ? (storageByLot.get(item.lotNumber) ?? null)
        : null,
    })),
  };
}

export async function previewPackingSlip(
  orderNumber: string,
): Promise<PackingSlipPreview | null> {
  const subject = await loadSubject(orderNumber);
  if (!subject) return null;
  const id = subjectId(orderNumber);
  const [revision, current] = await Promise.all([
    peekSequence(packingSlipSequenceKey(orderNumber)),
    currentDocument('packing_slip', 'order', id),
  ]);
  return {
    content: buildPackingSlipContent(subject),
    blockers: packingSlipBlockers(subject),
    documentNumber: packingSlipNumber(subject.order.orderNumber, revision),
    current,
  };
}

export type IssuePackingSlipResult =
  | { ok: true; documentNumber: string; documentId: string }
  | { ok: false; errors: string[] };

export async function issuePackingSlip(
  orderNumber: string,
  staff: StaffPrincipal,
  options: { reason?: string | null } = {},
): Promise<IssuePackingSlipResult> {
  const subject = await loadSubject(orderNumber);
  if (!subject) return { ok: false, errors: ['Order not found.'] };

  const blockers = packingSlipBlockers(subject);
  if (blockers.length > 0) return { ok: false, errors: blockers };

  const id = subjectId(orderNumber);
  const current = await currentDocument('packing_slip', 'order', id);
  const revision = await claimSequence(packingSlipSequenceKey(orderNumber));
  const documentNumber = packingSlipNumber(subject.order.orderNumber, revision);
  const issuedAt = new Date();
  const issuedBy = recordedBy(staff);

  try {
    const bytes = await renderPackingSlip(buildPackingSlipContent(subject), {
      documentNumber,
      issuedAt,
      issuedBy,
      supersedes: current?.documentNumber ?? null,
    });
    const record = await issueDocument({
      kind: 'packing_slip',
      subjectType: 'order',
      subjectId: id,
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
    await releaseSequence(packingSlipSequenceKey(orderNumber), revision).catch(
      () => false,
    );
    throw error;
  }
}
