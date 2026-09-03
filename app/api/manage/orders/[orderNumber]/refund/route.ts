import { getDb } from '@/db';
import { accounts } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { orderNumberFromParam, refundDue, validateRefund } from '@/lib/order-rules';
import { getOrderByNumber, recordRefund } from '@/lib/orders';
import { recordedBy } from '@/lib/lots-admin';
import { canVerifyAccounts, getStaffFromRequest, sameOrigin } from '@/lib/staff-auth';

/** Admin records that a refund has actually been sent. */
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
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return back('error=badform');
  }
  const validated = validateRefund({ amount: String(form.get('amount') ?? ''), reference: String(form.get('reference') ?? '') }, refundDue(detail.order) - (detail.order.refundCents ?? 0));
  if (!validated.ok) return back(`error=${encodeURIComponent(validated.error)}`);
  try {
    const [account] = await getDb().select({ email: accounts.email }).from(accounts).where(eq(accounts.id, detail.order.accountId)).limit(1);
    const result = await recordRefund(detail, validated.amountCents, validated.reference, recordedBy(staff), account?.email ?? '');
    if (!result.ok) return back(`error=${encodeURIComponent(result.error)}`);
  } catch (error) {
    console.error('[orders] refund failed', error instanceof Error ? error.message : error);
    return back('error=unavailable');
  }
  return back('refunded=1');
}
