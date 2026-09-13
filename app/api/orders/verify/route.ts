import { verifyContactToken } from '@/lib/order-contact-verification';

/**
 * The link in "confirm your email for order NX-…".
 *
 * A GET, because it is followed from a mail client. It carries no personal data
 * in the redirect, reveals nothing about an order to someone holding a bad
 * token, and cannot change anything except the fact that this address has been
 * confirmed.
 */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token') ?? '';
  const landing = (params: Record<string, string>, path = '/') => {
    const url = new URL(path, request.url);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    return Response.redirect(url, 303);
  };

  try {
    const result = await verifyContactToken(token);
    if (!result.ok) return landing({ verify: result.reason });
    return landing(
      { verified: '1' },
      `/account/orders/${encodeURIComponent(result.orderNumber)}`,
    );
  } catch (error) {
    console.error('[verify] failed', error instanceof Error ? error.message : error);
    return landing({ verify: 'unavailable' });
  }
}
