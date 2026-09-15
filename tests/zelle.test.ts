import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localD1 } from './helpers/local-d1';

const { env } = vi.hoisted(() => ({ env: {} as Record<string, unknown> }));
vi.mock('cloudflare:workers', () => ({ env }));

import { getDb } from '@/db';
import { accounts, orders } from '@/db/schema';
import { zelleReceipts, zelleReconciliationRuns } from '@/db/commerce-schema';
import { getOrderByNumber } from '@/lib/order-reads';
import { markOrderPaid } from '@/lib/orders';
import {
  recordZelleGmailMessage,
  recordZellePaymentClaim,
  recordZelleReconciliation,
  settleZelleReceipt,
  currentPacificDate,
  zelleClaimForOrder,
} from '@/lib/zelle';
import { parseZelleGmailMessage, type ZelleGmailMessage } from '@/lib/zelle-core';

let local: ReturnType<typeof localD1>;
const number = 'NX-260914-0001';

function message(
  id: string,
  body = `You received $125.40 with Zelle from Research Buyer.\nMemo: ${number}`,
  extra: Partial<ZelleGmailMessage> = {},
): ZelleGmailMessage {
  return {
    id,
    threadId: `thread-${id}`,
    internalDate: String(Date.UTC(2026, 8, 14, 16, 30)),
    headers: [
      { name: 'From', value: 'Chase Alerts <alerts@notify.chase.com>' },
      { name: 'To', value: 'orders@nexphaselabs.net' },
      { name: 'Subject', value: 'You received money with Zelle' },
      {
        name: 'Authentication-Results',
        value:
          'mx.google.com; dkim=pass header.i=@chase.com; spf=pass; dmarc=pass header.from=notify.chase.com',
      },
    ],
    text: body,
    ...extra,
  };
}

beforeEach(async () => {
  local = localD1();
  Object.assign(env, {
    DB: local.binding,
    APP_ENV: 'production',
    ZELLE_MODE: 'automatic',
    ZELLE_RECIPIENT_EMAIL: 'orders@nexphaselabs.net',
    ZELLE_RECIPIENT_NAME: 'NexPhase Labs Test',
    ZELLE_CHASE_SENDERS: 'alerts@notify.chase.com',
  });
  await getDb().insert(accounts).values({
    id: 'customer',
    email: 'customer@example.invalid',
    name: 'Research Buyer',
    passwordHash: 'disabled',
  });
  await getDb().insert(orders).values({
    id: 'order1',
    orderNumber: number,
    accountId: 'customer',
    status: 'awaiting_payment',
    paymentMethod: 'zelle',
    paymentRef: number,
    paymentStatus: 'pending',
    subtotalCents: 12_540,
    totalCents: 12_540,
    priceTier: 'institutional',
    consigneeName: 'Research Buyer',
    shipToLine1: 'Test',
    shipToCity: 'Test',
    shipToRegion: 'CA',
    shipToPostalCode: '00000',
    shipToCountry: 'US',
    submittedAt: new Date(),
  });
});

afterEach(() => {
  local.sqlite.close();
  for (const key of Object.keys(env)) delete env[key];
});

describe('Zelle notification parsing', () => {
  it('extracts one exact order and amount only from authenticated Chase mail', () => {
    const parsed = parseZelleGmailMessage(message('message-1'), {
      recipientEmail: 'orders@nexphaselabs.net',
      senders: ['alerts@notify.chase.com'],
    });
    expect(parsed).toMatchObject({
      authentication: 'verified',
      completion: 'received',
      amountCents: 12_540,
      orderNumber: number,
      currency: 'USD',
    });
  });

  it('fails closed for spoofed authentication, pending language, and ambiguous amounts', () => {
    const spoofed = message(
      'message-2',
      `Zelle payment pending for $125.40 and fee $1.00. Memo: ${number}`,
      {
        headers: [
          { name: 'From', value: 'alerts@notify.chase.com' },
          { name: 'To', value: 'orders@nexphaselabs.net' },
          { name: 'Authentication-Results', value: 'mx.google.com; dkim=fail; dmarc=fail' },
        ],
      },
    );
    expect(
      parseZelleGmailMessage(spoofed, {
        recipientEmail: 'orders@nexphaselabs.net',
        senders: ['alerts@notify.chase.com'],
      }),
    ).toMatchObject({
      authentication: 'failed',
      completion: 'negative',
      amountCents: null,
    });
  });

  it('rejects a forged pass header when Gmail also records its own failure', () => {
    const forged = message('message-forged', undefined, {
      headers: [
        { name: 'From', value: 'alerts@notify.chase.com' },
        { name: 'To', value: 'orders@nexphaselabs.net' },
        {
          name: 'Authentication-Results',
          value: 'mx.google.com; dkim=pass; dmarc=pass header.from=notify.chase.com',
        },
        {
          name: 'Authentication-Results',
          value: 'mx.google.com; dkim=fail; dmarc=fail header.from=notify.chase.com',
        },
      ],
    });
    expect(
      parseZelleGmailMessage(forged, {
        recipientEmail: 'orders@nexphaselabs.net',
        senders: ['alerts@notify.chase.com'],
      }).authentication,
    ).toBe('failed');
  });
});

