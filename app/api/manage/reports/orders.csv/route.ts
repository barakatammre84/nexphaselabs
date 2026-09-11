import { businessDay, csvResponse, dollars, toCsv, utcDay } from '@/lib/csv';
import { orderLines, reportPeriod } from '@/lib/reports';
import { canVerifyAccounts, getStaffFromRequest } from '@/lib/staff-auth';

/** One row per order line, with the lot it shipped from and its allocated cost. Admin only. */
export async function GET(request: Request) {
  const staff = await getStaffFromRequest(request);
  if (!staff) return new Response('Unauthorized', { status: 401 });
  if (!canVerifyAccounts(staff)) return new Response('Forbidden', { status: 403 });
  const url = new URL(request.url);
  const period = reportPeriod(url.searchParams.get('from'), url.searchParams.get('to'));
  const rows = await orderLines(period);
  // Order-level refund figures are printed on the first line of each order only, so a column sum is the true total.
  const seen = new Set<string>();
  const body = toCsv(
    ['Order', 'Submitted', 'Status', 'Payment method', 'Payment status', 'Paid on', 'Shipped on', 'Delivered on', 'Customer', 'Email', 'Organization', 'Consignee', 'Ship to', 'SKU', 'Product code', 'Product', 'Pack size', 'Quantity', 'Unit price', 'Line total', 'Lot', 'Allocated cost', 'Gross margin before refunds', 'Packs returned', 'Line refund share', 'Order returned on', 'Order refund', 'Order refunded on', 'Order refund reference', 'Order total', 'Order shipping', 'Order refund outstanding', 'Net line margin after refunds'],
    rows.map((r) => [
      r.orderNumber, businessDay(r.submittedOn), r.status, r.paymentMethod, r.paymentStatus, businessDay(r.paidOn), utcDay(r.shippedOn), utcDay(r.deliveredOn), r.customerName, r.customerEmail, r.organization, r.consignee, r.shipTo,
      r.sku, r.productCode, r.productName, r.packSize, r.quantity, dollars(r.unitPriceCents), dollars(r.lineTotalCents), r.lotNumber, dollars(r.costCents),
      r.costCents === null ? '' : dollars(r.lineTotalCents - r.costCents),
      r.returnedPacks ?? '',
      r.refundShareCents ? dollars(r.refundShareCents) : '',
      ...(seen.has(r.orderNumber) ? ['', '', '', '', '', '', ''] : (seen.add(r.orderNumber), [utcDay(r.returnedOn), r.refundCents === null ? '' : dollars(r.refundCents), businessDay(r.refundedOn), r.refundRef, dollars(r.orderTotalCents), dollars(r.orderShippingCents), dollars(r.refundOutstandingCents)])),
      r.costCents === null ? '' : dollars(r.lineTotalCents - r.refundShareCents - r.costCents),
    ]),
  );
  return csvResponse(`nexphase-orders-${period.fromText}-to-${period.toText}.csv`, body);
}
