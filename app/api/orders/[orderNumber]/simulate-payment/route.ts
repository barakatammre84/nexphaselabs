import { getBuyerFromRequest } from '@/lib/buyer-session';
import { orderNumberFromParam } from '@/lib/order-rules';
import { getOrderForAccount, markOrderPaid } from '@/lib/orders';
import { buyerSimulationEnabled } from '@/lib/payments';
import { redirectWithNotice } from '@/lib/notice';
import { sameOrigin } from '@/lib/staff-auth';

/** Test-only settlement; never accepts proof of a real payment from a buyer. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderNumber: string }> },
) {
  if (!sameOrigin(request) || !buyerSimulationEnabled())
    return new Response('Forbidden', { status: 403 });
  const buyer = await getBuyerFromRequest(request);
  if (!buyer) return new Response('Unauthorized', { status: 401 });
  const number = orderNumberFromParam((await params).orderNumber);
  if (!number) return new Response('Not found', { status: 404 });
  const detail = await getOrderForAccount(buyer.id, number);
  if (!detail) return new Response('Not found', { status: 404 });
  const order = detail.order;
  if (
    order.paymentMethod !== 'invoice' ||
    order.paymentRef !== `TEST-${number}`
  )
    return new Response('Not a simulated payment', { status: 409 });
  const back = (query: string) =>
    Response.redirect(
      new URL(`/account/orders/${number}?${query}`, request.url),
      303,
    );
  if (order.status === 'paid' && order.paymentStatus === 'paid')
    return back('paid=simulated');
  if (order.status !== 'awaiting_payment')
    return new Response('Order is not awaiting payment', { status: 409 });
  try {
    const result = await markOrderPaid(
      detail,
      `simulation:${buyer.id}`,
      order.paymentRef,
    );
    if (!result.ok)
      return redirectWithNotice(request, `/account/orders/${number}?error=notice`, result.error);
    return back(result.outcome === 'cancelled' ? 'cancelled=1' : 'paid=simulated');
  } catch {
    return back('error=unavailable');
  }
}
