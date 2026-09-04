import {
  PDFDocument,
  PDFFont,
  PDFPage,
  StandardFonts,
  rgb,
  type RGB,
} from 'pdf-lib';
import { ENTITY, entityAddressLines } from '@/lib/entity';
import {
  LETTER,
  MARGIN,
  type Column,
  type Measurer,
  alignOffset,
  columnOffsets,
  documentDate,
  documentTimestamp,
  layoutRow,
  wrapText,
  wrapToLines,
} from './layout';

/**
 * The rendering half of the document spine: pdf-lib, page furniture, and the
 * cursor that walks down a page. All layout arithmetic lives in `layout.ts`
 * and is pure; this file is the part that cannot be unit-tested without a
 * PDF, so it is kept as thin as the job allows.
 *
 * Only the standard PDF fonts are used. They need no embedding, keep the
 * worker bundle small, and — the reason that matters here — mean a
 * certificate renders identically without a font file having to be shipped
 * and licensed alongside it.
 */

export const INK = rgb(0.09, 0.1, 0.12);
export const MUTED = rgb(0.42, 0.45, 0.5);
export const RULE = rgb(0.8, 0.82, 0.85);
export const ACCENT = rgb(0.05, 0.3, 0.45);

export type Fonts = { regular: PDFFont; bold: PDFFont };

export type DocumentMeta = {
  /** `Certificate of analysis`, `Invoice`, `Packing slip`. */
  title: string;
  /** The number printed top right and used as the filename. */
  documentNumber: string;
  issuedAt: Date;
  /** Shown under the number, e.g. `Lot STG-001` or `Order NPL-1042`. */
  subtitle?: string;
  /** Printed in the footer when this document replaces an earlier one. */
  supersedes?: string | null;
};

/**
 * A page being written to, with a cursor that descends as content is added.
 * `bottom` is the y below which the footer lives.
 */
export class Cursor {
  page: PDFPage;
  y: number;

  constructor(
    private readonly doc: PDFDocument,
    private readonly fonts: Fonts,
    private readonly meta: DocumentMeta,
    page: PDFPage,
    y: number,
    readonly bottom = MARGIN + 36,
  ) {
    this.page = page;
    this.y = y;
  }

  get left(): number {
    return MARGIN;
  }

  get contentWidth(): number {
    return LETTER.width - MARGIN * 2;
  }

  measure(bold = false): Measurer {
    const font = bold ? this.fonts.bold : this.fonts.regular;
    return (text: string, size: number) => font.widthOfTextAtSize(text, size);
  }

  /** Does `height` still fit above the footer? */
  fits(height: number): boolean {
    return this.y - height >= this.bottom;
  }

  /** Start a continuation page carrying the running header. */
  newPage(): void {
    this.page = this.doc.addPage([LETTER.width, LETTER.height]);
    this.y = LETTER.height - MARGIN;
    this.runningHeader();
  }

  /** Move to a new page unless `height` still fits on this one. */
  ensure(height: number): void {
    if (!this.fits(height)) this.newPage();
  }

  private runningHeader(): void {
    const size = 8;
    this.page.drawText(
      `${this.meta.title} · ${this.meta.documentNumber}`,
      {
        x: MARGIN,
        y: LETTER.height - MARGIN + 6,
        size,
        font: this.fonts.regular,
        color: MUTED,
      },
    );
    this.y = LETTER.height - MARGIN - 6;
  }

  text(
    value: string,
    options: {
      size?: number;
      bold?: boolean;
      color?: RGB;
      indent?: number;
      width?: number;
      leading?: number;
      gap?: number;
    } = {},
  ): void {
    const size = options.size ?? 9.5;
    const leading = options.leading ?? size * 1.35;
    const font = options.bold ? this.fonts.bold : this.fonts.regular;
    const width = options.width ?? this.contentWidth - (options.indent ?? 0);
    const lines = wrapText(value, width, size, this.measure(options.bold));
    for (const line of lines) {
      this.ensure(leading);
      this.page.drawText(line, {
        x: MARGIN + (options.indent ?? 0),
        y: this.y - size,
        size,
        font,
        color: options.color ?? INK,
      });
      this.y -= leading;
    }
    if (options.gap) this.y -= options.gap;
  }

