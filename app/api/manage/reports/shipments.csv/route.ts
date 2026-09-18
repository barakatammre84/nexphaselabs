import { csvResponse, toCsv, utcDay } from '@/lib/csv';
import { canDownloadSensitiveReports, exportPurpose, recordSensitiveExport } from '@/lib/report-exports';
import { movementLedger, reportPeriod } from '@/lib/reports';
import { getStaffFromRequest } from '@/lib/staff-auth';

/** The movement ledger: every receipt, shipment, return, destruction. Admin only; never public. */
export async function GET(request: Request) {
  const staff = await getStaffFromRequest(request);
  if (!staff) return new Response('Unauthorized', { status: 401 });
  if (!canDownloadSensitiveReports(staff)) return new Response('Forbidden', { status: 403 });
  const url = new URL(request.url);
  const purpose = exportPurpose(url.searchParams);
  if (!purpose) return new Response('An approved export purpose is required.', { status: 400 });
  const period = reportPeriod(url.searchParams.get('from'), url.searchParams.get('to'));
  const rows = await movementLedger(period);
  const body = toCsv(
    ['Date', 'Type', 'Direction', 'Lot', 'Product code', 'Product', 'Quantity', 'Consignee', 'Institution', 'Ship to', 'Carrier', 'Tracking'],
    rows.map((r) => [utcDay(r.occurredOn), r.movementType, r.direction, r.lotNumber, r.productCode, r.productName, r.quantity, r.consigneeName, r.consigneeInstitution, r.shipToAddress, r.carrier, r.trackingNumber]),
  );
  await recordSensitiveExport({ staff, purpose, reportType: 'shipments', filters: { from: period.fromText, to: period.toText }, rowCount: rows.length, userAgent: request.headers.get('user-agent') });
  return csvResponse(`nexphase-movements-${period.fromText}-to-${period.toText}.csv`, body);
}
