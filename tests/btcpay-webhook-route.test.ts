import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { env, settle, recordCase } = vi.hoisted(() => ({
  env: {} as { APP_ENV?: string; BTCPAY_STORE_ID?: string; BTCPAY_WEBHOOK_SECRET?: string },
  settle: vi.fn(),
  recordCase: vi.fn(),
}));

vi.mock('cloudflare:workers', () => ({ env }));
vi.mock('@/lib/orders', () => ({ settleBtcpayInvoice: settle }));
vi.mock('@/lib/operational-cases', () => ({ recordUnmatchedSettlement: recordCase }));

import { POST } from '@/app/api/payments/btcpay/webhook/route';

const secret = 'synthetic-webhook-secret';
const storeId = 'synthetic-store';
const invoiceId = 'invoice-synthetic-1';
const orderNumber = 'NX-260904-0001';

async function signedRequest(
  payload: string | Record<string, unknown>,
  validSignature = true,
): Promise<Response> {
  const raw = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(validSignature ? secret : 'wrong-secret'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw)));
  const signature = [...mac].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return POST(
    new Request('https://example.invalid/api/payments/btcpay/webhook', {
      method: 'POST',
      body: raw,
      headers: { 'BTCPay-Sig': `sha256=${signature}` },
    }),
  );
}

function event(overrides: Record<string, unknown> = {}) {
  return {
    type: 'InvoiceSettled',
    invoiceId,
    storeId,
    metadata: { orderId: orderNumber },
    ...overrides,
  };
}

beforeEach(() => {
  Object.assign(env, { APP_ENV: 'production', BTCPAY_STORE_ID: storeId, BTCPAY_WEBHOOK_SECRET: secret });
  settle.mockReset();
  recordCase.mockReset();
  recordCase.mockImplementation(async (details: Record<string, unknown>) => ({
    caseNumber: 'CASE-SYNTHETIC',
    persisted: true,
    details,
  }));
});

afterEach(() => {
  for (const key of Object.keys(env)) delete env[key as keyof typeof env];
});

describe('BTCPay webhook POST route', () => {
  it.each([
    ['nonproduction', { APP_ENV: 'staging', BTCPAY_STORE_ID: storeId, BTCPAY_WEBHOOK_SECRET: secret }],
    ['missing secret', { APP_ENV: 'production', BTCPAY_STORE_ID: storeId }],
    ['missing store', { APP_ENV: 'production', BTCPAY_WEBHOOK_SECRET: secret }],
  ])('is disabled for %s configuration', async (_name, configuration) => {
    for (const key of Object.keys(env)) delete env[key as keyof typeof env];
    Object.assign(env, configuration);
    const response = await signedRequest(event());
    expect(response.status).toBe(404);
    expect(settle).not.toHaveBeenCalled();
    expect(recordCase).not.toHaveBeenCalled();
  });

  it('rejects a bad signature before parsing or forwarding', async () => {
    const response = await signedRequest(event(), false);
    expect(response.status).toBe(401);
    expect(settle).not.toHaveBeenCalled();
    expect(recordCase).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON and malformed events with a valid signature', async () => {
    expect((await signedRequest('{not-json')).status).toBe(400);
    expect((await signedRequest({ type: 'InvoiceSettled', storeId })).status).toBe(400);
    expect(settle).not.toHaveBeenCalled();
  });

  it('rejects an event for another store', async () => {
    const response = await signedRequest(event({ storeId: 'another-store' }));
    expect(response.status).toBe(400);
    expect(settle).not.toHaveBeenCalled();
  });

  it('acknowledges non-settled events without settlement or case work', async () => {
    const response = await signedRequest(event({ type: 'InvoiceCreated' }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, ignored: 'InvoiceCreated' });
    expect(settle).not.toHaveBeenCalled();
    expect(recordCase).not.toHaveBeenCalled();
  });

  it.each([
    ['missing order reference', { metadata: {} }, 'it carries no order reference'],
    ['invalid order reference', { metadata: { orderId: 'not-an-order' } }, 'its order reference is not an order number'],
  ])('records a case before acknowledging a settled event with %s', async (_name, details, reason) => {
    const response = await signedRequest(event(details));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, ignored: 'no order', case: 'CASE-SYNTHETIC' });
    const suppliedOrder = (details.metadata as { orderId?: string }).orderId ?? null;
    expect(recordCase).toHaveBeenCalledWith({ provider: 'BTCPay', invoiceId, orderNumber: suppliedOrder, reason });
    expect(settle).not.toHaveBeenCalled();
  });

  it.each([
    ['unknown order', { unmatched: true, note: 'unknown order', ok: false, retryable: false }],
    ['different invoice', { unmatched: true, note: 'different invoice', ok: false, retryable: false }],
  ])('persists a case for a settled event with %s before returning 200', async (_name, result) => {
    settle.mockResolvedValue(result);
    const response = await signedRequest(event());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: false, note: result.note, case: 'CASE-SYNTHETIC' });
    expect(settle).toHaveBeenCalledWith(orderNumber, invoiceId);
    expect(recordCase).toHaveBeenCalledWith({
      provider: 'BTCPay',
      invoiceId,
      orderNumber,
      reason: result.note === 'unknown order' ? 'no order has that number' : 'that order expects a different invoice',
    });
  });

  it('returns 500 when unmatched-settlement case persistence fails', async () => {
    settle.mockResolvedValue({ unmatched: true, note: 'unknown order', ok: false, retryable: false });
    recordCase.mockRejectedValue(new Error('case store unavailable'));
    const response = await signedRequest(event());
    expect(response.status).toBe(500);
  });

  it('returns 503 for a retryable settlement result', async () => {
    settle.mockResolvedValue({ unmatched: false, note: 'payment ledger temporarily unavailable', ok: false, retryable: true });
    const response = await signedRequest(event());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, note: 'payment ledger temporarily unavailable' });
  });

  it('forwards successful settlements, including duplicate redelivery', async () => {
    settle.mockResolvedValue({ unmatched: false, note: 'settled', ok: true, retryable: false });
    const first = await signedRequest(event());
    const second = await signedRequest(event());
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ ok: true, note: 'settled' });
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ ok: true, note: 'settled' });
    expect(settle).toHaveBeenCalledTimes(2);
    expect(recordCase).not.toHaveBeenCalled();
  });
});