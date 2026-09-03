import { recordShipment } from '@/lib/fulfilment';
import { orderNumberFromParam } from '@/lib/order-rules';
import { getOrderByNumber } from '@/lib/orders';
import { canFulfil, getStaffFromRequest, sameOrigin } from '@/lib/staff-auth';

/** Staff records the shipment: lot per line, carrier, tracking, actual ship date. */
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

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return back('error=badform');
  }
  const picks: Record<string, string> = {};
  for (const it of detail.items) {
    const lot = String(form.get(`lot_${it.id}`) ?? '');
    if (/^lot_[a-z0-9]{8,32}$/.test(lot)) picks[it.id] = lot;
  }
  try {
    const result = await recordShipment(
      detail,
      {
        picks,
        carrier: String(form.get('carrier') ?? ''),
        trackingNumber: String(form.get('tracking') ?? ''),
        shippedOn: String(form.get('shippedOn') ?? ''),
        note: String(form.get('note') ?? ''),
      },
      staff,
    );
    if (!result.ok) return back(`error=${encodeURIComponent(result.error)}`);
  } catch (error) {
    console.error('[fulfilment] ship failed', error instanceof Error ? error.message : error);
    return back('error=unavailable');
  }
  return back('shipped=1');
}