  /**
   * Section heading with a rule under it.
   *
   * Reserves room for the heading plus roughly two rows of what follows, so a
   * heading is never left sitting alone at the foot of a page with its
   * content overleaf.
   */
  heading(value: string): void {
    this.ensure(30 + 28);
    this.y -= 8;
    this.page.drawText(value.toUpperCase(), {
      x: MARGIN,
      y: this.y - 8,
      size: 8,
      font: this.fonts.bold,
      color: ACCENT,
    });
    this.y -= 13;
    this.rule();
    this.y -= 6;
  }

  rule(color: RGB = RULE): void {
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: LETTER.width - MARGIN, y: this.y },
      thickness: 0.75,
      color,
    });
  }

  /**
   * Two-column label/value list, the shape most of a certificate is. The
   * label column is fixed so values line up down the page.
   */
  fields(
    rows: [string, string | null | undefined][],
    labelWidth = 150,
    size = 9.5,
  ): void {
    const leading = size * 1.35;
    const valueWidth = this.contentWidth - labelWidth;

    // Lay every row out first so the last two can be kept together. Without
    // this a section's final field is left stranded alone on the next page,
    // detached from the heading that gives it meaning.
    const laid = rows.map(([label, raw]) => {
      const value = raw == null || raw === '' ? '—' : String(raw);
      const lines = wrapText(value, valueWidth, size, this.measure());
      return { label, lines, height: Math.max(1, lines.length) * leading + 2 };
    });

    for (let i = 0; i < laid.length; i += 1) {
      const { label, lines, height } = laid[i];
      const needed =
        i === laid.length - 2 ? height + laid[i + 1].height : height;
      this.ensure(needed);
      this.page.drawText(label, {
        x: MARGIN,
        y: this.y - size,
        size,
        font: this.fonts.bold,
        color: MUTED,
      });
      let y = this.y;
      for (const line of lines) {
        this.page.drawText(line, {
          x: MARGIN + labelWidth,
          y: y - size,
          size,
          font: this.fonts.regular,
          color: INK,
        });
        y -= leading;
      }
      this.y -= height;
    }
  }

  /**
   * Draw a table, repeating the header row on every continuation page.
   * Returns the y the table finished at.
   */
  table(
    columns: Column[],
    rows: Record<string, string>[],
    options: { size?: number; zebra?: boolean } = {},
  ): void {
    const size = options.size ?? 8.5;
    const leading = size * 1.3;
    const offsets = columnOffsets(columns, MARGIN);

    const header = () => {
      this.ensure(leading + 10);
      for (let i = 0; i < columns.length; i += 1) {
        const column = columns[i];
        const text = column.heading;
        this.page.drawText(text, {
          x:
            offsets[i] +
            alignOffset(
              text,
              column.width,
              size,
              this.measure(true),
              column.align ?? 'left',
            ),
          y: this.y - size,
          size,
          font: this.fonts.bold,
          color: MUTED,
        });
      }
      this.y -= leading + 3;
      this.rule();
      this.y -= 5;
    };

    header();

    let striped = false;
    for (const values of rows) {
      const laid = layoutRow(
        values,
        columns,
        size,
        leading,
        this.measure(),
        5,
      );
      if (!this.fits(laid.height)) {
        this.newPage();
        header();
      }
      if (options.zebra && striped) {
        this.page.drawRectangle({
          x: MARGIN - 4,
          y: this.y - laid.height + 3,
          width: this.contentWidth + 8,
          height: laid.height,
          color: rgb(0.965, 0.97, 0.975),
        });
      }
      striped = !striped;

      for (let i = 0; i < columns.length; i += 1) {
        const column = columns[i];
        let y = this.y;
        for (const line of laid.cells[i]) {
          this.page.drawText(line, {
            x:
              offsets[i] +
              alignOffset(
                line,
                column.width,
                size,
                this.measure(),
                column.align ?? 'left',
              ),
            y: y - size,
            size,
            font: this.fonts.regular,
            color: INK,
          });
          y -= leading;
        }
      }
      this.y -= laid.height;
    }
  }
}

/**
 * Start a document: letterhead, title block, and a cursor positioned under
 * them. Creation and modification dates are set from `issuedAt` rather than
 * left to the clock, so re-rendering the same record produces the same bytes.
 */
