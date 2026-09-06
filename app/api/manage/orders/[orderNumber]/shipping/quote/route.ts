import { getOrderByNumber } from '@/lib/orders';
import { orderNumberFromParam } from '@/lib/order-rules';
import { allow, rateLimitKey } from '@/lib/rate-limit';
import { quoteFulfillment } from '@/lib/shipping-labels';
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
  if (
    !(await allow(
      rateLimitKey('order-shipping-quotes', `${staff.id}:${detail.order.id}`),
      30,
      3600,
    ))
  )
    return reply({ error: 'Quote limit reached. Try again later.' }, 429);
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return reply({ error: 'Invalid form' }, 400);
  }
  if (form.get('ordinaryParcel') !== 'on')
    return reply(
      {
        error:
          'Confirm this is an ordinary ambient parcel before requesting carrier rates.',
      },
      422,
    );
  const value = (key: string) => Number(String(form.get(key) ?? ''));
  const result = await quoteFulfillment(
    detail.order,
    {
      length: value('length'),
      width: value('width'),
      height: value('height'),
      weight: value('weight'),
    },
    staff,
  );
  return reply(result, result.ok ? 200 : 422);
}
