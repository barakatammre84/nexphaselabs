import { businessDay, csvResponse, dollars, toCsv, utcDay } from '@/lib/csv';
import { orderLines } from '@/lib/reports';
import { canVerifyAccounts, getStaffFromRequest } from '@/lib/staff-auth';

/** One row per order line, with the lot it shipped from and its allocated cost. Admin only. */
export async function GET(request: Request) {
  const staff = await getStaffFromRequest(request);
  if (!staff) return new Response('Unauthorized', { status: 401 });
  if (!canVerifyAccounts(staff)) return new Response('Forbidden', { status: 403 });
  const rows = await orderLines();
  const body = toCsv(
    ['Order', 'Submitted', 'Status', 'Payment method', 'Payment status', 'Paid on', 'Shipped on', 'Customer', 'Email', 'Organization', 'Consignee', 'Ship to', 'SKU', 'Product code', 'Product', 'Pack size', 'Quantity', 'Unit price', 'Line total', 'Lot', 'Allocated cost', 'Margin'],
    rows.map((r) => [
      r.orderNumber, businessDay(r.submittedOn), r.status, r.paymentMethod, r.paymentStatus, businessDay(r.paidOn), utcDay(r.shippedOn), r.customerName, r.customerEmail, r.organization, r.consignee, r.shipTo,
      r.sku, r.productCode, r.productName, r.packSize, r.quantity, dollars(r.unitPriceCents), dollars(r.lineTotalCents), r.lotNumber, dollars(r.costCents),
      r.costCents === null ? '' : dollars(r.lineTotalCents - r.costCents),
    ]),
  );
  return csvResponse(`nexphase-orders-${new Date().toISOString().slice(0, 10)}.csv`, body);
}
