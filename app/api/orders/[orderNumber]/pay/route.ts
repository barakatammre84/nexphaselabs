import { getBuyerFromRequest } from '@/lib/buyer-session';
import { orderNumberFromParam } from '@/lib/order-rules';
import { beginPayment, getOrderForAccount } from '@/lib/orders';
import { sameOrigin } from '@/lib/staff-auth';

/** Customer picks a payment method for their submitted order. */
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

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return new Response('Bad request', { status: 400 });
  }
  const method = String(form.get('method') ?? '');
  const back = (query: string) =>
    Response.redirect(
      new URL(`/account/orders/${number}?${query}`, request.url),
      303,
    );
  try {
    const result = await beginPayment(
      detail,
      method,
      account.email,
      `${account.name} (${account.id})`,
    );
    if (!result.ok) return back(`error=${encodeURIComponent(result.error)}`);
  } catch (error) {
    console.error(
      '[orders] pay failed',
      error instanceof Error ? error.message : error,
    );
    return back('error=unavailable');
  }
  return back('payment=set');
}
