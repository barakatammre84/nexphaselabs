import { getDb } from '@/db';
import { accounts } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { orderNumberFromParam } from '@/lib/order-rules';
import { getOrderByNumber, markOrderPaid } from '@/lib/orders';
import { recordedBy } from '@/lib/lots-admin';
import { canVerifyAccounts, getStaffFromRequest, sameOrigin } from '@/lib/staff-auth';

/** Admin records that payment for an order has arrived. */
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
  try {
    const [account] = await getDb().select({ email: accounts.email }).from(accounts).where(eq(accounts.id, detail.order.accountId)).limit(1);
    const result = await markOrderPaid(detail, recordedBy(staff), reference, account?.email ?? '');
    if (!result.ok) return back(`error=${encodeURIComponent(result.error)}`);
  } catch (error) {
    console.error('[orders] mark paid failed', error instanceof Error ? error.message : error);
    return back('error=unavailable');
  }
  return back('paid=1');
}
