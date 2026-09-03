import { env } from 'cloudflare:workers';
import { ORDER_NUMBER_PATTERN } from '@/lib/order-rules';
import { settleBtcpayInvoice } from '@/lib/orders';
import { parseBtcpayEvent, verifyBtcpaySignature } from '@/lib/payments-core';

/**
 * BTCPay Server webhook. Only a correctly signed InvoiceSettled event can
 * mark an order paid, and only the order whose stored invoice id matches.
 * Everything else is acknowledged and ignored.
 */
export async function POST(request: Request) {
  const secret = env.BTCPAY_WEBHOOK_SECRET;
  if (!secret) return new Response('Not configured', { status: 404 });
  const raw = await request.text();
  if (raw.length > 64 * 1024) return new Response('Too large', { status: 413 });
  if (!(await verifyBtcpaySignature(raw, request.headers.get('BTCPay-Sig'), secret))) {
    return new Response('Bad signature', { status: 401 });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response('Bad JSON', { status: 400 });
  }
  const event = parseBtcpayEvent(body);
  if (!event) return new Response('Bad event', { status: 400 });
  if (event.type !== 'InvoiceSettled') return Response.json({ ok: true, ignored: event.type });
  if (!event.orderNumber || !ORDER_NUMBER_PATTERN.test(event.orderNumber)) return Response.json({ ok: true, ignored: 'no order' });
  try {
    const result = await settleBtcpayInvoice(event.orderNumber, event.invoiceId);
    console.info(`[payments] btcpay ${event.invoiceId} → ${event.orderNumber}: ${result.note}`);
    return Response.json({ ok: result.ok, note: result.note });
  } catch (error) {
    console.error('[payments] webhook failed', error instanceof Error ? error.message : error);
    return new Response('Error', { status: 500 });
  }
}
