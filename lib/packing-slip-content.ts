import { REGULATORY_STATEMENT } from '@/lib/catalog';
import { documentDate } from '@/lib/pdf/layout';

/**
 * What a packing slip says.
 *
 * It carries no prices. The slip travels in the box, and the box is opened by
 * a goods-in desk that has no business seeing what the laboratory paid — and
 * often by a customs officer, for whom a priced document invites a valuation
 * argument the commercial invoice already settles.
 *
 * What it does carry is the lot number against every line, and the number of
 * the certificate issued for that lot. That is the link that lets a lab
 * reconcile what arrived against the analysis it was promised, without
 * looking anything up.
 */

export type PackingSlipOrder = {
  orderNumber: string;
  status: string;
  submittedAt: Date | null;
  carrier: string | null;
  trackingNumber: string | null;
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

export type PackingSlipLine = {
  sku: string;
  productCode: string;
  productName: string;
  packSize: string;
  presentation: string;
  quantity: number;
  lotNumber: string | null;
  /** The certificate in force for that lot, when one has been issued. */
  certificateNumber: string | null;
  storageCondition: string | null;
};

export type PackingSlipSubject = {
  order: PackingSlipOrder;
  lines: PackingSlipLine[];
};

/**
 * A packing slip describes what is physically in a box, so it can only be
 * issued once the lines have been picked. An unfulfilled line has no lot
 * against it, and a slip listing an unidentified vial is worse than none.
 */
export function packingSlipBlockers(subject: PackingSlipSubject): string[] {
  const { order, lines } = subject;
  const blockers: string[] = [];

  if (lines.length === 0) blockers.push('This order has no lines.');
  if (order.status === 'cancelled') {
    blockers.push('This order is cancelled. A packing slip cannot be issued for it.');
  }
  if (order.status === 'submitted' || order.status === 'awaiting_payment') {
    blockers.push(
      'This order has not reached fulfilment. Assign lots to its lines before issuing a packing slip.',
    );
  }

  const unassigned = lines.filter((line) => !line.lotNumber);
  if (unassigned.length > 0) {
    blockers.push(
      `${unassigned.length} line${unassigned.length === 1 ? ' has' : 's have'} no lot assigned (${unassigned
        .map((line) => line.sku)
        .join(', ')}).`,
    );
  }
  for (const line of lines) {
    if (line.quantity <= 0) {
      blockers.push(`Line ${line.sku} has a quantity of ${line.quantity}.`);
    }
  }
  return blockers;
}

export type PackingSlipRow = {
  item: string;
  detail: string;
  lot: string;
  quantity: string;
};

export type PackingSlipContent = {
  subtitle: string;
  shipTo: string[];
  details: [string, string | null][];
  rows: PackingSlipRow[];
  /** Storage conditions present on the lines, stated once. */
  storageNotes: string[];
  statement: string;
  customerNote: string | null;
};

export function buildPackingSlipContent(
  subject: PackingSlipSubject,
): PackingSlipContent {
  const { order, lines } = subject;

  const shipTo = [
    order.consigneeName,
    order.consigneeInstitution,
    order.shipToLine1,
    order.shipToLine2,
    [order.shipToCity, order.shipToRegion, order.shipToPostalCode]
      .filter(Boolean)
      .join(', '),
    order.shipToCountry,
  ]
    .map((part) => (part == null ? '' : String(part).trim()))
    .filter((part) => part.length > 0);

  const rows: PackingSlipRow[] = lines.map((line) => ({
    item: `${line.productName} (${line.productCode})`,
    detail: [line.sku, line.packSize, line.presentation].filter(Boolean).join(' · '),
    lot: [line.lotNumber ?? '—', line.certificateNumber]
      .filter(Boolean)
      .join('\n'),
    quantity: String(line.quantity),
  }));

  // One line per distinct storage condition, so a cold-chain item is not
  // buried in a per-row column nobody reads on the receiving dock.
  const storageNotes = [
    ...new Set(
      lines
        .map((line) => line.storageCondition?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  ];

  return {
    subtitle: `Order ${order.orderNumber}`,
    shipTo,
    details: [
      ['Order number', order.orderNumber],
      ['Order date', order.submittedAt ? documentDate(order.submittedAt) : null],
      ['Carrier', order.carrier],
      ['Tracking number', order.trackingNumber],
    ],
    rows,
    storageNotes,
    statement: REGULATORY_STATEMENT,
    customerNote: order.customerNote?.trim() || null,
  };
}

/** `PS-<order>` then `PS-<order>-R1`, matching how certificates are numbered. */
export function packingSlipNumber(orderNumber: string, revision: number): string {
  const order = orderNumber.trim().toUpperCase();
  return revision <= 1 ? `PS-${order}` : `PS-${order}-R${revision - 1}`;
}

export function packingSlipSequenceKey(orderNumber: string): string {
  return `packing_slip:${orderNumber.trim().toUpperCase()}`;
}
