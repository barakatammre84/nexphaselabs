import { startFulfilment } from '@/lib/fulfilment';
import { orderNumberFromParam } from '@/lib/order-rules';
import { getOrderByNumber } from '@/lib/orders';
import { canFulfil, getStaffFromRequest, sameOrigin } from '@/lib/staff-auth';

/** Staff starts picking a paid order. */
export async function POST(request: Request, { params }: { params: Promise<{ orderNumber: string }> }) {
  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const staff = await getStaffFromRequest(request);
  if (!staff) return new Response('Unauthorized', { status: 401 });
  if (!canFulfil(staff)) return new Response('Forbidden', { status: 403 });
  const { orderNumber } = await params;
  const number = orderNumberFromParam(orderNumber);
  if (!number) return new Response('Not found', { status: 404 });
  const detail = await getOrderByNumber(number);
  if (!detail) return new Response('Not found', { status: 404 });
  const back = (query: string) => Response.redirect(new URL(`/manage/orders/${number}?${query}`, request.url), 303);
  try {
    const result = await startFulfilment(detail, staff);
    if (!result.ok) return back(`error=${encodeURIComponent(result.error)}`);
  } catch (error) {
    console.error('[fulfilment] start failed', error instanceof Error ? error.message : error);
    return back('error=unavailable');
  }
  return back('fulfilling=1');
}
