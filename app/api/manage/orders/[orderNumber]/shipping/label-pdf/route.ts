import { getOrderByNumber } from '@/lib/orders';
import { orderNumberFromParam } from '@/lib/order-rules';
import { currentShippingLabel } from '@/lib/shipping-labels';
import { safeLabelUrl } from '@/lib/shipping-provider';
import { canFulfil, getStaffFromRequest } from '@/lib/staff-auth';

export async function GET(
  request: Request,
  context: { params: Promise<{ orderNumber: string }> },
) {
  const staff = await getStaffFromRequest(request);
  if (!staff) return new Response('Unauthorized', { status: 401 });
  if (!canFulfil(staff)) return new Response('Forbidden', { status: 403 });
  const number = orderNumberFromParam((await context.params).orderNumber);
  if (!number) return new Response('Not found', { status: 404 });
  const detail = await getOrderByNumber(number);
  if (!detail) return new Response('Not found', { status: 404 });
  const label = await currentShippingLabel(detail.order.id);
  if (!label || label.state !== 'ready')
    return new Response('Not found', { status: 404 });

  // Shippo has already rendered the authoritative label. Redirecting avoids
  // expensive in-Worker PDF generation and revalidates the stored provider URL
  // before it leaves the authenticated staff route.
  const labelUrl = safeLabelUrl(label.labelUrl);
  if (!labelUrl)
    return new Response('The provider label is unavailable.', { status: 409 });
  return new Response(null, {
    status: 302,
    headers: {
      Location: labelUrl,
      'Cache-Control': 'private, no-store',
    },
  });
}
