import { commissionLedger, payoutYearTotals } from '@/lib/affiliates';
import { businessDay, csvResponse, dollars, toCsv } from '@/lib/csv';
import { canDownloadSensitiveReports, exportPurpose, recordSensitiveExport } from '@/lib/report-exports';
import { getStaffFromRequest } from '@/lib/staff-auth';

/**
 * The partner commission ledger, and with `?year=YYYY` the calendar-year payment total per
 * partner. The first is what the bookkeeping entry is built from: accrued commission is a
 * liability and a sent payout discharges it. The second is the figure a contractor information
 * return is prepared from. Admin only.
 */
export async function GET(request: Request) {
  const staff = await getStaffFromRequest(request);
  if (!staff) return new Response('Unauthorized', { status: 401 });
  if (!canDownloadSensitiveReports(staff)) return new Response('Forbidden', { status: 403 });

  const url = new URL(request.url);
  const purpose = exportPurpose(url.searchParams);
  if (!purpose) return new Response('A purpose of 12 to 200 characters is required.', { status: 400 });
  const year = Number(url.searchParams.get('year') ?? '');
  if (Number.isInteger(year) && year > 2000) {
    const rows = await payoutYearTotals(year);
    const body = toCsv(
      ['Partner', 'Code', 'Tax form', 'Form filed at', 'Payouts', 'Paid in year'],
      rows.map((r) => [r.name, r.code, r.taxFormStatus, r.taxFormReference ?? '', r.payouts, dollars(r.paidCents)]),
    );
    await recordSensitiveExport({ staff, purpose, reportType: 'affiliate-year-totals', filters: { year: String(year) }, userAgent: request.headers.get('user-agent') });
    return csvResponse(`nexphase-partner-payments-${year}.csv`, body);
  }

  const rows = await commissionLedger();
  const body = toCsv(
    ['Order', 'Partner', 'Code', 'Accrued', 'Basis', 'Rate', 'Commission', 'Status', 'Vested', 'Paid out', 'Payment reference'],
    rows.map((r) => [
      r.orderNumber, r.partner, r.code, businessDay(r.createdAt), dollars(r.basisCents), `${(r.rateBps / 100).toFixed(2)}%`,
      dollars(r.amountCents), r.status, businessDay(r.vestedAt), businessDay(r.payoutSentAt), r.payoutReference ?? '',
    ]),
  );
  await recordSensitiveExport({ staff, purpose, reportType: 'affiliate-commissions', filters: {}, userAgent: request.headers.get('user-agent') });
  return csvResponse('nexphase-partner-commissions.csv', body);
}
