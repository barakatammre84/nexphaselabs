import { REGULATORY_STATEMENT } from '@/lib/catalog';
import { amount, documentDate } from '@/lib/pdf/layout';

/**
 * What an invoice says.
 *
 * "Invoice by email" has been a payment *method* on this system since Phase 5
 * — it sends bank instructions and no invoice. This module is the document
 * itself.
 *
 * Pure, like the certificate's content module, so the arithmetic that decides
 * what a customer is asked to pay is testable without rendering a PDF. The
 * totals are never recomputed here: they are the ones recorded on the order
 * when it was placed, because an invoice that disagrees with the order the
 * customer accepted is a dispute, not a document. What this module does check
 * is that they still add up, and refuses to issue if they do not.
 */

export type InvoiceOrder = {
  orderNumber: string;
  status: string;
  currency: string;
  subtotalCents: number;
  /** Promo-code discount taken off the subtotal (0 when none). */
  discountCents?: number;
  couponCode?: string | null;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
  paymentMethod: string | null;
  paymentRef: string | null;
  paymentStatus: string;
  submittedAt: Date | null;
  paidAt: Date | null;
  consigneeName: string;
  consigneeInstitution: string | null;
  shipToLine1: string;
  shipToLine2: string | null;
  shipToCity: string;
  shipToRegion: string;
  shipToPostalCode: string;
  shipToCountry: string;
  customerNote: string | null;
};

/** The verified organisation the order belongs to, when there is one. */
export type InvoiceOrganization = {
  legalName: string;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
} | null;

export type InvoiceLine = {
  sku: string;
  productCode: string;
  productName: string;
  packSize: string;
  presentation: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  lotNumber: string | null;
};

export type InvoiceSubject = {
  order: InvoiceOrder;
  organization: InvoiceOrganization;
  lines: InvoiceLine[];
};

/* ------------------------------------------------------------------------ */
/* Issue rules                                                                */
/* ------------------------------------------------------------------------ */

/**
 * Everything that must be true before an invoice may be issued.
 *
 * The arithmetic check is the important one. Every line total, the subtotal
 * and the shipping have to reconcile to the recorded total; if a correction
 * elsewhere ever left an order inconsistent, the invoice is the last place
 * that should paper over it.
 */
export function invoiceBlockers(subject: InvoiceSubject): string[] {
  const { order, lines } = subject;
  const blockers: string[] = [];

  if (lines.length === 0) {
    blockers.push('This order has no lines.');
  }
  if (order.status === 'cancelled') {
    blockers.push(
      'This order is cancelled. An invoice cannot be issued for it.',
    );
  }

  for (const line of lines) {
    if (line.quantity <= 0) {
      blockers.push(`Line ${line.sku} has a quantity of ${line.quantity}.`);
    }
    if (line.unitPriceCents * line.quantity !== line.lineTotalCents) {
      blockers.push(
        `Line ${line.sku} does not add up: ${line.quantity} at ${amount(line.unitPriceCents)} is ${amount(line.unitPriceCents * line.quantity)}, but the line total recorded is ${amount(line.lineTotalCents)}.`,
      );
    }
  }

  const lineSum = lines.reduce((total, line) => total + line.lineTotalCents, 0);
  if (lines.length > 0 && lineSum !== order.subtotalCents) {
    blockers.push(
      `The lines total ${amount(lineSum)} but the order subtotal recorded is ${amount(order.subtotalCents)}.`,
    );
  }
  const discount = order.discountCents ?? 0;
  if (
    order.subtotalCents - discount + order.shippingCents + order.taxCents !==
    order.totalCents
  ) {
    blockers.push(
      `The subtotal${discount ? ' less the promo code' : ''}, shipping and tax come to ${amount(order.subtotalCents - discount + order.shippingCents + order.taxCents)} but the order total recorded is ${amount(order.totalCents)}.`,
    );
  }
  return blockers;
}

/* ------------------------------------------------------------------------ */
/* Content                                                                    */
/* ------------------------------------------------------------------------ */

export type InvoiceRow = {
  item: string;
  detail: string;
  quantity: string;
  unit: string;
  total: string;
};

export type InvoiceContent = {
  subtitle: string;
  billTo: string[];
  shipTo: string[];
  details: [string, string | null][];
  rows: InvoiceRow[];
  totals: [string, string][];
  currency: string;
  paymentNote: string;
  statement: string;
  customerNote: string | null;
};

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  unpaid: 'Unpaid',
  pending: 'Payment pending',
  paid: 'Paid',
  failed: 'Payment failed',
  refund_due: 'Refund due',
  refunded: 'Refunded',
};

