import { env } from 'cloudflare:workers';
import { ORDER_NUMBER_PATTERN } from '@/lib/order-rules';
import { recordUnmatchedSettlement } from '@/lib/operational-cases';
import { settleBtcpayInvoice } from '@/lib/orders';
import { parseBtcpayEvent, verifyBtcpaySignature } from '@/lib/payments-core';
import { livePaymentsAllowed } from '@/lib/environment-safety';

/**
 * BTCPay Server webhook. Only a correctly signed InvoiceSettled event can
 * mark an order paid, and only the order whose stored invoice id matches.
 * Everything else is acknowledged. A settlement that matches no order is
 * acknowledged only once a staff case records it.
 */
export async function POST(request: Request) {
  if (!livePaymentsAllowed(env.APP_ENV)) return new Response('Not configured', { status: 404 });
  const secret = env.BTCPAY_WEBHOOK_SECRET;
  if (!secret || !env.BTCPAY_STORE_ID) return new Response('Not configured', { status: 404 });
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
  if ((body as { storeId?: unknown }).storeId !== env.BTCPAY_STORE_ID) return new Response('Wrong store', { status: 400 });
  if (event.type !== 'InvoiceSettled') return Response.json({ ok: true, ignored: event.type });
  try {
    // Money that matches no order is acknowledged, or BTCPay would redeliver it forever, but
    // only after a staff case records it; if the case cannot be written, the 500 asks for redelivery.
    if (!event.orderNumber || !ORDER_NUMBER_PATTERN.test(event.orderNumber)) {
      const opened = await recordUnmatchedSettlement({
        provider: 'BTCPay',
        invoiceId: event.invoiceId,
        orderNumber: event.orderNumber,
        reason: event.orderNumber ? 'its order reference is not an order number' : 'it carries no order reference',
      });
      console.warn(`[payments] btcpay ${event.invoiceId} names no order; case ${opened.caseNumber}`);
      return Response.json({ ok: true, ignored: 'no order', case: opened.caseNumber });
    }
    const result = await settleBtcpayInvoice(event.orderNumber, event.invoiceId);
    console.info(`[payments] btcpay ${event.invoiceId} → ${event.orderNumber}: ${result.note}`);
    if (result.unmatched) {
      const opened = await recordUnmatchedSettlement({
        provider: 'BTCPay',
        invoiceId: event.invoiceId,
        orderNumber: event.orderNumber,
        reason: result.note === 'unknown order' ? 'no order has that number' : 'that order expects a different invoice',
      });
      return Response.json({ ok: false, note: result.note, case: opened.caseNumber });
    }
    return Response.json({ ok: result.ok, note: result.note }, { status: result.retryable ? 503 : 200 });
  } catch (error) {
    console.error('[payments] webhook failed', error instanceof Error ? error.message : error);
    return new Response('Error', { status: 500 });
  }
}
