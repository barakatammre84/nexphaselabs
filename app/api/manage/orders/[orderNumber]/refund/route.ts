import { orderNumberFromParam, validateRefund } from '@/lib/order-rules';
import { getOrderByNumber, recordRefund } from '@/lib/orders';
import { recordedBy } from '@/lib/lots-admin';
import { canManageFinance, getStaffFromRequest, sameOrigin } from '@/lib/staff-auth';

/** Admin records that a refund has actually been sent. */
export async function POST(request: Request, { params }: { params: Promise<{ orderNumber: string }> }) {
  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const staff = await getStaffFromRequest(request);
  if (!staff) return new Response('Unauthorized', { status: 401 });
  if (!canManageFinance(staff)) return new Response('Forbidden', { status: 403 });
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
  // Parse input here; recordRefund checks durable identity before the remaining
  // balance, so retries still get the right error after top-ups or completion.
  const validated = validateRefund({ amount: String(form.get('amount') ?? ''), reference: String(form.get('reference') ?? '') }, Number.MAX_SAFE_INTEGER);
  if (!validated.ok) return back(`error=${encodeURIComponent(validated.error)}`);
  try {
    const result = await recordRefund(detail, validated.amountCents, validated.reference, recordedBy(staff));
    if (!result.ok) return back(`error=${encodeURIComponent(result.error)}`);
  } catch (error) {
    console.error('[orders] refund failed', error instanceof Error ? error.message : error);
    return back('error=unavailable');
  }
  return back('refunded=1');
}
