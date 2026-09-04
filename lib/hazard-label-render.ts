import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import {
  LABEL_SIZES,
  SIGNAL_WORD_LABEL,
  type LabelContent,
  type LabelSize,
} from '@/lib/hazard';
import { wrapText, type Measurer } from '@/lib/pdf/layout';

/**
 * Drawing a GHS container label.
 *
 * Not built on the letterhead document spine: a label is a small adhesive
 * rectangle, not a page, and every point of it is contested.
 *
 * The rule this file exists to enforce is that nothing required is ever
 * dropped. 29 CFR 1910.1200(f)(1) names six elements — product identifier,
 * signal word, hazard statements, pictograms, precautionary statements, and
 * the name, address and telephone of the responsible party — and a label
 * missing one of them is the citation. So the whole label is measured before
 * anything is drawn, and if it does not fit the chosen stock the render is
 * refused with a message naming a size that would. A label that quietly
 * loses its last line is the failure mode worth engineering against.
 *
 * Pictogram artwork is passed in; the caller has already refused to render a
 * label whose artwork is missing.
 */

const INK = rgb(0, 0, 0);
const RED = rgb(0.8, 0.05, 0.05);

export type LabelArtwork = Record<string, Uint8Array>;

export class LabelTooSmallError extends Error {
  constructor(size: LabelSize, needed: number, available: number) {
    super(
      `The label content needs ${Math.ceil(needed)}pt of height but ${LABEL_SIZES[size].label} gives ${Math.floor(available)}pt. Choose a larger label size.`,
    );
    this.name = 'LabelTooSmallError';
  }
}

type Block = { lines: string[]; size: number; bold?: boolean; color?: typeof INK };

function blockHeight(block: Block): number {
  return block.lines.length * block.size * 1.18;
}

export async function renderLabel(
  content: LabelContent,
  size: LabelSize,
  artwork: LabelArtwork,
  meta: { issuedAt: Date; documentNumber: string; copies?: number },
): Promise<Uint8Array> {
  const stock = LABEL_SIZES[size];
  const doc = await PDFDocument.create({ updateMetadata: false });
  doc.setTitle(`Container label ${meta.documentNumber}`);
  doc.setCreationDate(meta.issuedAt);
  doc.setModificationDate(meta.issuedAt);

  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const measure =
    (font: typeof regular): Measurer =>
    (text, points) =>
      font.widthOfTextAtSize(text, points);

  const images: Record<string, Awaited<ReturnType<typeof doc.embedPng>>> = {};
  for (const code of content.pictograms) {
    const bytes = artwork[code];
    if (bytes) images[code] = await doc.embedPng(bytes);
  }

  const pad = size === 'vial' ? 5 : 8;
  const scale = size === 'vial' ? 0.72 : 1;
  const width = stock.width - pad * 2;
  const available = stock.height - pad * 2;

  const block = (
    text: string,
    points: number,
    opts: { bold?: boolean; color?: typeof INK } = {},
  ): Block => ({
    lines: wrapText(text, width, points, measure(opts.bold ? bold : regular)),
    size: points,
    bold: opts.bold,
    color: opts.color,
  });

  // 1. Product identifier and the identity line beneath it.
  const identity = [
    content.casNumber ? `CAS ${content.casNumber}` : null,
    content.lotNumber ? `Lot ${content.lotNumber}` : null,
    content.packSize,
  ]
    .filter(Boolean)
    .join(' · ');

  const head: Block[] = [block(content.productIdentifier, 8 * scale, { bold: true })];
  if (identity) head.push(block(identity, 6 * scale));

  // 2. Pictogram and signal-word band.
  const boxSize = content.pictograms.length > 0 ? (size === 'vial' ? 20 : 34) : 0;
  const bandHeight =
    boxSize > 0
      ? boxSize + 4
      : content.signalWord !== 'none'
        ? 11 * scale * 1.18 + 2
        : 0;

  // 3 and 4. Hazard then precautionary statements.
  const body: Block[] = [
    ...content.hazardStatements.map((s) => block(s, 6 * scale, { bold: true })),
    ...content.precautionaryStatements.map((s) => block(s, 5.7 * scale)),
  ];

  // The research-use condition, and 5. the responsible party, anchored at the
  // foot. Measured with the rest so they can never be squeezed off.
  const foot: Block[] = [
    block(content.useStatement, 5.4 * scale),
    ...content.responsible.map((r) => block(r, 5.2 * scale)),
  ];

  const needed =
    head.reduce((sum, b) => sum + blockHeight(b), 0) +
    2 +
    bandHeight +
    body.reduce((sum, b) => sum + blockHeight(b), 0) +
    3 +
    foot.reduce((sum, b) => sum + blockHeight(b), 0);

  if (needed > available) throw new LabelTooSmallError(size, needed, available);

  const copies = Math.max(1, Math.min(meta.copies ?? 1, 100));
  for (let copy = 0; copy < copies; copy += 1) {
    const page = doc.addPage([stock.width, stock.height]);

    const draw = (blocks: Block[], from: number): number => {
      let y = from;
      for (const b of blocks) {
        const font = b.bold ? bold : regular;
        for (const line of b.lines) {
          page.drawText(line, {
            x: pad,
            y: y - b.size,
            size: b.size,
            font,
            color: b.color ?? INK,
          });
          y -= b.size * 1.18;
        }
      }
      return y;
    };

    let y = draw(head, stock.height - pad) - 2;

    if (content.pictograms.length > 0) {
      let x = pad;
      for (const code of content.pictograms) {
        const image = images[code];
        if (image) {
          page.drawImage(image, { x, y: y - boxSize, width: boxSize, height: boxSize });
        } else {
          page.drawRectangle({
            x,
            y: y - boxSize,
            width: boxSize,
            height: boxSize,
            borderColor: RED,
            borderWidth: 1.2,
          });
        }
        x += boxSize + 3;
      }
      if (content.signalWord !== 'none') {
        const points = size === 'vial' ? 9 : 13;
        page.drawText(SIGNAL_WORD_LABEL[content.signalWord], {
          x: x + 2,
          y: y - boxSize / 2 - points / 3,
          size: points,
          font: bold,
          color: RED,
        });
      }
      y -= bandHeight;
    } else if (content.signalWord !== 'none') {
      y = draw([block(SIGNAL_WORD_LABEL[content.signalWord], 11 * scale, { bold: true, color: RED })], y) - 2;
    }

    draw(body, y);

    // The foot is drawn from the bottom up, so the required lines occupy the
    // space reserved for them regardless of how the body flowed.
    const footHeight = foot.reduce((sum, b) => sum + blockHeight(b), 0);
    draw(foot, pad + footHeight);
  }

  return doc.save({ useObjectStreams: false });
}
