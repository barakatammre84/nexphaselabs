import { manualPaymentRecording } from '@/lib/manual-payment-rules';
import { orderNumberFromParam } from '@/lib/order-rules';
import { getOrderByNumber, markOrderPaid } from '@/lib/orders';
import { recordedBy } from '@/lib/lots-admin';
import { canVerifyAccounts, getStaffFromRequest, sameOrigin } from '@/lib/staff-auth';
import { zelleMode } from '@/lib/zelle-config';

/**
 * Admin records that payment for an order has arrived, with the reference that
 * proves it. Only for rails a person reconciles by hand: BTCPay and inbox-matched
 * Zelle payments settle through their own checks and are refused here.
 */
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
  let reference: string | null = null;
  try {
    const form = await request.formData();
    reference = String(form.get('reference') ?? '').trim().slice(0, 120) || null;
  } catch {
    reference = null;
  }
  const back = (query: string) => Response.redirect(new URL(`/manage/orders/${number}?${query}`, request.url), 303);
  const manual = manualPaymentRecording(detail.order.paymentMethod, zelleMode());
  if (!manual.allowed) return back(`error=${encodeURIComponent(manual.reason)}`);
  if (!reference) return back(`error=${encodeURIComponent('Enter the bank, Zelle or invoice reference for this payment.')}`);
  try {
    const result = await markOrderPaid(detail, recordedBy(staff), reference);
    if (!result.ok) return back(`error=${encodeURIComponent(result.error)}`);
    // Late money cancels the order with a refund due; the page must not say "Payment recorded" alone.
    return back(result.outcome === 'cancelled' ? 'paid=cancelled' : 'paid=1');
  } catch (error) {
    console.error('[orders] mark paid failed', error instanceof Error ? error.message : error);
    return back('error=unavailable');
  }
}
