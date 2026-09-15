import { getBuyerFromRequest } from '@/lib/buyer-session';
import { orderNumberFromParam } from '@/lib/order-rules';
import { getOrderForAccount } from '@/lib/order-reads';
import { redirectWithNotice } from '@/lib/notice';
import { sameOrigin } from '@/lib/staff-auth';
import { recordZellePaymentClaim } from '@/lib/zelle';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderNumber: string }> },
) {
  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const account = await getBuyerFromRequest(request);
  if (!account) return new Response('Unauthorized', { status: 401 });
  const number = orderNumberFromParam((await params).orderNumber);
  if (!number) return new Response('Not found', { status: 404 });
  const detail = await getOrderForAccount(account.id, number);
  if (!detail) return new Response('Not found', { status: 404 });
  let payerName = '';
  try {
    payerName = String((await request.formData()).get('payer_name') ?? '');
  } catch {
    return new Response('Bad request', { status: 400 });
  }
  const result = await recordZellePaymentClaim(
    detail.order,
    payerName,
    `${account.name} (${account.id})`,
  );
  if (!result.ok)
    return redirectWithNotice(request, `/account/orders/${number}?error=notice`, result.error);
  return Response.redirect(new URL(`/account/orders/${number}?zelle=claimed`, request.url), 303);
}
