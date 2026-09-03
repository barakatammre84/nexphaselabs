import { sha256Hex } from '@/lib/staff-auth-core';

/** Pure BTCPay webhook helpers (no bindings), unit-tested. */

const enc = new TextEncoder();

/** Verify `BTCPay-Sig: sha256=<hex>` against the raw body with the webhook secret. */
export async function verifyBtcpaySignature(rawBody: string, header: string | null, secret: string): Promise<boolean> {
  if (!header || !header.startsWith('sha256=') || !secret) return false;
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(rawBody)));
  const expected = [...mac].map((b) => b.toString(16).padStart(2, '0')).join('');
  const given = header.slice('sha256='.length).toLowerCase();
  if (given.length !== expected.length) return false;
  // Compare hashes of both to keep the comparison length-independent and constant-time enough.
  return (await sha256Hex(given)) === (await sha256Hex(expected));
}

export type BtcpayEvent = { type: string; invoiceId: string; orderNumber: string | null };

export function parseBtcpayEvent(body: unknown): BtcpayEvent | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as { type?: unknown; invoiceId?: unknown; metadata?: { orderId?: unknown } };
  if (typeof b.type !== 'string' || typeof b.invoiceId !== 'string') return null;
  const orderNumber = typeof b.metadata?.orderId === 'string' ? b.metadata.orderId : null;
  return { type: b.type, invoiceId: b.invoiceId, orderNumber };
}
