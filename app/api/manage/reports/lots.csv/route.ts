import { businessDay, csvResponse, dollars, toCsv, utcDay } from '@/lib/csv';
import { canDownloadSensitiveReports, exportPurpose, recordSensitiveExport } from '@/lib/report-exports';
import { lotInventory } from '@/lib/reports';
import { getStaffFromRequest } from '@/lib/staff-auth';

/** Inventory by lot with landed cost. Admin only. */
export async function GET(request: Request) {
  const staff = await getStaffFromRequest(request);
  if (!staff) return new Response('Unauthorized', { status: 401 });
  if (!canDownloadSensitiveReports(staff)) return new Response('Forbidden', { status: 403 });
  const purpose = exportPurpose(new URL(request.url).searchParams);
  if (!purpose) return new Response('An approved export purpose is required.', { status: 400 });
  const rows = await lotInventory();
  const body = toCsv(
    ['Lot', 'Product code', 'Product', 'Status', 'Received', 'Quantity received', 'Quantity remaining', 'Landed cost', 'Released', 'Retest'],
    rows.map((r) => [r.lotNumber, r.productCode, r.productName, r.status, utcDay(r.receivedOn), r.quantityReceived, r.quantityRemaining, dollars(r.costCents), businessDay(r.releasedOn), utcDay(r.retestDate)]),
  );
  await recordSensitiveExport({ staff, purpose, reportType: 'lots', filters: { snapshot: new Date().toISOString().slice(0, 10) }, rowCount: rows.length, userAgent: request.headers.get('user-agent') });
  return csvResponse(`nexphase-lots-${new Date().toISOString().slice(0, 10)}.csv`, body);
}
