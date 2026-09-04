import { describe, expect, it } from 'vitest';
import {
  alignOffset,
  amount,
  columnOffsets,
  distributeWidths,
  documentDate,
  documentTimestamp,
  layoutRow,
  paginate,
  truncateToWidth,
  wrapText,
  wrapToLines,
  type Column,
  type Measurer,
} from '@/lib/pdf/layout';

/** Fixed-width stub: every glyph is half the point size wide. */
const measure: Measurer = (text, size) => text.length * (size / 2);

describe('wrapText', () => {
  it('wraps on spaces at the given width', () => {
    // At size 10 each character is 5pt, so 50pt holds 10 characters.
    expect(wrapText('one two three four', 50, 10, measure)).toEqual([
      'one two',
      'three four',
    ]);
  });

  it('keeps explicit line breaks', () => {
    expect(wrapText('alpha\nbeta', 500, 10, measure)).toEqual(['alpha', 'beta']);
  });

  it('hard-splits a word wider than the column', () => {
    // An InChI key or object key must not run off the page.
    const lines = wrapText('ABCDEFGHIJKLMNO', 25, 10, measure);
    expect(lines).toEqual(['ABCDE', 'FGHIJ', 'KLMNO']);
    for (const line of lines) expect(measure(line, 10)).toBeLessThanOrEqual(25);
  });

  it('breaks a chemical name at its hyphens, keeping the hyphen on the line', () => {
    // A systematic name is one unbroken word. Breaking it mid-syllable
    // ("L-alph | a-aspartyl") is what a reader of a certificate sees as an
    // error, so hyphen boundaries are used before arbitrary ones.
    const name = 'glycyl-L-alpha-glutamyl-L-prolyl-L-prolyl';
    const lines = wrapText(name, 60, 10, measure);
    for (const line of lines) expect(measure(line, 10)).toBeLessThanOrEqual(60);
    expect(lines.join('')).toBe(name);
    for (const line of lines.slice(0, -1)) expect(line.endsWith('-')).toBe(true);
  });

  it('still breaks a hyphenless word that no boundary can fit', () => {
    // A SMILES string or an object key offers nothing to break on.
    const lines = wrapText('CCCCCCCCCCCCCCCC', 25, 10, measure);
    expect(lines.join('')).toBe('CCCCCCCCCCCCCCCC');
    for (const line of lines) expect(measure(line, 10)).toBeLessThanOrEqual(25);
  });

  it('breaks a hyphen segment that is itself too wide', () => {
    const word = 'ab-CDEFGHIJKLMNOP-yz';
    const lines = wrapText(word, 25, 10, measure);
    expect(lines.join('')).toBe(word);
    for (const line of lines) expect(measure(line, 10)).toBeLessThanOrEqual(25);
  });

  it('splits a long word that follows normal words', () => {
    const lines = wrapText('note ABCDEFGHIJ', 25, 10, measure);
    expect(lines[0]).toBe('note');
    expect(lines.slice(1)).toEqual(['ABCDE', 'FGHIJ']);
  });

  it('returns nothing for a non-positive width instead of looping', () => {
    expect(wrapText('anything', 0, 10, measure)).toEqual([]);
  });

  it('treats empty and whitespace-only input as one empty line', () => {
    expect(wrapText('', 100, 10, measure)).toEqual(['']);
    expect(wrapText('   ', 100, 10, measure)).toEqual(['']);
  });
});

describe('wrapToLines', () => {
  it('passes short text through untouched', () => {
    expect(wrapToLines('one two', 50, 10, measure, 3)).toEqual(['one two']);
  });

  it('caps at maxLines and marks the cut with an ellipsis', () => {
    const lines = wrapToLines('one two three four five six', 50, 10, measure, 2);
    expect(lines).toHaveLength(2);
    expect(lines[1].endsWith('…')).toBe(true);
    expect(measure(lines[1], 10)).toBeLessThanOrEqual(50);
  });
});

describe('truncateToWidth', () => {
  it('leaves text that fits', () => {
    expect(truncateToWidth('short', 100, 10, measure)).toBe('short');
  });

  it('cuts to fit including the ellipsis', () => {
    const out = truncateToWidth('a very long value indeed', 30, 10, measure);
    expect(out.endsWith('…')).toBe(true);
    expect(measure(out, 10)).toBeLessThanOrEqual(30);
  });
});

describe('alignOffset', () => {
  it('is zero for left, the slack for right, and half for centre', () => {
    // 'abcd' at size 10 is 20pt wide in a 100pt column.
    expect(alignOffset('abcd', 100, 10, measure, 'left')).toBe(0);
    expect(alignOffset('abcd', 100, 10, measure, 'right')).toBe(80);
    expect(alignOffset('abcd', 100, 10, measure, 'center')).toBe(40);
  });
});

