import { getOrderByNumber } from '@/lib/orders';
import { orderNumberFromParam } from '@/lib/order-rules';
import { clearFailedLabelPurchase } from '@/lib/shipping-labels';
import { canFulfil, getStaffFromRequest, sameOrigin } from '@/lib/staff-auth';

/**
 * Clears a label purchase the carrier did not complete, once a person has checked
 * the carrier account. Until then the failed attempt blocks both a replacement
 * label and cancelling the order.
 */
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
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return reply({ error: 'The request could not be read.' }, 400);
  }
  if (form.get('confirm') !== 'on')
    return reply({ error: 'Confirm that the carrier account shows no label for this order.' }, 422);
  try {
    const result = await clearFailedLabelPurchase(detail.order, String(form.get('reason') ?? ''), staff);
    return reply(result, result.ok ? 200 : 409);
  } catch (error) {
    console.error(
      '[shipping-label-clear] failed',
      error instanceof Error ? error.message : error,
    );
    return reply({ error: 'The failed purchase could not be cleared. Try again.' }, 503);
  }
}
