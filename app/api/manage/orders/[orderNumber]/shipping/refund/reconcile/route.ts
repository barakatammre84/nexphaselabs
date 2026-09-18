import { getOrderByNumber } from '@/lib/orders';
import { orderNumberFromParam } from '@/lib/order-rules';
import { allow, rateLimitKey } from '@/lib/rate-limit';
import { reconcileShippingLabelRefund } from '@/lib/shipping-labels';
import { canManageFinance, getStaffFromRequest, sameOrigin } from '@/lib/staff-auth';

export async function POST(
  request: Request,
  context: { params: Promise<{ orderNumber: string }> },
) {
  const reply = (body: unknown, status = 200) =>
    Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  if (!sameOrigin(request)) return reply({ error: 'Forbidden' }, 403);
  const staff = await getStaffFromRequest(request);
  if (!staff) return reply({ error: 'Unauthorized' }, 401);
  if (!canManageFinance(staff)) return reply({ error: 'Forbidden' }, 403);
  const number = orderNumberFromParam((await context.params).orderNumber);
  if (!number) return reply({ error: 'Order not found' }, 404);
  const detail = await getOrderByNumber(number);
  if (!detail) return reply({ error: 'Order not found' }, 404);
  if (
    !(await allow(
      rateLimitKey('shipping-refund-status', detail.order.id),
      30,
      3600,
    ))
  )
    return reply({ error: 'Refund status check limit reached.' }, 429);
  try {
    const result = await reconcileShippingLabelRefund(detail.order, staff);
    return reply(
      result,
      result.ok ? 200 : 'pending' in result && result.pending ? 202 : 409,
    );
  } catch (error) {
    console.error(
      '[shipping-refund-reconcile] failed',
      error instanceof Error ? error.message : error,
    );
    return reply({ error: 'Refund status could not be confirmed.' }, 409);
  }
}