export async function beginDocument(meta: DocumentMeta): Promise<{
  doc: PDFDocument;
  cursor: Cursor;
  fonts: Fonts;
}> {
  // pdf-lib stamps its own producer string and a wall-clock ModDate when a
  // document is created. `updateMetadata: false` suppresses that; the values
  // below are set from the issue time instead, so the same record always
  // renders to the same bytes — which is what makes the stored SHA-256 mean
  // anything. Readers must pass the same option or they restamp on load.
  const doc = await PDFDocument.create({ updateMetadata: false });
  doc.setTitle(`${meta.title} ${meta.documentNumber}`);
  doc.setProducer(ENTITY.tradingName);
  doc.setCreator(ENTITY.tradingName);
  doc.setCreationDate(meta.issuedAt);
  doc.setModificationDate(meta.issuedAt);

  const fonts: Fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };

  const page = doc.addPage([LETTER.width, LETTER.height]);
  let y = LETTER.height - MARGIN;

  // Letterhead, left.
  page.drawText(ENTITY.tradingName, {
    x: MARGIN,
    y: y - 16,
    size: 16,
    font: fonts.bold,
    color: INK,
  });
  let addressY = y - 30;
  for (const line of entityAddressLines()) {
    page.drawText(line, {
      x: MARGIN,
      y: addressY,
      size: 8,
      font: fonts.regular,
      color: MUTED,
    });
    addressY -= 10;
  }

  // Title block, right.
  const right = LETTER.width - MARGIN;
  const titleWidth = fonts.bold.widthOfTextAtSize(meta.title, 13);
  page.drawText(meta.title, {
    x: right - titleWidth,
    y: y - 14,
    size: 13,
    font: fonts.bold,
    color: ACCENT,
  });
  const rightLines = [
    meta.documentNumber,
    ...(meta.subtitle ? [meta.subtitle] : []),
    `Issued ${documentDate(meta.issuedAt)}`,
  ];
  let metaY = y - 30;
  for (const line of rightLines) {
    const width = fonts.regular.widthOfTextAtSize(line, 8.5);
    page.drawText(line, {
      x: right - width,
      y: metaY,
      size: 8.5,
      font: fonts.regular,
      color: MUTED,
    });
    metaY -= 11;
  }

  y = Math.min(addressY, metaY) - 10;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: right, y },
    thickness: 1,
    color: ACCENT,
  });

  const cursor = new Cursor(doc, fonts, meta, page, y - 14);
  return { doc, cursor, fonts };
}

/**
 * Close a document: stamp every page with the issuer, the document number,
 * the issue timestamp and `Page n of m`, then serialise.
 *
 * The page count is only knowable at the end, which is why the footer is
 * written here rather than as each page is started.
 */
export async function finishDocument(
  doc: PDFDocument,
  fonts: Fonts,
  meta: DocumentMeta,
  footerNote?: string,
): Promise<Uint8Array> {
  const pages = doc.getPages();
  const total = pages.length;
  const stamp = `${ENTITY.tradingName} · ${meta.documentNumber} · issued ${documentTimestamp(meta.issuedAt)}`;
  const note = meta.supersedes
    ? `${footerNote ? `${footerNote} ` : ''}Supersedes ${meta.supersedes}.`
    : footerNote;

  for (let i = 0; i < total; i += 1) {
    const page = pages[i];
    let y = MARGIN + 20;
    page.drawLine({
      start: { x: MARGIN, y: y + 10 },
      end: { x: LETTER.width - MARGIN, y: y + 10 },
      thickness: 0.5,
      color: RULE,
    });
    if (note) {
      // Two lines, with the cut marked. A supersession note says why a
      // certificate was replaced, so dropping its tail silently would hide
      // compliance-relevant text; an ellipsis at least shows it was cut.
      const lines = wrapToLines(
        note,
        LETTER.width - MARGIN * 2,
        7,
        (t, s) => fonts.regular.widthOfTextAtSize(t, s),
        2,
      );
      let ny = y + 2 + lines.length * 9;
      for (const line of lines) {
        page.drawText(line, {
          x: MARGIN,
          y: ny,
          size: 7,
          font: fonts.regular,
          color: MUTED,
        });
        ny -= 9;
      }
      y -= 2;
    }
    page.drawText(stamp, {
      x: MARGIN,
      y: y - 8,
      size: 7,
      font: fonts.regular,
      color: MUTED,
    });
    const label = `Page ${i + 1} of ${total}`;
    page.drawText(label, {
      x: LETTER.width - MARGIN - fonts.regular.widthOfTextAtSize(label, 7),
      y: y - 8,
      size: 7,
      font: fonts.regular,
      color: MUTED,
    });
  }

  return doc.save({ useObjectStreams: false });
}
