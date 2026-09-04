import type { InvoiceContent } from '@/lib/invoice-content';
import { LETTER, MARGIN, distributeWidths, type Column } from '@/lib/pdf/layout';
import { ACCENT, INK, MUTED, beginDocument, finishDocument } from '@/lib/pdf/render';

/**
 * Drawing the invoice. Pure, like the certificate renderer: no database, no
 * bucket, so the document can be rendered and read in a test.
 */

export async function renderInvoice(
  content: InvoiceContent,
  meta: {
    documentNumber: string;
    issuedAt: Date;
    supersedes?: string | null;
    issuedBy: string;
  },
): Promise<Uint8Array> {
  const documentMeta = {
    title: 'Invoice',
    documentNumber: meta.documentNumber,
    subtitle: content.subtitle,
    issuedAt: meta.issuedAt,
    supersedes: meta.supersedes ?? null,
  };
  const { doc, cursor, fonts } = await beginDocument(documentMeta);

  // Bill-to and ship-to side by side. They are usually different: a finance
  // office pays, a laboratory receives.
  const half = cursor.contentWidth / 2;
  const top = cursor.y;
  let leftY = top;
  let rightY = top;

  const column = (
    heading: string,
    lines: string[],
    x: number,
    startY: number,
  ): number => {
    let y = startY;
    cursor.page.drawText(heading.toUpperCase(), {
      x,
      y: y - 8,
      size: 8,
      font: fonts.bold,
      color: ACCENT,
    });
    y -= 20;
    for (const line of lines.length > 0 ? lines : ['—']) {
      cursor.page.drawText(line, {
        x,
        y: y - 9,
        size: 9,
        font: fonts.regular,
        color: INK,
      });
      y -= 12.5;
    }
    return y;
  };

  leftY = column('Bill to', content.billTo, MARGIN, top);
  rightY = column('Ship to', content.shipTo, MARGIN + half, top);
  cursor.y = Math.min(leftY, rightY) - 6;

  cursor.heading('Order');
  cursor.fields(content.details, 150, 9);

  cursor.heading('Items');
  const widths = distributeWidths([7, 2, 3, 3], cursor.contentWidth);
  const columns: Column[] = [
    { key: 'item', heading: 'Item', width: widths[0] },
    { key: 'quantity', heading: 'Qty', width: widths[1], align: 'right' },
    { key: 'unit', heading: `Unit ${content.currency}`, width: widths[2], align: 'right' },
    { key: 'total', heading: `Amount ${content.currency}`, width: widths[3], align: 'right' },
  ];

  // Each row prints the item on one line and its SKU, pack and lot beneath,
  // so the customer can reconcile the invoice against what arrived.
  const rows = content.rows.map((row) => ({
    item: `${row.item}\n${row.detail}`,
    quantity: row.quantity,
    unit: row.unit,
    total: row.total,
  }));
  cursor.table(columns, rows, { zebra: true });

  // Totals, right-aligned under the amount column.
  cursor.y -= 4;
  const totalsLeft = MARGIN + widths[0] + widths[1];
  for (const [label, value] of content.totals) {
    const last = label.startsWith('Total');
    const size = last ? 10 : 9;
    cursor.ensure(22);
    if (last) {
      // Clear of the previous row's descenders: a rule drawn any higher
      // reads as a strikethrough over "Shipping" rather than a total rule.
      cursor.y -= 4;
      cursor.page.drawLine({
        start: { x: totalsLeft, y: cursor.y + 2 },
        end: { x: LETTER.width - MARGIN, y: cursor.y + 2 },
        thickness: 0.75,
        color: MUTED,
      });
    }
    const font = last ? fonts.bold : fonts.regular;
    cursor.page.drawText(label, {
      x: totalsLeft,
      y: cursor.y - size,
      size,
      font,
      color: last ? INK : MUTED,
    });
    const width = font.widthOfTextAtSize(value, size);
    cursor.page.drawText(value, {
      x: LETTER.width - MARGIN - width,
      y: cursor.y - size,
      size,
      font,
      color: INK,
    });
    cursor.y -= size * 1.6;
  }

  cursor.y -= 6;
  cursor.text(content.paymentNote, { size: 9, bold: true, gap: 4 });

  if (content.customerNote) {
    cursor.heading('Customer note');
    cursor.text(content.customerNote, { size: 9 });
  }

  // Conditions of supply in the body, as on every other document we issue.
  cursor.heading('Conditions of supply');
  cursor.text(content.statement, { size: 8.5, color: ACCENT });

  return finishDocument(
    doc,
    fonts,
    documentMeta,
    `Issued by ${meta.issuedBy}.`,
  );
}