describe('distributeWidths', () => {
  it('spans exactly the total width', () => {
    for (const weights of [
      [1, 1, 1],
      [3, 1],
      [5, 2, 2, 1],
      [1, 1, 1, 1, 1, 1, 1],
    ]) {
      const widths = distributeWidths(weights, 504);
      expect(widths.reduce((a, b) => a + b, 0)).toBe(504);
    }
  });

  it('keeps the proportions', () => {
    expect(distributeWidths([3, 1], 400)).toEqual([300, 100]);
  });

  it('does not divide by zero', () => {
    expect(distributeWidths([0, 0], 400)).toEqual([0, 0]);
  });
});

describe('columnOffsets', () => {
  it('accumulates from the left edge', () => {
    const columns: Column[] = [
      { key: 'a', heading: 'A', width: 100 },
      { key: 'b', heading: 'B', width: 50 },
      { key: 'c', heading: 'C', width: 25 },
    ];
    expect(columnOffsets(columns, 54)).toEqual([54, 154, 204]);
  });
});

describe('layoutRow', () => {
  const columns: Column[] = [
    { key: 'name', heading: 'Name', width: 50 },
    { key: 'note', heading: 'Note', width: 50, maxLines: 2 },
  ];

  it('is as tall as its tallest cell', () => {
    const row = layoutRow(
      { name: 'one two three', note: 'x' },
      columns,
      10,
      13,
      measure,
      4,
    );
    expect(row.lines).toBe(2);
    expect(row.height).toBe(2 * 13 + 4);
  });

  it('honours a per-column line cap', () => {
    const row = layoutRow(
      { name: 'a', note: 'one two three four five six seven' },
      columns,
      10,
      13,
      measure,
    );
    expect(row.cells[1]).toHaveLength(2);
  });

  it('renders a missing key as empty rather than undefined', () => {
    const row = layoutRow({ name: 'a' }, columns, 10, 13, measure);
    expect(row.cells[1]).toEqual(['']);
    expect(row.lines).toBe(1);
  });
});

describe('paginate', () => {
  const rows = (heights: number[]) => heights.map((height) => ({ height }));

  it('returns a single empty page for no items', () => {
    expect(paginate([], 100, 200)).toEqual([[]]);
  });

  it('keeps everything on one page when it fits', () => {
    expect(paginate(rows([10, 10, 10]), 100, 200)).toHaveLength(1);
  });

  it('breaks to a taller continuation page', () => {
    const pages = paginate(rows([40, 40, 40, 40]), 100, 200);
    expect(pages[0]).toHaveLength(2);
    expect(pages[1]).toHaveLength(2);
  });

  it('never drops an item taller than a whole page', () => {
    const pages = paginate(rows([10, 500, 10]), 100, 200);
    expect(pages.flat()).toHaveLength(3);
  });

  it('accounts for every item exactly once', () => {
    const items = rows([30, 30, 30, 30, 30, 30, 30]);
    const pages = paginate(items, 60, 90);
    expect(pages.flat()).toEqual(items);
  });
});

describe('documentDate', () => {
  it('spells the month out so the date is unambiguous across borders', () => {
    expect(documentDate(new Date('2026-09-04T00:00:00Z'))).toBe('4 September 2026');
  });

  it('reads in UTC, not the local zone', () => {
    // 23:30 UTC is still the 4th; a local-time reading in the Americas would
    // print the 4th too, but a reading in Asia would print the 5th.
    expect(documentDate(new Date('2026-09-04T23:30:00Z'))).toBe('4 September 2026');
  });

  it('renders a missing or invalid date as a dash', () => {
    expect(documentDate(null)).toBe('—');
    expect(documentDate(new Date('nope'))).toBe('—');
  });
});

describe('documentTimestamp', () => {
  it('is second-precision UTC', () => {
    expect(documentTimestamp(new Date('2026-09-04T11:02:19.512Z'))).toBe(
      '2026-09-04T11:02:19Z',
    );
  });
});

describe('amount', () => {
  it('groups thousands and always shows two decimals', () => {
    expect(amount(123450)).toBe('1,234.50');
    expect(amount(5)).toBe('0.05');
    expect(amount(0)).toBe('0.00');
    expect(amount(100)).toBe('1.00');
  });

  it('keeps the sign on a credit', () => {
    expect(amount(-2500)).toBe('-25.00');
  });
});
