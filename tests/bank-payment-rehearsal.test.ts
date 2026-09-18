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
  competingRehearsalBuyer,
  REHEARSAL_STAFF,
  rehearseRefund,
  seedBankPaymentRehearsal,
  submittedRehearsalOrder,
  syntheticZelleReceipt,
} from './helpers/bank-payment-rehearsal';
import {
  availablePaymentMethods,
  getPaymentMethod,
} from '@/lib/payments';
import {
  beginPayment,
  getOrderByNumber,
  markOrderPaid,
} from '@/lib/orders';
import {
  recordZelleGmailMessage,
  recordZellePaymentClaim,
  rejectZelleReceipt,
  settleZelleReceipt,
  zelleClaimForOrder,
} from '@/lib/zelle';

let local: ReturnType<typeof localD1>;

beforeEach(async () => {
  local = localD1();
  Object.assign(env, {
    DB: local.binding,
    APP_ENV: 'production',
    OPEN_CHECKOUT_ENABLED: 'true',
    INVENTORY_RESERVATION_MINUTES: '30',
    PAYMENT_BANK_INSTRUCTIONS:
      'Synthetic routing: 000000000\nSynthetic account: 0000000000\nNo money moves in this isolated test.',
    ZELLE_MODE: 'automatic',
    ZELLE_RECIPIENT_EMAIL: 'payments@example.invalid',
    ZELLE_RECIPIENT_NAME: 'SYNTHETIC REHEARSAL ONLY',
    ZELLE_GMAIL_MAILBOX: 'payments@example.invalid',
    ZELLE_CHASE_SENDERS: 'alerts@bank.invalid',
  });
  vi.stubGlobal(
    'fetch',
    vi.fn().mockRejectedValue(new Error('External access is forbidden in bank rehearsal')),
  );
  await seedBankPaymentRehearsal();
});

afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
  local.sqlite.close();
  for (const key of Object.keys(env)) delete env[key];
});

