import { describe, expect, it } from 'vitest';
import { businessDay, csvCell, dollars, toCsv, utcDay } from '@/lib/csv';
import { parseCostCents } from '@/lib/lot-rules';

describe('csv', () => {
  it('quotes, escapes and neutralises formulas', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('-5')).toBe('-5');
    expect(csvCell('@cmd')).toBe("'@cmd");
    expect(csvCell('-5.00')).toBe('-5.00');
    expect(csvCell(-12)).toBe('-12');
    expect(csvCell('-5 apples')).toBe("'-5 apples");
    expect(csvCell(null)).toBe('');
    expect(csvCell(new Date('2026-09-02T10:00:00Z'))).toBe('2026-09-02');
    expect(toCsv(['a', 'b'], [[1, 'x'], ['y,z', null]])).toBe('a,b\r\n1,x\r\n"y,z",\r\n');
    expect(dollars(4500)).toBe('45.00');
    expect(dollars(null)).toBe('');
  });
  it('reports timestamps on the business calendar and date-only values as stored', () => {
    // 2026-09-03 03:30 UTC is still 2 September in California.
    expect(businessDay(new Date('2026-09-03T03:30:00Z'))).toBe('2026-09-02');
    expect(utcDay(new Date('2026-09-03T00:00:00Z'))).toBe('2026-09-03');
    expect(businessDay(null)).toBe('');
  });
  it('parses landed cost', () => {
    expect(parseCostCents('1250')).toBe(125000);
    expect(parseCostCents('$1,250.50')).toBe(125050);
    expect(parseCostCents('')).toBeNull();
    expect(Number.isNaN(parseCostCents('lots'))).toBe(true);
  });
});
