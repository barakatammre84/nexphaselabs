import { getBuyerFromRequest } from '@/lib/buyer-session';
import { documentResponse } from '@/lib/documents';
import { currentDocument, getIssuedObject } from '@/lib/issued-documents';
import { getOrderForAccount } from '@/lib/orders';

/**
 * The customer's own invoice.
 *
 * The order is looked up scoped to the signed-in account, so an account can
 * only ever reach an invoice for an order it placed. Only the invoice
 * currently in force is served here: a customer who has been reissued should
 * be reading the replacement, and the superseded document remains available
 * to staff for the record.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ orderNumber: string }> },
) {
  const account = await getBuyerFromRequest(request);
  if (!account) return new Response('Unauthorized', { status: 401 });

  const { orderNumber } = await params;
  const normalised = decodeURIComponent(orderNumber).trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9-]{2,31}$/.test(normalised)) {
    return new Response('Not found', { status: 404 });
  }

  let record;
  try {
    const detail = await getOrderForAccount(account.id, normalised);
    if (!detail) return new Response('Not found', { status: 404 });
    record = await currentDocument(
      'invoice',
      'order',
      detail.order.orderNumber,
    );
  } catch (error) {
    console.error(
      '[invoice] customer lookup failed',
      error instanceof Error ? error.message : error,
    );
    return new Response('Temporarily unavailable', { status: 503 });
  }
  if (!record) return new Response('Not found', { status: 404 });

  const object = await getIssuedObject(record.objectKey);
  if (!object) return new Response('Not found', { status: 404 });

  const inline = new URL(request.url).searchParams.get('inline') === '1';
  return documentResponse(object, `${record.documentNumber}.pdf`, inline);
}