describe('safe integrated ACH and Zelle lifecycle rehearsal', () => {
  it('exercises the private ACH adapter from cart submission through one staff settlement', async () => {
    const created = await submittedRehearsalOrder(2);
    const started = await beginPayment(
      created.detail,
      'bank_transfer',
      'buyer@example.invalid',
      REHEARSAL_STAFF.name,
    );
    expect(started).toMatchObject({
      ok: true,
      instructions: {
        method: 'bank_transfer',
        reference: created.detail.order.orderNumber,
        url: null,
      },
    });
    if (!started.ok) throw new Error(started.error);
    expect(started.instructions.lines).toEqual(
      expect.arrayContaining([
        'Amount: 2.00 USD',
        `Reference: ${created.detail.order.orderNumber}`,
        'Synthetic routing: 000000000',
        'Synthetic account: 0000000000',
      ]),
    );

    let detail = (await getOrderByNumber(created.detail.order.orderNumber))!;
    expect(
      await markOrderPaid(detail, REHEARSAL_STAFF.name, 'ACH-SYNTHETIC-0001'),
    ).toMatchObject({ ok: true, outcome: 'paid' });
    expect(
      await markOrderPaid(detail, REHEARSAL_STAFF.name, 'ACH-SYNTHETIC-RETRY'),
    ).toMatchObject({ ok: false });
    expect(
      await beginPayment(
        created.detail,
        'bank_transfer',
        'buyer@example.invalid',
        REHEARSAL_STAFF.name,
      ),
    ).toMatchObject({ ok: false });

    const ledger = bankLedger(local.sqlite, detail.order.id);
    expect(ledger.order).toMatchObject({
      status: 'paid',
      paymentStatus: 'paid',
      paymentMethod: 'bank_transfer',
      paymentRef: 'ACH-SYNTHETIC-0001',
    });
    expect(ledger).toMatchObject({
      attempts: 1,
      events: 3,
      reservations: 1,
      reservedUnits: 4_000,
      lotRemaining: '10 mg',
    });
  });

  it('keeps a Zelle buyer claim unpaid until an authorized staff settlement closes it', async () => {
    const awaiting = await awaitingRehearsalOrder('zelle');
    expect(awaiting.instructions.zelle).toMatchObject({
      recipientEmail: 'payments@example.invalid',
      amountCents: 100,
      memo: awaiting.detail.order.orderNumber,
    });
    expect(
      await recordZellePaymentClaim(
        awaiting.detail.order,
        'Synthetic Buyer',
        'Synthetic buyer (local)',
      ),
    ).toMatchObject({ ok: true });
    expect((await getOrderByNumber(awaiting.detail.order.orderNumber))!.order).toMatchObject({
      status: 'awaiting_payment',
      paymentStatus: 'pending',
      paidAt: null,
    });
    expect(bankLedger(local.sqlite, awaiting.detail.order.id).events).toBe(2);

    expect(
      await markOrderPaid(
        (await getOrderByNumber(awaiting.detail.order.orderNumber))!,
        REHEARSAL_STAFF.name,
        'ZELLE-STAFF-SYNTHETIC',
      ),
    ).toMatchObject({ ok: true, outcome: 'paid' });
    expect(await zelleClaimForOrder(awaiting.detail.order.id)).toMatchObject({
      status: 'matched',
      matchedReceiptId: null,
    });
    expect(bankLedger(local.sqlite, awaiting.detail.order.id)).toMatchObject({
      events: 3,
      reservations: 1,
      reservedUnits: 2_000,
      lotRemaining: '10 mg',
    });
  });

  it('posts one exact synthetic bank Gmail receipt and holds retries or extra money as duplicates', async () => {
    const awaiting = await awaitingRehearsalOrder('zelle');
    const number = awaiting.detail.order.orderNumber;
    await recordZellePaymentClaim(
      awaiting.detail.order,
      'Synthetic Buyer',
      'Synthetic buyer (local)',
    );
    const exact = syntheticZelleReceipt(number, 'gmail-exact-1');
    expect(await recordZelleGmailMessage(exact)).toMatchObject({
      ok: true,
      duplicate: false,
      outcome: 'paid',
    });
    expect(await recordZelleGmailMessage(exact)).toMatchObject({
      ok: true,
      duplicate: true,
    });
    expect(
      await recordZelleGmailMessage(
        syntheticZelleReceipt(number, 'gmail-extra-payment'),
      ),
    ).toMatchObject({ ok: false, outcome: 'review' });

    const claim = await zelleClaimForOrder(awaiting.detail.order.id);
    const ledger = bankLedger(local.sqlite, awaiting.detail.order.id);
    expect(claim).toMatchObject({
      status: 'matched',
      matchedReceiptId: expect.any(String),
    });
    expect(ledger.order).toMatchObject({ status: 'paid', paymentStatus: 'paid' });
    expect(ledger).toMatchObject({
      events: 3,
      receipts: 2,
      reservations: 1,
      reservedUnits: 2_000,
      lotRemaining: '10 mg',
    });
    expect(
      local.sqlite
        .prepare(
          "SELECT count(*) AS n FROM zelle_receipts WHERE outcome = 'duplicate'",
        )
        .get()!.n,
    ).toBe(1);
  });

  it('holds mismatched amount and reference for review, then permits explicit rejection only', async () => {
    const awaiting = await awaitingRehearsalOrder('zelle');
    const number = awaiting.detail.order.orderNumber;
    expect(
      await recordZelleGmailMessage(
        syntheticZelleReceipt(number, 'gmail-wrong-amount', '1.01'),
      ),
    ).toMatchObject({ ok: true, outcome: 'review' });
    expect(
      await recordZelleGmailMessage(
        syntheticZelleReceipt(
          number,
          'gmail-wrong-reference',
          '1.00',
          'NX-260918-9999',
        ),
      ),
    ).toMatchObject({ ok: true, outcome: 'review' });
    const receipts = local.sqlite
      .prepare('SELECT id, source_message_id AS source FROM zelle_receipts ORDER BY source')
      .all() as { id: string; source: string }[];
    const amountReceipt = receipts.find((row) => row.source === 'gmail-wrong-amount')!;
    const referenceReceipt = receipts.find(
      (row) => row.source === 'gmail-wrong-reference',
    )!;
    expect(
      await settleZelleReceipt(
        amountReceipt.id,
        number,
        REHEARSAL_STAFF.name,
      ),
    ).toMatchObject({
      ok: false,
      note: 'receipt amount or currency does not match the order',
    });
    expect(
      await settleZelleReceipt(
        referenceReceipt.id,
        number,
        REHEARSAL_STAFF.name,
      ),
    ).toMatchObject({ ok: false, note: 'receipt names a different order' });
    expect(
      await rejectZelleReceipt(
        amountReceipt.id,
        REHEARSAL_STAFF.name,
        'Synthetic mismatch confirmed during rehearsal',
      ),
    ).toMatchObject({ ok: true });
    expect(
      (await getOrderByNumber(number))!.order,
    ).toMatchObject({ status: 'awaiting_payment', paymentStatus: 'pending' });
    expect(bankLedger(local.sqlite, awaiting.detail.order.id)).toMatchObject({
      events: 2,
      reservations: 1,
      lotRemaining: '10 mg',
    });
  });

  it('routes expired ACH money to refund review, releases stock, and records zero/partial/full refunds safely', async () => {
    const awaiting = await awaitingRehearsalOrder('bank_transfer', 4);
    const number = awaiting.detail.order.orderNumber;
    local.sqlite.exec(
      `UPDATE inventory_reservations SET expires_at = 0 WHERE order_id = '${awaiting.detail.order.id}'`,
    );
    expect(
      await markOrderPaid(
        (await getOrderByNumber(number))!,
        REHEARSAL_STAFF.name,
        'ACH-LATE-SYNTHETIC',
      ),
    ).toMatchObject({ ok: true, outcome: 'cancelled' });

    const competitor = await competingRehearsalBuyer(4);
    expect(await competitor.submit()).toMatchObject({ ok: true });
    expect(await rehearseRefund(number, 0, 'ACH-REFUND-ZERO')).toMatchObject({
      ok: false,
    });
    expect(await rehearseRefund(number, 150, 'ACH-REFUND-PARTIAL')).toEqual({
      ok: true,
    });
    expect(await rehearseRefund(number, 251, 'ACH-REFUND-EXCESS')).toMatchObject({
      ok: false,
    });
    expect(await rehearseRefund(number, 250, 'ACH-REFUND-FULL')).toEqual({
      ok: true,
    });
    expect(await rehearseRefund(number, 1, 'ACH-REFUND-RETRY')).toMatchObject({
      ok: false,
    });

    const ledger = bankLedger(local.sqlite, awaiting.detail.order.id);
    expect(ledger.order).toMatchObject({
      status: 'cancelled',
      paymentStatus: 'refunded',
      totalCents: 400,
      refundDueCents: 400,
      refundCents: 400,
    });
    expect(ledger).toMatchObject({
      attempts: 1,
      events: 5,
      reservations: 1,
      reservedUnits: 8_000,
      lotRemaining: '10 mg',
    });
  });

  it('routes an exact Zelle receipt after stock expiry to refund_due without reviving fulfillment', async () => {
    const awaiting = await awaitingRehearsalOrder('zelle', 4);
    const number = awaiting.detail.order.orderNumber;
    local.sqlite.exec(
      `UPDATE inventory_reservations SET expires_at = 0 WHERE order_id = '${awaiting.detail.order.id}'`,
    );
    expect(
      await recordZelleGmailMessage(
        syntheticZelleReceipt(number, 'gmail-after-expiry', '4.00'),
      ),
    ).toMatchObject({
      ok: true,
      outcome: 'late payment recorded; refund review required',
    });
    expect(bankLedger(local.sqlite, awaiting.detail.order.id)).toMatchObject({
      order: {
        status: 'cancelled',
        paymentStatus: 'refund_due',
        refundDueCents: 400,
      },
      events: 3,
      receipts: 1,
      reservations: 1,
      reservedUnits: 8_000,
      lotRemaining: '10 mg',
    });
    expect(await (await competingRehearsalBuyer(4)).submit()).toMatchObject({
      ok: true,
    });
  });

  it.each(['development', 'staging'])(
    'cannot offer or begin ACH in %s even when synthetic bank details are present',
    async (environment) => {
      env.APP_ENV = environment;
      expect(availablePaymentMethods().map((method) => method.id)).not.toContain(
        'bank_transfer',
      );
      expect(getPaymentMethod('bank_transfer')).toBeNull();
      const created = await submittedRehearsalOrder();
      expect(
        await beginPayment(
          created.detail,
          'bank_transfer',
          'buyer@example.invalid',
          REHEARSAL_STAFF.name,
        ),
      ).toEqual({ ok: false, error: 'That payment method is not available.' });
      expect(bankLedger(local.sqlite, created.detail.order.id)).toMatchObject({
        attempts: 0,
        events: 1,
        reservations: 1,
        lotRemaining: '10 mg',
      });
    },
  );
});