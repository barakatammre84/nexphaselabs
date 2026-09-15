import { getBuyerFromRequest } from '@/lib/buyer-session';
import { documentResponse, getLotDocument } from '@/lib/documents';
import { pinnedDocument } from '@/lib/document-pins';
import { getOrderForAccount } from '@/lib/orders';
import { recoveredOrder, recoveryTokenFromRequest } from '@/lib/guest-order-recovery';
import { orderNumberFromParam } from '@/lib/order-rules';

/**
 * The certificate or SDS AS SHIPPED for one line of the customer's own order.
 *
 * Served by the document id pinned at dispatch, not by "the lot's current
 * COA": a certificate re-issued after shipment, or a newer lot bought on a
 * reorder, never replaces what this customer received. The response carries
 * the SHA-256 recorded at dispatch so the file can be checked against it.
 * Nothing about the lot's status is consulted — a withdrawn lot's customer
 * still has the right to the document that accompanied their material.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ orderNumber: string; itemId: string; type: string }> },
) {
  const account = await getBuyerFromRequest(request);
  const recoveryToken = recoveryTokenFromRequest(request);
  if (!account && !recoveryToken) return new Response('Unauthorized', { status: 401 });

  const { orderNumber, itemId, type } = await params;
  // Null for anything that is not an order number, a malformed percent-escape included.
  const normalised = orderNumberFromParam(orderNumber);
  if (!normalised) return new Response('Not found', { status: 404 });
  if (type !== 'coa' && type !== 'sds') return new Response('Not found', { status: 404 });
  if (!/^[a-z]{2,4}_[A-Za-z0-9]{6,40}$/.test(itemId)) return new Response('Not found', { status: 404 });

  let pinned;
  try {
    const detail = (account ? await getOrderForAccount(account.id, normalised) : null)
      ?? await recoveredOrder(recoveryToken, normalised);
    if (!detail) return new Response('Not found', { status: 404 });
    pinned = await pinnedDocument(detail.order.id, itemId, type);
  } catch (error) {
    console.error('[order-documents] lookup failed', error instanceof Error ? error.message : error);
    return new Response('Temporarily unavailable', { status: 503 });
  }
  if (!pinned) return new Response('Not found', { status: 404 });

  const object = await getLotDocument(pinned.objectKey);
  if (!object) return new Response('Not found', { status: 404 });

  const ext = pinned.objectKey.split('.').pop() ?? 'pdf';
  const inline = new URL(request.url).searchParams.get('inline') === '1';
  const response = documentResponse(object, `${normalised}-${pinned.lotNumber ?? 'lot'}-${type}-as-shipped.${ext}`, inline);
  if (pinned.sha256) response.headers.set('X-Document-SHA256', pinned.sha256);
  return response;
}
