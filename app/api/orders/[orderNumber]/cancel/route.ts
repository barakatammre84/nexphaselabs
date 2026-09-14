import { getBuyerFromRequest } from '@/lib/buyer-session';
import { orderNumberFromParam } from '@/lib/order-rules';
import { cancelOrderByCustomer, getOrderForAccount } from '@/lib/orders';
import { sameOrigin } from '@/lib/staff-auth';

/** Customer cancels an order that has not been paid. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderNumber: string }> },
) {
  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const account = await getBuyerFromRequest(request);
  if (!account) return new Response('Unauthorized', { status: 401 });
  const { orderNumber } = await params;
  const number = orderNumberFromParam(orderNumber);
  if (!number) return new Response('Not found', { status: 404 });
  const detail = await getOrderForAccount(account.id, number);
  if (!detail) return new Response('Not found', { status: 404 });
  if (
    detail.order.paymentMethod === 'zelle' &&
    (await (await import('@/lib/zelle')).zelleClaimForOrder(detail.order.id))
  ) {
    const url = new URL(`/account/orders/${number}`, request.url);
    url.searchParams.set(
      'error',
      'Your Zelle payment is being checked. Contact order support instead of cancelling or sending again.',
    );
    return Response.redirect(url, 303);
  }
  let reason: string | null = null;
  try {
    const form = await request.formData();
    reason =
      String(form.get('reason') ?? '')
        .trim()
        .slice(0, 300) || null;
  } catch {
    reason = null;
  }
  const back = (query: string) =>
    Response.redirect(
      new URL(`/account/orders/${number}?${query}`, request.url),
      303,
    );
  try {
    const result = await cancelOrderByCustomer(
      detail,
      `${account.name} (${account.id})`,
      reason,
    );
    if (!result.ok) return back(`error=${encodeURIComponent(result.error)}`);
  } catch (error) {
    console.error(
      '[orders] cancel failed',
      error instanceof Error ? error.message : error,
    );
    return back('error=unavailable');
  }
  return back('cancelled=1');
}
