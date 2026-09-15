import { verifyContactToken } from '@/lib/order-contact-verification';

/**
 * The link in "confirm your email for order NX-…".
 *
 * A GET, because it is followed from a mail client. It reveals nothing about an
 * order to someone holding a bad token, and cannot change anything except the
 * fact that this address has been confirmed.
 *
 * The link is often opened on a phone that has never seen the order, so both
 * outcomes land on a page that needs no session: the order number the link was
 * issued for, or the reason it could not be used. Opening the order itself still
 * takes the browser that placed it, or its recovery code.
 */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token') ?? '';
  const landing = (key: 'order' | 'verify', value: string) => {
    const url = new URL('/account/orders/confirm-email', request.url);
    url.searchParams.set(key, value);
    return Response.redirect(url, 303);
  };

  try {
    const result = await verifyContactToken(token);
    return result.ok ? landing('order', result.orderNumber) : landing('verify', result.reason);
  } catch (error) {
    console.error('[verify] failed', error instanceof Error ? error.message : error);
    return landing('verify', 'unavailable');
  }
}
