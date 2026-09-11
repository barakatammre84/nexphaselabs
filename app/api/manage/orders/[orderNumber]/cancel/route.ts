import { recordedBy } from '@/lib/lots-admin';
import { orderNumberFromParam } from '@/lib/order-rules';
import { getOrderByNumber, transitionOrder } from '@/lib/orders';
import { invalidateBtcpayInvoice } from '@/lib/payments';
import { currentShippingLabel } from '@/lib/shipping-labels';
import {
  canVerifyAccounts,
  getStaffFromRequest,
  sameOrigin,
} from '@/lib/staff-auth';

/** Admin cancels an unshipped order; its event queues a secure order-page notice. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderNumber: string }> },
) {
  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const staff = await getStaffFromRequest(request);
  if (!staff) return new Response('Unauthorized', { status: 401 });
  if (!canVerifyAccounts(staff))
    return new Response('Forbidden', { status: 403 });
  const { orderNumber } = await params;
  const number = orderNumberFromParam(orderNumber);
  if (!number) return new Response('Not found', { status: 404 });
  const detail = await getOrderByNumber(number);
  if (!detail) return new Response('Not found', { status: 404 });
  const back = (query: string) =>
    Response.redirect(
      new URL(`/manage/orders/${number}?${query}`, request.url),
      303,
    );

  let reason = '';
  try {
    const form = await request.formData();
    reason = String(form.get('reason') ?? '')
      .trim()
      .slice(0, 300);
  } catch {
    return back('error=badform');
  }
  if (!reason)
    return back(`error=${encodeURIComponent('Give the customer a reason.')}`);

  const shippingLabel = await currentShippingLabel(detail.order.id);
  if (shippingLabel && shippingLabel.state !== 'voided')
    return back(
      `error=${encodeURIComponent('Cancel or reconcile the active shipping label before cancelling this order.')}`,
    );

  try {
    const result = await transitionOrder(
      detail.order,
      'cancelled',
      'staff',
      recordedBy(staff),
      reason,
      {
        // 'refund_due' records the obligation; 'refunded' is written only when money has actually moved.
        paymentStatus:
          detail.order.paymentStatus === 'paid'
            ? 'refund_due'
            : detail.order.paymentStatus === 'pending'
              ? 'failed'
              : detail.order.paymentStatus,
        ...(detail.order.paymentStatus === 'paid'
          ? { refundDueCents: detail.order.totalCents }
          : {}),
      },
    );
    if (!result.ok) return back(`error=${encodeURIComponent(result.error)}`);
    if (detail.order.paymentMethod === 'btcpay' && detail.order.paymentRef)
      await invalidateBtcpayInvoice(detail.order.paymentRef);
  } catch (error) {
    console.error(
      '[orders] staff cancel failed',
      error instanceof Error ? error.message : error,
    );
    return back('error=unavailable');
  }
  return back('cancelled=1');
}
