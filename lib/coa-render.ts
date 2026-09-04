import { buildCoaContent, type CoaContent, type CoaSubject } from '@/lib/coa-content';
import { distributeWidths, type Column } from '@/lib/pdf/layout';
import { ACCENT, beginDocument, finishDocument, MUTED } from '@/lib/pdf/render';

/**
 * Drawing the certificate.
 *
 * Kept apart from `lib/coa.ts` because that module reaches the database and
 * the bucket, and this one must not: the certificate can then be rendered and
 * inspected — in a test, or from a script — without a worker runtime. What it
 * says is decided in `coa-content.ts`; this file only puts it on the page.
 */

export async function renderCoa(
  content: CoaContent,
  meta: { documentNumber: string; issuedAt: Date; supersedes?: string | null; issuedBy: string },
): Promise<Uint8Array> {
  const documentMeta = {
    title: 'Certificate of analysis',
    documentNumber: meta.documentNumber,
    subtitle: content.subtitle,
    issuedAt: meta.issuedAt,
    supersedes: meta.supersedes ?? null,
  };
  const { doc, cursor, fonts } = await beginDocument(documentMeta);

  // Conditions of supply go in the body, above the analysis — not in the
  // footer. A disclaimer sitting under a claim is the fact pattern that has
  // failed for every seller in this category.
  cursor.text(content.statement, { size: 8.5, color: ACCENT, gap: 4 });

  if (content.draftNotice) {
    cursor.text(content.draftNotice, { size: 8.5, bold: true, gap: 2 });
  }

  for (const section of [content.identity, content.provenance]) {
    cursor.heading(section.heading);
    cursor.fields(section.fields);
  }

  cursor.heading('Analytical results');
  const widths = distributeWidths([5, 5, 4, 4, 2], cursor.contentWidth);
  const columns: Column[] = [
    { key: 'test', heading: 'Test', width: widths[0] },
    { key: 'method', heading: 'Method', width: widths[1] },
    { key: 'specification', heading: 'Specification', width: widths[2] },
    { key: 'result', heading: 'Result', width: widths[3] },
    { key: 'outcome', heading: 'Outcome', width: widths[4], align: 'right' },
  ];
  if (content.results.length === 0) {
    cursor.text('No test results are recorded against this lot.', {
      size: 9,
      color: MUTED,
    });
  } else {
    cursor.table(
      columns,
      content.results as unknown as Record<string, string>[],
      { zebra: true },
    );
  }

  for (const section of [content.summary, content.handling]) {
    cursor.heading(section.heading);
    cursor.fields(section.fields);
  }

  cursor.heading('Authorisation');
  cursor.fields([
    ['Issued by', meta.issuedBy],
    ['Certificate number', meta.documentNumber],
  ]);

  return finishDocument(
    doc,
    fonts,
    documentMeta,
    'The results above relate only to the lot identified. This certificate may not be reproduced except in full.',
  );
}

/** Convenience for callers that hold a subject rather than built content. */
export async function renderCoaFor(
  subject: CoaSubject,
  meta: { documentNumber: string; issuedAt: Date; supersedes?: string | null; issuedBy: string },
): Promise<Uint8Array> {
  return renderCoa(buildCoaContent(subject), meta);
}
