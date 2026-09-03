import { csvResponse, toCsv, utcDay } from '@/lib/csv';
import { movementLedger } from '@/lib/reports';
import { canVerifyAccounts, getStaffFromRequest } from '@/lib/staff-auth';

/** The movement ledger: every receipt, shipment, return, destruction. Admin only; never public. */
export async function GET(request: Request) {
  const staff = await getStaffFromRequest(request);
  if (!staff) return new Response('Unauthorized', { status: 401 });
  if (!canVerifyAccounts(staff)) return new Response('Forbidden', { status: 403 });
  const rows = await movementLedger();
  const body = toCsv(
    ['Date', 'Type', 'Lot', 'Product code', 'Product', 'Quantity', 'Consignee', 'Institution', 'Ship to', 'Carrier', 'Tracking', 'Recorded by', 'Note'],
    rows.map((r) => [utcDay(r.occurredOn), r.movementType, r.lotNumber, r.productCode, r.productName, r.quantity, r.consigneeName, r.consigneeInstitution, r.shipToAddress, r.carrier, r.trackingNumber, r.recordedBy, r.note]),
  );
  return csvResponse(`nexphase-movements-${new Date().toISOString().slice(0, 10)}.csv`, body);
}
