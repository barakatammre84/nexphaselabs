import { getOrderByNumber } from '@/lib/orders';
import { orderNumberFromParam } from '@/lib/order-rules';
import { allow, rateLimitKey } from '@/lib/rate-limit';
import { buyShippingLabel } from '@/lib/shipping-labels';
import { canFulfil, getStaffFromRequest, sameOrigin } from '@/lib/staff-auth';

export async function POST(
  request: Request,
  context: { params: Promise<{ orderNumber: string }> },
) {
  const reply = (body: unknown, status = 200) =>
    Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  if (!sameOrigin(request)) return reply({ error: 'Forbidden' }, 403);
  const staff = await getStaffFromRequest(request);
  if (!staff) return reply({ error: 'Unauthorized' }, 401);
  if (!canFulfil(staff)) return reply({ error: 'Forbidden' }, 403);
  const number = orderNumberFromParam((await context.params).orderNumber);
  if (!number) return reply({ error: 'Order not found' }, 404);
  const detail = await getOrderByNumber(number);
  if (!detail) return reply({ error: 'Order not found' }, 404);
  if (!(await allow(rateLimitKey('shipping-label', detail.order.id), 10, 3600)))
    return reply(
      {
        error:
          'Label request limit reached. Reconcile the existing request before continuing.',
      },
      429,
    );
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return reply({ error: 'Invalid form' }, 400);
  }
  try {
    const result = await buyShippingLabel(
      detail.order,
      String(form.get('quote') ?? ''),
      staff,
    );
    return reply(result, result.ok ? 200 : result.uncertain ? 409 : 422);
  } catch (error) {
    console.error(
      '[shipping-label] failed',
      error instanceof Error ? error.message : error,
    );
    return reply(
      {
        error:
          'Label purchase was not confirmed. Do not retry until the provider dashboard is checked.',
      },
      409,
    );
  }
}
