import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { accounts } from '@/db/schema';
import { sendEmail } from '@/lib/email';
import { recordedBy } from '@/lib/lots-admin';
import { orderNumberFromParam } from '@/lib/order-rules';
import { getOrderByNumber, transitionOrder } from '@/lib/orders';
import { invalidateBtcpayInvoice } from '@/lib/payments';
import { publicOrigin } from '@/lib/site-config';
import { canVerifyAccounts, getStaffFromRequest, sameOrigin } from '@/lib/staff-auth';
import { ENTITY_FOOTER } from '@/lib/entity';

/** Admin cancels an order that has not shipped, with a reason the customer is sent. */
export async function POST(request: Request, { params }: { params: Promise<{ orderNumber: string }> }) {
  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const staff = await getStaffFromRequest(request);
  if (!staff) return new Response('Unauthorized', { status: 401 });
  if (!canVerifyAccounts(staff)) return new Response('Forbidden', { status: 403 });
  const { orderNumber } = await params;
  const number = orderNumberFromParam(orderNumber);
  if (!number) return new Response('Not found', { status: 404 });
  const detail = await getOrderByNumber(number);
  if (!detail) return new Response('Not found', { status: 404 });
  const back = (query: string) => Response.redirect(new URL(`/manage/orders/${number}?${query}`, request.url), 303);

  let reason = '';
  try {
    const form = await request.formData();
    reason = String(form.get('reason') ?? '').trim().slice(0, 300);
  } catch {
    return back('error=badform');
  }
  if (!reason) return back(`error=${encodeURIComponent('Give the customer a reason.')}`);

  try {
    const result = await transitionOrder(detail.order, 'cancelled', 'staff', recordedBy(staff), reason, {
      // 'refund_due' records the obligation; 'refunded' is written only when money has actually moved.
      paymentStatus: detail.order.paymentStatus === 'paid' ? 'refund_due' : detail.order.paymentStatus === 'pending' ? 'failed' : detail.order.paymentStatus,
      ...(detail.order.paymentStatus === 'paid' ? { refundDueCents: detail.order.totalCents } : {}),
    });
    if (!result.ok) return back(`error=${encodeURIComponent(result.error)}`);
    if (detail.order.paymentMethod === 'btcpay' && detail.order.paymentRef) await invalidateBtcpayInvoice(detail.order.paymentRef);
    const [account] = await getDb().select({ email: accounts.email }).from(accounts).where(eq(accounts.id, detail.order.accountId)).limit(1);
    if (account?.email) {
      await sendEmail({
        to: account.email,
        subject: `Order ${detail.order.orderNumber} cancelled — NexPhase Labs`,
        text: [
          `Order ${detail.order.orderNumber} has been cancelled.`,
          '',
          reason,
          '',
          detail.order.paymentStatus === 'paid' ? 'The payment received is due back to you and will be returned to the originating account.' : '',
          `Order details: ${publicOrigin()}/account/orders/${detail.order.orderNumber}`,
          '',
          ENTITY_FOOTER,
        ]
          .filter((l, i, arr) => !(l === '' && arr[i - 1] === ''))
          .join('\n'),
      });
    }
  } catch (error) {
    console.error('[orders] staff cancel failed', error instanceof Error ? error.message : error);
    return back('error=unavailable');
  }
  return back('cancelled=1');
}
