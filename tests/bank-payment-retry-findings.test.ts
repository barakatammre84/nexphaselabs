import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localD1 } from './helpers/local-d1';

const { env } = vi.hoisted(() => ({ env: {} as Record<string, unknown> }));
vi.mock('cloudflare:workers', () => ({ env }));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

import {
  awaitingRehearsalOrder,
  bankLedger,
  REHEARSAL_STAFF,
  rehearseRefund,
  seedBankPaymentRehearsal,
} from './helpers/bank-payment-rehearsal';
import { getOrderByNumber, markOrderPaid, recordRefund } from '@/lib/orders';

let local: ReturnType<typeof localD1>;

beforeEach(async () => {
  local = localD1();
  Object.assign(env, {
    DB: local.binding,
    APP_ENV: 'production',
    OPEN_CHECKOUT_ENABLED: 'true',
    INVENTORY_RESERVATION_MINUTES: '30',
    PAYMENT_BANK_INSTRUCTIONS:
      'Synthetic routing: 000000000\nSynthetic account: 0000000000',
  });
  vi.stubGlobal(
    'fetch',
    vi.fn().mockRejectedValue(new Error('No external access permitted')),
  );
  await seedBankPaymentRehearsal();
});

afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
  local.sqlite.close();
  for (const key of Object.keys(env)) delete env[key];
});

async function refundDueOrder() {
  const awaiting = await awaitingRehearsalOrder('bank_transfer', 4);
  local.sqlite.exec(
    `UPDATE inventory_reservations SET expires_at = 0 WHERE order_id = '${awaiting.detail.order.id}'`,
  );
  const detail = (await getOrderByNumber(awaiting.detail.order.orderNumber))!;
  expect(
    await markOrderPaid(
      detail,
      REHEARSAL_STAFF.name,
      'ACH-LATE-RETRY-FINDING',
    ),
  ).toMatchObject({ ok: true, outcome: 'cancelled' });
  return awaiting;
}

describe('ACH partial-refund retry findings', () => {
  it('reproduces sequential same-reference retries double-counting while a balance remains', async () => {
    const awaiting = await refundDueOrder();
    const number = awaiting.detail.order.orderNumber;

    const first = await rehearseRefund(number, 100, 'ACH-REFUND-SAME-REF');
    const retry = await rehearseRefund(number, 100, 'ACH-REFUND-SAME-REF');

    expect(first).toEqual({ ok: true });
    expect(retry).toEqual({ ok: true });
    expect(bankLedger(local.sqlite, awaiting.detail.order.id)).toMatchObject({
      order: {
        status: 'cancelled',
        paymentStatus: 'refund_due',
        totalCents: 400,
        refundDueCents: 400,
        refundCents: 200,
        refundRef: 'ACH-REFUND-SAME-REF',
        paymentRef: 'ACH-LATE-RETRY-FINDING',
      },
      events: 5,
      lotRemaining: '10 mg',
    });
    const refundEvents = local.sqlite
      .prepare(
        `SELECT note FROM order_events
          WHERE order_id = ? AND note LIKE 'Refund of %'
          ORDER BY created_at, rowid`,
      )
      .all(awaiting.detail.order.id) as { note: string }[];
    expect(refundEvents).toHaveLength(2);
    expect(refundEvents.map(({ note }) => note)).toEqual([
      expect.stringContaining(
        'Refund of $1.00 recorded (1.00 of 4.00 owed). Reference: ACH-REFUND-SAME-REF.',
      ),
      expect.stringContaining(
        'Refund of $1.00 recorded (2.00 of 4.00 owed). Reference: ACH-REFUND-SAME-REF.',
      ),
    ]);
  });

  it.fails('KNOWN DEFECT: a sequential retry with the same refund reference must be idempotent', async () => {
    const awaiting = await refundDueOrder();
    const number = awaiting.detail.order.orderNumber;

    expect(await rehearseRefund(number, 100, 'ACH-IDEMPOTENCY-REF')).toEqual({
      ok: true,
    });
    expect(await rehearseRefund(number, 100, 'ACH-IDEMPOTENCY-REF')).toMatchObject({
      ok: false,
    });
    expect(bankLedger(local.sqlite, awaiting.detail.order.id).order).toMatchObject({
      paymentStatus: 'refund_due',
      refundDueCents: 400,
      refundCents: 100,
    });
  });

  it('keeps simultaneous stale submissions single-winner through optimistic concurrency', async () => {
    const awaiting = await refundDueOrder();
    const detail = (await getOrderByNumber(awaiting.detail.order.orderNumber))!;

    const results = await Promise.all([
      recordRefund(
        detail,
        100,
        'ACH-CONCURRENT-SAME-REF',
        REHEARSAL_STAFF.name,
      ),
      recordRefund(
        detail,
        100,
        'ACH-CONCURRENT-SAME-REF',
        REHEARSAL_STAFF.name,
      ),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toHaveLength(1);
    expect(bankLedger(local.sqlite, awaiting.detail.order.id)).toMatchObject({
      order: {
        paymentStatus: 'refund_due',
        refundDueCents: 400,
        refundCents: 100,
      },
      events: 4,
      lotRemaining: '10 mg',
    });
  });
});