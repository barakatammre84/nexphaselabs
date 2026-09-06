import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localD1 } from './helpers/local-d1';

const { env } = vi.hoisted(() => ({ env: {} as Record<string, unknown> }));
vi.mock('cloudflare:workers', () => ({ env }));

import { getDb } from '@/db';
import {
  checkoutQuotes,
  fulfillmentQuotes,
  shippingLabels,
} from '@/db/commerce-schema';
import { accounts, orders } from '@/db/schema';
import { cleanupExpiredCommerceRecords } from '@/lib/commerce-maintenance';

let local: ReturnType<typeof localD1>;
const now = new Date('2026-09-05T12:00:00Z');

beforeEach(async () => {
  local = localD1();
  Object.assign(env, { DB: local.binding });
  await getDb().insert(accounts).values({
    id: 'customer',
    email: 'test@example.org',
    name: 'Test',
    passwordHash: 'unused',
    tier: 'institutional',
  });
  await getDb().insert(orders).values({
    id: 'order1',
    orderNumber: 'NPL-1',
    accountId: 'customer',
    subtotalCents: 100,
    totalCents: 100,
    priceTier: 'institutional',
    consigneeName: 'Test',
    shipToLine1: 'Test',
    shipToCity: 'Test',
    shipToRegion: 'CA',
    shipToPostalCode: '94612',
    shipToCountry: 'US',
    submittedAt: now,
  });
});

afterEach(() => {
  local.sqlite.close();
  for (const key of Object.keys(env)) delete env[key];
});

describe('commerce quote maintenance', () => {
  it('removes expired disposable quotes but preserves active and label-backed audit records', async () => {
    const expired = new Date(now.getTime() - 60_000);
    const active = new Date(now.getTime() + 60_000);
    const checkout = (id: string, expiresAt: Date) => ({
      id,
      accountId: 'customer',
      cartFingerprint: `cart-${id}`,
      addressFingerprint: `address-${id}`,
      provider: 'simulated',
      shipmentId: `shipment-${id}`,
      rateId: `rate-${id}`,
      carrier: 'UPS' as const,
      service: 'ground',
      serviceName: 'UPS Ground',
      shippingCents: 900,
      taxCents: 100,
      expiresAt,
    });
    await getDb()
      .insert(checkoutQuotes)
      .values([
        checkout('checkout-expired', expired),
        checkout('checkout-active', active),
      ]);
    const fulfillment = (id: string, expiresAt: Date) => ({
      id,
      orderId: 'order1',
      provider: 'simulated',
      shipmentId: `shipment-${id}`,
      rateId: `rate-${id}`,
      carrier: 'FedEx' as const,
      service: 'ground',
      serviceName: 'FedEx Ground',
      amountCents: 1000,
      test: true,
      expiresAt,
      createdBy: 'staff1',
    });
    await getDb()
      .insert(fulfillmentQuotes)
      .values([
        fulfillment('fulfillment-expired', expired),
        fulfillment('fulfillment-active', active),
        fulfillment('fulfillment-audit', expired),
      ]);
    await getDb().insert(shippingLabels).values({
      id: 'label1',
      orderId: 'order1',
      quoteId: 'fulfillment-audit',
      state: 'ready',
      trackingNumber: 'TEST123',
      carrier: 'FedEx',
      serviceName: 'FedEx Ground',
      amountCents: 1000,
      test: true,
      createdBy: 'staff1',
    });

    expect(await cleanupExpiredCommerceRecords(now)).toEqual({
      checkoutQuotes: 1,
      fulfillmentQuotes: 1,
    });
    expect(
      local.sqlite.prepare('SELECT id FROM checkout_quotes ORDER BY id').all(),
    ).toEqual([{ id: 'checkout-active' }]);
    expect(
      local.sqlite
        .prepare('SELECT id FROM fulfillment_quotes ORDER BY id')
        .all(),
    ).toEqual([{ id: 'fulfillment-active' }, { id: 'fulfillment-audit' }]);
  });
});
