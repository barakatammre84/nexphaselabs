import { canManageStaff, getStaffFromRequest, sameOrigin } from '@/lib/staff-auth';
import { orderNumberFromParam } from '@/lib/order-rules';
import { getOrderByNumber } from '@/lib/orders';
import { reconcilePaymentAttempt } from '@/lib/payment-attempts';
import { allow, rateLimitKey } from '@/lib/rate-limit';

export async function POST(request: Request, { params }: { params: Promise<{ orderNumber: string }> }) {
  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const staff = await getStaffFromRequest(request);
  if (!staff) return new Response('Unauthorized', { status: 401 });
  if (!canManageStaff(staff)) return new Response('Forbidden', { status: 403 });
  const number = orderNumberFromParam((await params).orderNumber);
  if (!number) return new Response('Not found', { status: 404 });
  if (!(await allow(rateLimitKey('reconcile-payment', staff.id), 20, 3600))) return new Response('Try again later', { status: 429 });
  const detail = await getOrderByNumber(number);
  if (!detail) return new Response('Not found', { status: 404 });
  // Success says so too: without the flag the order page showed nothing, and staff could not tell a match from a no-op.
  const back = (error?: string) => Response.redirect(new URL(`/manage/orders/${number}?${error ? `error=${encodeURIComponent(error)}` : 'reconciled=1'}`, request.url), 303);
  try {
    const form = await request.formData();
    const result = await reconcilePaymentAttempt(detail.order, String(form.get('reference') ?? '').trim(), `${staff.name} (${staff.id})`);
    return back(result.ok ? undefined : result.error);
  } catch { return back('Provider reconciliation could not be confirmed. No new invoice was created.'); }
}
