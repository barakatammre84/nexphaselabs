import type { PackingSlipContent } from '@/lib/packing-slip-content';
import { distributeWidths, type Column } from '@/lib/pdf/layout';
import { ACCENT, beginDocument, finishDocument } from '@/lib/pdf/render';

/** Drawing the packing slip. Pure: no database, no bucket. */
export async function renderPackingSlip(
  content: PackingSlipContent,
  meta: {
    documentNumber: string;
    issuedAt: Date;
    supersedes?: string | null;
    issuedBy: string;
  },
): Promise<Uint8Array> {
  const documentMeta = {
    title: 'Packing slip',
    documentNumber: meta.documentNumber,
    subtitle: content.subtitle,
    issuedAt: meta.issuedAt,
    supersedes: meta.supersedes ?? null,
  };
  const { doc, cursor, fonts } = await beginDocument(documentMeta);

  cursor.heading('Deliver to');
  for (const line of content.shipTo) cursor.text(line, { size: 10 });

  cursor.heading('Consignment');
  cursor.fields(content.details, 150, 9);

  cursor.heading('Contents');
  const widths = distributeWidths([8, 5, 2], cursor.contentWidth);
  const columns: Column[] = [
    { key: 'item', heading: 'Item', width: widths[0] },
    { key: 'lot', heading: 'Lot / certificate', width: widths[1] },
    { key: 'quantity', heading: 'Qty', width: widths[2], align: 'right' },
  ];
  cursor.table(
    columns,
    content.rows.map((row) => ({
      item: `${row.item}\n${row.detail}`,
      lot: row.lot,
      quantity: row.quantity,
    })),
    { zebra: true },
  );

  if (content.storageNotes.length > 0) {
    cursor.heading('Storage on receipt');
    for (const note of content.storageNotes) cursor.text(note, { size: 9 });
  }

  if (content.customerNote) {
    cursor.heading('Delivery note');
    cursor.text(content.customerNote, { size: 9 });
  }

  cursor.heading('Conditions of supply');
  cursor.text(content.statement, { size: 8.5, color: ACCENT });

  return finishDocument(
    doc,
    fonts,
    documentMeta,
    'No prices are stated on this document. Refer to the invoice for commercial terms.',
  );
}
