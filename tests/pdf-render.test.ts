import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { beginDocument, finishDocument } from '@/lib/pdf/render';
import { distributeWidths, type Column } from '@/lib/pdf/layout';

/**
 * The renderer is exercised for real here rather than mocked: these tests
 * produce actual PDF bytes and read them back. `render.ts` touches pdf-lib
 * but neither R2 nor D1, so it runs unchanged under vitest, and a broken
 * document is caught before it is ever issued to a customer.
 */

const ISSUED = new Date('2026-09-04T11:02:19Z');

const meta = {
  title: 'Certificate of analysis',
  documentNumber: 'COA-TEST-001',
  subtitle: 'Lot TEST-001',
  issuedAt: ISSUED,
};

async function render(rows: Record<string, string>[], supersedes?: string) {
  const { doc, cursor, fonts } = await beginDocument({ ...meta, supersedes });
  cursor.heading('Identity');
  cursor.fields([
    ['Product', 'Test compound'],
    ['CAS number', '000-00-0'],
    ['Manufacturer', null],
  ]);
  const widths = distributeWidths([3, 2, 2, 1], cursor.contentWidth);
  const columns: Column[] = [
    { key: 'test', heading: 'Test', width: widths[0] },
    { key: 'method', heading: 'Method', width: widths[1] },
    { key: 'result', heading: 'Result', width: widths[2] },
    { key: 'passed', heading: 'Outcome', width: widths[3], align: 'right' },
  ];
  cursor.table(columns, rows, { zebra: true });
  return finishDocument(doc, fonts, { ...meta, supersedes }, 'Conditions of supply apply.');
}

const row = (n: number) => ({
  test: `Test ${n}`,
  method: 'RP-HPLC-UV at 214 nm',
  result: '99.2 percent',
  passed: 'Pass',
});

describe('document rendering', () => {
  it('produces a readable single-page PDF', async () => {
    const bytes = await render([row(1), row(2)]);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    const parsed = await PDFDocument.load(bytes, { updateMetadata: false });
    expect(parsed.getPageCount()).toBe(1);
    expect(parsed.getTitle()).toBe('Certificate of analysis COA-TEST-001');
  });

  // pdf-lib rewrites Info metadata on load as well as on create, so the
  // reader must opt out too or it measures its own clock rather than ours.
  it('sets the document dates from the issue time, not the clock', async () => {
    const parsed = await PDFDocument.load(await render([row(1)]), { updateMetadata: false });
    expect(parsed.getCreationDate()?.toISOString()).toBe(ISSUED.toISOString());
    expect(parsed.getModificationDate()?.toISOString()).toBe(ISSUED.toISOString());
  });

  it('is byte-identical when the same record is rendered twice', async () => {
    // The store hashes what it writes, so rendering must not vary run to run
    // or a reissued document would look like a changed one.
    const a = await render([row(1), row(2)]);
    const b = await render([row(1), row(2)]);
    expect(Buffer.from(b).equals(Buffer.from(a))).toBe(true);
  });

  it('paginates a long table instead of overflowing one page', async () => {
    const many = Array.from({ length: 60 }, (_, i) => row(i + 1));
    const parsed = await PDFDocument.load(await render(many), { updateMetadata: false });
    expect(parsed.getPageCount()).toBeGreaterThan(1);
  });

  it('renders a supersession note without failing', async () => {
    const bytes = await render([row(1)], 'COA-TEST-001.R1');
    expect((await PDFDocument.load(bytes, { updateMetadata: false })).getPageCount()).toBe(1);
  });

  it('survives values far wider than their column', async () => {
    const bytes = await render([
      {
        test: 'InChIKey',
        method: 'X'.repeat(400),
        result: 'A'.repeat(200),
        passed: 'Pass',
      },
    ]);
    expect((await PDFDocument.load(bytes, { updateMetadata: false })).getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it('renders an empty table without throwing', async () => {
    const bytes = await render([]);
    expect((await PDFDocument.load(bytes, { updateMetadata: false })).getPageCount()).toBe(1);
  });
});
