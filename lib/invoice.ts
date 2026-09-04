import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { organizations, type IssuedDocument } from '@/db/schema';
import {
  buildInvoiceContent,
  invoiceBlockers,
  invoiceNumber,
  invoiceSequenceKey,
  invoiceYear,
  type InvoiceContent,
  type InvoiceSubject,
} from '@/lib/invoice-content';
import { renderInvoice } from '@/lib/invoice-render';
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
 * Issuing the invoice.
 *
 * Same shape as the certificate: preview renders the real document and stores
 * nothing, issuing claims a number, writes the PDF, records its hash, and
 * supersedes any earlier invoice for the order.
 *
 * A note on reissuing. Superseding an invoice is not the same as a credit
 * note, and once this business has an accounting system that distinction will
 * matter. What is guaranteed here is that both documents survive with their
 * own numbers and hashes, and that the replacement states on its face what it
 * replaces — which is the record an accountant needs to follow the trail.
 */

export type InvoicePreview = {
  content: InvoiceContent;
  blockers: string[];
  /** The number this invoice would take if issued now. */
  documentNumber: string;
  current: IssuedDocument | null;
};

async function loadSubject(
  orderNumber: string,
): Promise<{ subject: InvoiceSubject; orderId: string } | null> {
  const detail = await getOrderByNumber(orderNumber);
  if (!detail) return null;
  const { order, items } = detail;

  let organization: InvoiceSubject['organization'] = null;
  if (order.organizationId) {
    const db = getDb();
    const [found] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, order.organizationId))
      .limit(1);
    if (found) {
      organization = {
        legalName: found.legalName,
        addressLine1: found.addressLine1,
        addressLine2: found.addressLine2,
        city: found.city,
        region: found.region,
        postalCode: found.postalCode,
        country: found.country,
      };
    }
  }

  return {
    orderId: order.id,
    subject: {
      order: {
        orderNumber: order.orderNumber,
        status: order.status,
        currency: order.currency,
        subtotalCents: order.subtotalCents,
        shippingCents: order.shippingCents,
        totalCents: order.totalCents,
        paymentMethod: order.paymentMethod,
        paymentRef: order.paymentRef,
        paymentStatus: order.paymentStatus,
        submittedAt: order.submittedAt,
        paidAt: order.paidAt,
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
      organization,
      lines: items.map((item) => ({
        sku: item.sku,
        productCode: item.productCode,
        productName: item.productName,
        packSize: item.packSize,
        presentation: item.presentation,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
        lineTotalCents: item.lineTotalCents,
        lotNumber: item.lotNumber,
      })),
    },
  };
}

/** What would be issued, and what stops it, without taking a number. */
export async function previewInvoice(
  orderNumber: string,
  now = new Date(),
): Promise<InvoicePreview | null> {
  const loaded = await loadSubject(orderNumber);
  if (!loaded) return null;
  const year = invoiceYear(now);
  const [sequence, current] = await Promise.all([
    peekSequence(invoiceSequenceKey(year)),
    currentDocument('invoice', 'order', loaded.orderId),
  ]);
  return {
    content: buildInvoiceContent(loaded.subject),
    blockers: invoiceBlockers(loaded.subject),
    documentNumber: invoiceNumber(year, sequence),
    current,
  };
}

export type IssueInvoiceResult =
  | { ok: true; documentNumber: string; documentId: string }
  | { ok: false; errors: string[] };

export async function issueInvoice(
  orderNumber: string,
  staff: StaffPrincipal,
  options: { reason?: string | null } = {},
): Promise<IssueInvoiceResult> {
  const loaded = await loadSubject(orderNumber);
  if (!loaded) return { ok: false, errors: ['Order not found.'] };
  const { subject, orderId } = loaded;

  const blockers = invoiceBlockers(subject);
  if (blockers.length > 0) return { ok: false, errors: blockers };

  const current = await currentDocument('invoice', 'order', orderId);
  const issuedAt = new Date();
  const year = invoiceYear(issuedAt);
  const sequence = await claimSequence(invoiceSequenceKey(year));
  const documentNumber = invoiceNumber(year, sequence);
  const issuedBy = recordedBy(staff);

  try {
    const bytes = await renderInvoice(buildInvoiceContent(subject), {
      documentNumber,
      issuedAt,
      issuedBy,
      supersedes: current?.documentNumber ?? null,
    });

    const record = await issueDocument({
      kind: 'invoice',
      subjectType: 'order',
      subjectId: orderId,
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
    // Hand the number back so the year's series carries no gap that nobody
    // can account for. An accountant reading a gap assumes a suppressed
    // invoice, which is exactly the wrong inference.
    await releaseSequence(invoiceSequenceKey(year), sequence).catch(() => false);
    throw error;
  }
}
