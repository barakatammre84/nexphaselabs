import type { HazcomContent } from '@/lib/hazcom-content';
import { distributeWidths, type Column } from '@/lib/pdf/layout';
import { ACCENT, MUTED, beginDocument, finishDocument } from '@/lib/pdf/render';

/** Drawing the written hazard communication programme. Pure. */
export async function renderHazcom(
  content: HazcomContent,
  meta: {
    documentNumber: string;
    issuedAt: Date;
    supersedes?: string | null;
    issuedBy: string;
  },
): Promise<Uint8Array> {
  const documentMeta = {
    title: 'Hazard communication programme',
    documentNumber: meta.documentNumber,
    subtitle: content.subtitle,
    issuedAt: meta.issuedAt,
    supersedes: meta.supersedes ?? null,
  };
  const { doc, cursor, fonts } = await beginDocument(documentMeta);

  cursor.text(
    'Written programme maintained under 29 CFR 1910.1200(e). It is available to every employee, and to their designated representative, on request.',
    { size: 8.5, color: ACCENT, gap: 6 },
  );

  // Outstanding items go at the top, not in an appendix. A programme with a
  // gap should say so on the page a reader opens first.
  if (content.outstanding.length > 0) {
    cursor.heading('Outstanding');
    cursor.text(
      'This programme is not yet complete. The following are required and have not been recorded:',
      { size: 9, gap: 2 },
    );
    for (const item of content.outstanding) {
      cursor.text(`— ${item}`, { size: 9, indent: 10 });
    }
  }

  for (const section of content.sections) {
    cursor.heading(section.heading);
    for (const paragraph of section.body) {
      cursor.text(paragraph, { size: 9, gap: 3 });
    }
  }

  cursor.heading('Chemical inventory');
  cursor.text(
    'The hazardous chemicals known to be present, as required by 29 CFR 1910.1200(e)(1)(i).',
    { size: 8.5, color: MUTED, gap: 4 },
  );

  const widths = distributeWidths([6, 3, 5, 3], cursor.contentWidth);
  const columns: Column[] = [
    { key: 'product', heading: 'Chemical', width: widths[0] },
    { key: 'cas', heading: 'CAS', width: widths[1] },
    { key: 'classification', heading: 'Classification', width: widths[2] },
    { key: 'sds', heading: 'Safety data sheet', width: widths[3] },
  ];
  if (content.inventory.length === 0) {
    cursor.text('No chemicals are recorded in the catalog.', { size: 9, color: MUTED });
  } else {
    cursor.table(columns, content.inventory, { zebra: true });
  }

  return finishDocument(
    doc,
    fonts,
    documentMeta,
    `Issued by ${meta.issuedBy}. This programme is reissued rather than edited; the superseded version is retained.`,
  );
}
