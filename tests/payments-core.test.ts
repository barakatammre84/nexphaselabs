import { describe, expect, it } from 'vitest';
import { parseBtcpayEvent, verifyBtcpaySignature } from '@/lib/payments-core';

async function hmac(body: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)));
  return 'sha256=' + [...mac].map((b) => b.toString(16).padStart(2, '0')).join('');
}

describe('BTCPay webhook helpers', () => {
  it('verifies a correct signature and rejects everything else', async () => {
    const body = '{"type":"InvoiceSettled","invoiceId":"abc","metadata":{"orderId":"NX-260903-0001"}}';
    const sig = await hmac(body, 'secret');
    expect(await verifyBtcpaySignature(body, sig, 'secret')).toBe(true);
    expect(await verifyBtcpaySignature(body, sig, 'other')).toBe(false);
    expect(await verifyBtcpaySignature(body + ' ', sig, 'secret')).toBe(false);
    expect(await verifyBtcpaySignature(body, null, 'secret')).toBe(false);
    expect(await verifyBtcpaySignature(body, 'sha256=00', 'secret')).toBe(false);
    expect(await verifyBtcpaySignature(body, sig, '')).toBe(false);
  });
  it('parses events defensively', () => {
    expect(parseBtcpayEvent({ type: 'InvoiceSettled', invoiceId: 'x', metadata: { orderId: 'NX-1' } })).toEqual({ type: 'InvoiceSettled', invoiceId: 'x', orderNumber: 'NX-1' });
    expect(parseBtcpayEvent({ type: 'InvoiceSettled', invoiceId: 'x' })).toEqual({ type: 'InvoiceSettled', invoiceId: 'x', orderNumber: null });
    expect(parseBtcpayEvent({ type: 1 })).toBeNull();
    expect(parseBtcpayEvent(null)).toBeNull();
  });
});
