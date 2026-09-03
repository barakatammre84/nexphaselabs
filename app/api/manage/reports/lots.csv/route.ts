import { businessDay, csvResponse, dollars, toCsv, utcDay } from '@/lib/csv';
import { lotInventory } from '@/lib/reports';
import { canVerifyAccounts, getStaffFromRequest } from '@/lib/staff-auth';

/** Inventory by lot with landed cost. Admin only. */
export async function GET(request: Request) {
  const staff = await getStaffFromRequest(request);
  if (!staff) return new Response('Unauthorized', { status: 401 });
  if (!canVerifyAccounts(staff)) return new Response('Forbidden', { status: 403 });
  const rows = await lotInventory();
  const body = toCsv(
    ['Lot', 'Product code', 'Product', 'Status', 'Received', 'Manufacturer', 'Supplier', 'Quantity received', 'Quantity remaining', 'Landed cost', 'Cost note', 'Released', 'Retest'],
    rows.map((r) => [r.lotNumber, r.productCode, r.productName, r.status, utcDay(r.receivedOn), r.manufacturerName, r.supplierName, r.quantityReceived, r.quantityRemaining, dollars(r.costCents), r.costNote, businessDay(r.releasedOn), utcDay(r.retestDate)]),
  );
  return csvResponse(`nexphase-lots-${new Date().toISOString().slice(0, 10)}.csv`, body);
}