export function paymentStatusLabel(status: string): string {
  return PAYMENT_STATUS_LABEL[status] ?? status.replace(/_/g, ' ');
}

/** Address block, skipping the lines that have no value. */
function addressLines(parts: (string | null | undefined)[]): string[] {
  return parts
    .map((part) => (part == null ? '' : String(part).trim()))
    .filter((part) => part.length > 0);
}

export function buildInvoiceContent(subject: InvoiceSubject): InvoiceContent {
  const { order, organization, lines } = subject;

  // Bill the verified organisation when there is one. An institutional
  // customer's finance office pays against the legal entity, not the name of
  // the researcher the parcel is addressed to.
  const billTo = organization
    ? addressLines([
        organization.legalName,
        organization.addressLine1,
        organization.addressLine2,
        [organization.city, organization.region, organization.postalCode]
          .filter(Boolean)
          .join(', '),
        organization.country,
      ])
    : addressLines([order.consigneeInstitution, order.consigneeName]);

  const shipTo = addressLines([
    order.consigneeName,
    order.consigneeInstitution,
    order.shipToLine1,
    order.shipToLine2,
    [order.shipToCity, order.shipToRegion, order.shipToPostalCode]
      .filter(Boolean)
      .join(', '),
    order.shipToCountry,
  ]);

  const rows: InvoiceRow[] = lines.map((line) => ({
    item: `${line.productName} (${line.productCode})`,
    detail: [
      line.sku,
      line.packSize,
      line.presentation,
      line.lotNumber ? `Lot ${line.lotNumber}` : null,
    ]
      .filter(Boolean)
      .join(' · '),
    quantity: String(line.quantity),
    unit: amount(line.unitPriceCents),
    total: amount(line.lineTotalCents),
  }));

  // Every line that makes up the total is printed, including the ones that reduce it. Omitting the
  // promo code left an invoice whose visible rows summed to more than the total it stated, which is
  // not something a customer's accounting document may do. A zero shipping row is printed for the
  // same reason: free delivery is shown, not hidden (lib/free-shipping-rules.ts).
  const totals: [string, string][] = [['Subtotal', amount(order.subtotalCents)]];
  const discountCents = order.discountCents ?? 0;
  if (discountCents !== 0)
    totals.push([order.couponCode ? `Promo code · ${order.couponCode}` : 'Discount', `-${amount(discountCents)}`]);
  totals.push(['Shipping', order.shippingCents === 0 ? 'Free' : amount(order.shippingCents)]);
  if (order.taxCents !== 0) totals.push(['Tax', amount(order.taxCents)]);
  totals.push([`Total ${order.currency}`, amount(order.totalCents)]);

  return {
    subtitle: `Order ${order.orderNumber}`,
    billTo,
    shipTo,
    details: [
      ['Order number', order.orderNumber],
      [
        'Order date',
        order.submittedAt ? documentDate(order.submittedAt) : null,
      ],
      ['Payment status', paymentStatusLabel(order.paymentStatus)],
      ['Payment method', order.paymentMethod],
      ['Payment reference', order.paymentRef],
      ['Date paid', order.paidAt ? documentDate(order.paidAt) : null],
    ],
    rows,
    totals,
    currency: order.currency,
    paymentNote:
      order.paymentStatus === 'paid'
        ? 'Paid in full. This invoice is issued for your records; no payment is due.'
        : 'Payment is due on receipt. Quote the invoice number with your remittance.',
    statement: REGULATORY_STATEMENT,
    customerNote: order.customerNote?.trim() || null,
  };
}

/* ------------------------------------------------------------------------ */
/* Numbering                                                                  */
/* ------------------------------------------------------------------------ */

/**
 * `INV-2026-0001`. The series restarts each calendar year, which is how an
 * accountant expects to read it, and the year is taken from the issue date
 * rather than the order date so the number always sorts with the period it
 * was raised in.
 */
export function invoiceNumber(year: number, sequence: number): string {
  return `INV-${year}-${String(sequence).padStart(4, '0')}`;
}

export function invoiceSequenceKey(year: number): string {
  return `invoice:${year}`;
}

/** The year an invoice issued now belongs to, read in UTC. */
export function invoiceYear(issuedAt: Date): number {
  return issuedAt.getUTCFullYear();
}
