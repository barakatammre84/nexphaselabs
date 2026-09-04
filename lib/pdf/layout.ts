/**
 * Page layout arithmetic for issued documents.
 *
 * Everything here is pure. Nothing imports pdf-lib, R2 or the database, so
 * the parts most likely to be wrong — wrapping, column fitting, pagination —
 * are unit-testable without rendering a PDF.
 *
 * Text width is not something this module can know, so callers pass a
 * `Measurer`. In the worker that is pdf-lib's `font.widthOfTextAtSize`; in
 * tests it is a fixed-width stub. The layout maths is identical either way.
 */

/** Returns the rendered width of `text` at `size` points. */
export type Measurer = (text: string, size: number) => number;

/** Points per inch, and the US Letter page this business prints on. */
export const PT_PER_INCH = 72;
export const LETTER = { width: 612, height: 792 } as const;
export const MARGIN = 54; // 0.75in

/**
 * Break `text` into lines that each fit `width`.
 *
 * Wraps on spaces. A single word wider than the column — a long object key, a
 * SMILES string, an InChI Key — is split across lines rather than allowed to
 * run off the page, because those are exactly the values these documents
 * carry.
 */
export function wrapText(
  text: string,
  width: number,
  size: number,
  measure: Measurer,
): string[] {
  if (width <= 0) return [];
  const paragraphs = String(text ?? '').split('\n');
  const out: string[] = [];

  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter((w) => w.length > 0);
    if (words.length === 0) {
      out.push('');
      continue;
    }
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate, size) <= width) {
        line = candidate;
        continue;
      }
      if (line) {
        out.push(line);
        line = '';
      }
      // The word alone may still be too wide; break it hard.
      if (measure(word, size) <= width) {
        line = word;
      } else {
        let chunk = '';
        for (const char of word) {
          if (chunk && measure(chunk + char, size) > width) {
            out.push(chunk);
            chunk = char;
          } else {
            chunk += char;
          }
        }
        line = chunk;
      }
    }
    if (line) out.push(line);
  }

  return out;
}

/**
 * Wrap, then cap at `maxLines`, marking the truncation with an ellipsis so a
 * reader can tell that text was cut rather than that it ended.
 */
export function wrapToLines(
  text: string,
  width: number,
  size: number,
  measure: Measurer,
  maxLines: number,
): string[] {
  const lines = wrapText(text, width, size, measure);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  const last = kept[maxLines - 1] ?? '';
  let trimmed = last;
  while (trimmed && measure(`${trimmed}…`, size) > width) {
    trimmed = trimmed.slice(0, -1);
  }
  kept[maxLines - 1] = `${trimmed}…`;
  return kept;
}

/** Shorten a single line to fit, with an ellipsis. Never wraps. */
export function truncateToWidth(
  text: string,
  width: number,
  size: number,
  measure: Measurer,
): string {
  const value = String(text ?? '');
  if (measure(value, size) <= width) return value;
  let trimmed = value;
  while (trimmed && measure(`${trimmed}…`, size) > width) {
    trimmed = trimmed.slice(0, -1);
  }
  return `${trimmed}…`;
}

/** Horizontal offset of `text` within `width` for the given alignment. */
export function alignOffset(
  text: string,
  width: number,
  size: number,
  measure: Measurer,
  align: 'left' | 'right' | 'center',
): number {
  if (align === 'left') return 0;
  const overflow = width - measure(text, size);
  return align === 'right' ? overflow : overflow / 2;
}

/* ------------------------------------------------------------------------ */
/* Tables                                                                     */
/* ------------------------------------------------------------------------ */

export type Column = {
  key: string;
  heading: string;
  /** Width in points. */
  width: number;
  align?: 'left' | 'right' | 'center';
  /** Cap on wrapped lines for this cell. Defaults to unlimited. */
  maxLines?: number;
};

export type LaidOutRow = {
  /** Wrapped lines per column, in column order. */
  cells: string[][];
  /** Number of text lines the tallest cell needs. */
  lines: number;
  height: number;
};

/**
 * Wrap every cell of a row to its column width and report the row height.
 * `padding` is the vertical space added below the text of every row.
 */
export function layoutRow(
  values: Record<string, string>,
  columns: Column[],
  size: number,
  leading: number,
  measure: Measurer,
  padding = 4,
): LaidOutRow {
  const cells = columns.map((column) => {
    const raw = values[column.key] ?? '';
    return column.maxLines
      ? wrapToLines(raw, column.width, size, measure, column.maxLines)
      : wrapText(raw, column.width, size, measure);
  });
  const lines = Math.max(1, ...cells.map((c) => c.length));
  return { cells, lines, height: lines * leading + padding };
}

/** Left edge of each column, given the table's left edge. */
export function columnOffsets(columns: Column[], left: number): number[] {
  const offsets: number[] = [];
  let x = left;
  for (const column of columns) {
    offsets.push(x);
    x += column.width;
  }
  return offsets;
}

/**
 * Distribute `total` width across columns by weight, so a table can be
 * declared proportionally and still land on exact points.
 */
export function distributeWidths(weights: number[], total: number): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) return weights.map(() => 0);
  const widths = weights.map((w) => Math.floor((w / sum) * total));
  // Give the rounding remainder to the widest column so the table still
  // spans exactly `total`.
  const used = widths.reduce((a, b) => a + b, 0);
  if (used < total) {
    let widest = 0;
    for (let i = 1; i < widths.length; i += 1)
      if (widths[i] > widths[widest]) widest = i;
    widths[widest] += total - used;
  }
  return widths;
}

/* ------------------------------------------------------------------------ */
/* Pagination                                                                 */
/* ------------------------------------------------------------------------ */

/**
 * Split items across pages by height.
 *
 * The first page is usually shorter than the rest because the letterhead and
 * the addressee block sit above the table. An item taller than a whole page
 * is placed on its own page rather than dropped — it will overflow, but a
 * visibly overflowing line beats a silently missing one on a document that
 * records what was in a box.
 */
export function paginate<T extends { height: number }>(
  items: T[],
  firstPageHeight: number,
  nextPageHeight: number,
): T[][] {
  if (items.length === 0) return [[]];
  const pages: T[][] = [];
  let current: T[] = [];
  let remaining = firstPageHeight;

  for (const item of items) {
    if (current.length > 0 && item.height > remaining) {
      pages.push(current);
      current = [];
      remaining = nextPageHeight;
    }
    current.push(item);
    remaining -= item.height;
  }
  pages.push(current);
  return pages;
}

/* ------------------------------------------------------------------------ */
/* Formatting                                                                 */
/* ------------------------------------------------------------------------ */

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/**
 * `4 September 2026`. Spelled out because these documents cross borders and
 * 04/09/2026 means two different days depending on who is reading it.
 * Rendered in UTC so the same record prints the same date everywhere.
 */
export function documentDate(value: Date | null | undefined): string {
  if (!value || Number.isNaN(value.getTime())) return '—';
  return `${value.getUTCDate()} ${MONTHS[value.getUTCMonth()]} ${value.getUTCFullYear()}`;
}

/** `2026-09-04T11:02:19Z`, for the audit line in the footer. */
export function documentTimestamp(value: Date): string {
  return `${value.toISOString().slice(0, 19)}Z`;
}

/** `1,234.50` — the currency code is printed once in the column heading. */
export function amount(cents: number): string {
  const negative = cents < 0;
  const absolute = Math.abs(Math.round(cents));
  const whole = Math.floor(absolute / 100).toLocaleString('en-US');
  const fraction = String(absolute % 100).padStart(2, '0');
  return `${negative ? '-' : ''}${whole}.${fraction}`;
}
