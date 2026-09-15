import { beforeEach, describe, expect, it, vi } from 'vitest';

const { lookups } = vi.hoisted(() => ({ lookups: [] as string[] }));
vi.mock('@/lib/buyer-session', () => ({
  getBuyerFromRequest: async (request: Request) => (request.headers.get('cookie') ? { id: 'acc_synthetic' } : null),
}));
vi.mock('@/lib/guest-order-recovery', () => ({
  recoveredOrder: async () => null,
  recoveryTokenFromRequest: () => undefined,
}));
vi.mock('@/lib/orders', () => ({
  getOrderForAccount: async (_accountId: string, orderNumber: string) => {
    lookups.push(orderNumber);
    return null;
  },
}));
vi.mock('@/lib/issued-documents', () => ({ currentDocument: async () => null, getIssuedObject: async () => null }));
vi.mock('@/lib/documents', () => ({ documentResponse: () => new Response('document'), getLotDocument: async () => null }));
vi.mock('@/lib/document-pins', () => ({ pinnedDocument: async () => null }));

import { GET as invoice } from '@/app/api/orders/[orderNumber]/invoice/route';
import { GET as itemDocument } from '@/app/api/orders/[orderNumber]/items/[itemId]/documents/[type]/route';

/**
 * The customer's invoice and as-shipped documents. decodeURIComponent throws on
 * a malformed percent-escape, which these routes used to surface as a 500; the
 * answer must be the one any unknown order number gets.
 */
const signedIn = { cookie: 'nx_guest=synthetic' };
const invoiceFor = (orderNumber: string, headers: Record<string, string> = signedIn) =>
  invoice(new Request(`https://test.invalid/api/orders/${orderNumber}/invoice`, { headers }), {
    params: Promise.resolve({ orderNumber }),
  });
const documentFor = (orderNumber: string, headers: Record<string, string> = signedIn) =>
  itemDocument(new Request(`https://test.invalid/api/orders/${orderNumber}/items/oli_synthetic1/documents/coa`, { headers }), {
    params: Promise.resolve({ orderNumber, itemId: 'oli_synthetic1', type: 'coa' }),
  });

beforeEach(() => {
  lookups.length = 0;
});

describe('customer order document routes', () => {
  it('answer a malformed percent-escape with the 404 an unknown order gets', async () => {
    expect((await invoiceFor('nx-260915-0001')).status).toBe(404);
    expect((await documentFor('nx-260915-0001')).status).toBe(404);
    expect(lookups).toEqual(['NX-260915-0001', 'NX-260915-0001']);
    lookups.length = 0;
    for (const orderNumber of ['%E0%A4%A', 'NX-260915-0001%']) {
      expect((await invoiceFor(orderNumber)).status, orderNumber).toBe(404);
      expect((await documentFor(orderNumber)).status, orderNumber).toBe(404);
    }
    expect(lookups).toEqual([]);
  });

  it('still ask for a session before reading the order number', async () => {
    expect((await invoiceFor('%E0%A4%A', {})).status).toBe(401);
    expect((await documentFor('%E0%A4%A', {})).status).toBe(401);
  });
});
