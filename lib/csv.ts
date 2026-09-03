/**
 * CSV writer for accounting exports. RFC 4180 quoting, CRLF line ends, and a
 * guard against spreadsheet formula injection: a cell beginning with = + - @
 * or a tab/CR is prefixed with an apostrophe so it is read as text.
 */
/** The business operates in California; wall-clock timestamps are reported on that calendar. */
export const BUSINESS_TIME_ZONE = 'America/Los_Angeles';

/** A date-only value stored at UTC midnight (ship date, receipt date, retest). */
export function utcDay(d: Date | null | undefined): string {
  return d ? d.toISOString().slice(0, 10) : '';
}

/** A real timestamp (order submitted, paid, lot released) on the business calendar. */
export function businessDay(d: Date | null | undefined): string {
  if (!d) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

const NUMERIC = /^-?\d+(?:\.\d+)?$/;

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return utcDay(value);
  let text = String(value);
  // Plain numbers (including negative margins) stay numbers; only free text gets the guard.
  if (!NUMERIC.test(text) && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[",\r\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function csvResponse(filename: string, body: string): Response {
  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename.replace(/[^A-Za-z0-9._-]/g, '_')}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export function dollars(cents: number | null | undefined): string {
  return cents === null || cents === undefined ? '' : (cents / 100).toFixed(2);
}