describe('Zelle order settlement', () => {
  it('uses the Oakland business date at the UTC day boundary', () => {
    expect(currentPacificDate(new Date('2026-09-14T06:30:00Z'))).toBe('2026-09-13');
  });

  it('keeps the customer claim separate from payment evidence', async () => {
    const order = (await getOrderByNumber(number))!.order;
    expect(
      await recordZellePaymentClaim(order, 'Research Buyer', 'Research Buyer (customer)'),
    ).toMatchObject({ ok: true });
    expect((await getOrderByNumber(number))!.order.paymentStatus).toBe('pending');
    expect(local.sqlite.prepare('SELECT count(*) n FROM order_events').get()!.n).toBe(0);
  });

  it('closes the customer claim after staff verifies a manual Chase payment', async () => {
    const detail = (await getOrderByNumber(number))!;
    await recordZellePaymentClaim(
      detail.order,
      'Research Buyer',
      'Research Buyer (customer)',
    );
    expect(
      await markOrderPaid(
        detail,
        'Synthetic admin',
        'CHASE-TEST-REFERENCE',
      ),
    ).toEqual({ ok: true, outcome: 'paid' });
    expect(await zelleClaimForOrder(detail.order.id)).toMatchObject({
      status: 'matched',
      matchedReceiptId: null,
    });
  });

  it('posts one exact receipt once and queues one order notification', async () => {
    expect(await recordZelleGmailMessage(message('message-3'))).toMatchObject({
      ok: true,
      outcome: 'paid',
    });
    expect((await getOrderByNumber(number))!.order).toMatchObject({
      status: 'paid',
      paymentStatus: 'paid',
    });
    expect(local.sqlite.prepare('SELECT count(*) n FROM zelle_receipts').get()!.n).toBe(1);
    expect(local.sqlite.prepare('SELECT count(*) n FROM order_events').get()!.n).toBe(1);
    expect(local.sqlite.prepare('SELECT count(*) n FROM notifications').get()!.n).toBe(1);
    expect(await recordZelleGmailMessage(message('message-3'))).toMatchObject({
      duplicate: true,
    });
    expect(local.sqlite.prepare('SELECT count(*) n FROM order_events').get()!.n).toBe(1);
  });

  it('holds a missing memo for review and permits an attributed exact staff match', async () => {
    env.ZELLE_MODE = 'supervised';
    expect(
      await recordZelleGmailMessage(
        message('message-4', 'You received $125.40 with Zelle from Research Buyer.'),
      ),
    ).toMatchObject({ outcome: 'review' });
    const [receipt] = await getDb().select().from(zelleReceipts);
    expect(receipt.orderNumber).toBeNull();
    expect(await settleZelleReceipt(receipt.id, number, 'Synthetic admin')).toMatchObject({
      ok: true,
      note: 'paid',
    });
    expect((await getOrderByNumber(number))!.order.paymentStatus).toBe('paid');
  });

  it('records payment after cancellation as refund due without reopening fulfillment', async () => {
    local.sqlite.exec("UPDATE orders SET status = 'cancelled', payment_status = 'failed'");
    expect(await recordZelleGmailMessage(message('message-5'))).toMatchObject({
      ok: true,
      outcome: 'late payment recorded; refund review required',
    });
    expect((await getOrderByNumber(number))!.order).toMatchObject({
      status: 'cancelled',
      paymentStatus: 'refund_due',
      refundDueCents: 12_540,
    });
  });

  it('records an append-only daily Chase reconciliation snapshot', async () => {
    await recordZelleGmailMessage(message('message-6'));
    expect(
      await recordZelleReconciliation(
        '2026-09-14',
        '125.40',
        '0.00',
        'Synthetic admin',
        'Compared to Chase activity',
      ),
    ).toMatchObject({
      ok: true,
      run: { matchedCents: 12_540, differenceCents: 0, exceptionCount: 0 },
    });
    const rows = await getDb().select().from(zelleReconciliationRuns);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ businessDate: '2026-09-14', actor: 'Synthetic admin' });
  });
});
