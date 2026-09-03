import { recordReturn } from '@/lib/fulfilment';
import { orderNumberFromParam } from '@/lib/order-rules';
import { getOrderByNumber } from '@/lib/orders';
import { canFulfil, getStaffFromRequest, sameOrigin } from '@/lib/staff-auth';

/** Ops or admin receive returned material against a shipped order. */
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
  const packs: Record<string, number> = {};
  for (const it of detail.items) {
    const raw = String(form.get(`packs_${it.id}`) ?? '').trim();
    if (!raw) continue;
    // Malformed input is refused, never coerced to zero: a return is recorded once and caps the refund.
    if (!/^\d{1,3}$/.test(raw)) return back(`error=${encodeURIComponent(`${it.sku}: packs returned must be a whole number.`)}`);
    packs[it.id] = Number(raw);
  }
  try {
    const result = await recordReturn(
      detail,
      { packs, receivedOn: String(form.get('receivedOn') ?? ''), condition: String(form.get('condition') ?? ''), note: String(form.get('note') ?? '') },
      staff,
    );
    if (!result.ok) return back(`error=${encodeURIComponent(result.error)}`);
  } catch (error) {
    console.error('[orders] return failed', error instanceof Error ? error.message : error);
    return back('error=unavailable');
  }
  return back('returned=1');
}
