import { env } from 'cloudflare:workers';
import { getOrderByNumber } from '@/lib/orders';
import { orderNumberFromParam } from '@/lib/order-rules';
import { currentShippingLabel } from '@/lib/shipping-labels';
import { safeLabelUrl } from '@/lib/shipping-provider';
import { labelR2Key } from '@/lib/usps-provider';
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

  // A label bought straight from USPS arrives as bytes, so it lives in the
  // private bucket and is streamed through this authenticated route. Nothing
  // about it is ever public and no redirect leaves the origin.
  const objectKey = labelR2Key(label.labelUrl);
  if (objectKey) {
    const object = await env.DOCS?.get(objectKey);
    if (!object)
      return new Response('The stored label is unavailable.', { status: 409 });
    return new Response(object.body, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="label-${number}.pdf"`,
        'Cache-Control': 'private, no-store',
      },
    });
  }

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
