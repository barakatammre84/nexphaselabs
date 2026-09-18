import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
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
    ZELLE_MODE: 'manual',
    ZELLE_RECIPIENT_EMAIL: 'payments@example.invalid',
    ZELLE_RECIPIENT_NAME: 'SYNTHETIC REHEARSAL ONLY',
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

async function refundDueOrder(method: 'bank_transfer' | 'zelle') {
  const awaiting = await awaitingRehearsalOrder(method, 4);
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

describe.each(['bank_transfer', 'zelle'] as const)('%s partial-refund retries', (method) => {
  const createOrder = () => refundDueOrder(method);
  const referenceRows = (orderId: string) => local.sqlite.prepare(
    'SELECT reference, amount_cents AS amountCents FROM order_refund_references WHERE order_id = ? ORDER BY reference',
  ).all(orderId);

  it('records only one ledger event for sequential same-reference retries', async () => {
    const awaiting = await createOrder();
    const number = awaiting.detail.order.orderNumber;

    const first = await rehearseRefund(number, 100, 'ACH-REFUND-SAME-REF');
    const retry = await rehearseRefund(number, 100, 'ACH-REFUND-SAME-REF');

    expect(first).toEqual({ ok: true });
    expect(retry).toMatchObject({ ok: false, error: expect.stringContaining('already recorded') });
    expect(bankLedger(local.sqlite, awaiting.detail.order.id)).toMatchObject({
      order: {
        status: 'cancelled',
        paymentStatus: 'refund_due',
        totalCents: 400,
        refundDueCents: 400,
        refundCents: 100,
        refundRef: 'ACH-REFUND-SAME-REF',
        paymentRef: 'ACH-LATE-RETRY-FINDING',
      },
      events: 4,
      lotRemaining: '10 mg',
    });
    const refundEvents = local.sqlite
      .prepare(
        `SELECT note FROM order_events
          WHERE order_id = ? AND note LIKE 'Refund of %'
          ORDER BY created_at, rowid`,
      )
      .all(awaiting.detail.order.id) as { note: string }[];
    expect(refundEvents).toHaveLength(1);
    expect(refundEvents.map(({ note }) => note)).toEqual([
      expect.stringContaining(
        'Refund of $1.00 recorded (1.00 of 4.00 owed). Reference: ACH-REFUND-SAME-REF.',
      ),
    ]);
    expect(referenceRows(awaiting.detail.order.id)).toEqual([
      { reference: 'ACH-REFUND-SAME-REF', amountCents: 100 },
    ]);
  });

  it('a sequential retry with the same refund reference is idempotent', async () => {
    const awaiting = await createOrder();
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
    const awaiting = await createOrder();
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
    expect(referenceRows(detail.order.id)).toHaveLength(1);
  });

  it('remembers earlier references after top-ups and completion without changing any ledger state', async () => {
    const { detail } = await createOrder();
    const number = detail.order.orderNumber;
    expect(await rehearseRefund(number, 100, 'FIRST')).toEqual({ ok: true });
    expect(await rehearseRefund(number, 100, 'SECOND')).toEqual({ ok: true });
    const partial = bankLedger(local.sqlite, detail.order.id);
    expect(await rehearseRefund(number, 100, 'FIRST')).toMatchObject({ ok: false });
    expect(await rehearseRefund(number, 200, 'FIRST')).toMatchObject({
      ok: false, error: expect.stringContaining('different amount'),
    });
    expect(bankLedger(local.sqlite, detail.order.id)).toEqual(partial);
    expect(await rehearseRefund(number, 200, 'FINAL')).toEqual({ ok: true });
    const complete = bankLedger(local.sqlite, detail.order.id);
    expect(complete.order).toMatchObject({ refundCents: 400, paymentStatus: 'refunded', refundRef: 'FINAL' });
    for (const [reference, amount] of [['FIRST', 100], ['SECOND', 100], ['FINAL', 200]] as const) {
      expect(await rehearseRefund(number, amount, reference)).toMatchObject({
        ok: false, error: expect.stringContaining('already recorded'),
      });
    }
    expect(await rehearseRefund(number, 300, 'FINAL')).toMatchObject({
      ok: false, error: expect.stringContaining('different amount'),
    });
    expect(bankLedger(local.sqlite, detail.order.id)).toEqual(complete);
    expect(referenceRows(detail.order.id)).toHaveLength(3);
  });

  it('rejects mismatched concurrent reuse and lets the losing distinct reference retry', async () => {
    const { detail: original } = await createOrder();
    const number = original.order.orderNumber;
    const detail = (await getOrderByNumber(number))!;
    const results = await Promise.all([
      recordRefund(detail, 100, 'RACE', REHEARSAL_STAFF.name),
      recordRefund(detail, 200, 'RACE', REHEARSAL_STAFF.name),
    ]);
    expect(results.filter(result => result.ok)).toHaveLength(1);
    expect(results.find(result => !result.ok)).toMatchObject({
      error: expect.stringContaining('different amount'),
    });
    expect(referenceRows(detail.order.id)).toHaveLength(1);
    const fresh = (await getOrderByNumber(number))!;
    const distinct = await Promise.all([
      recordRefund(fresh, 100, 'TOPUP-A', REHEARSAL_STAFF.name),
      recordRefund(fresh, 100, 'TOPUP-B', REHEARSAL_STAFF.name),
    ]);
    expect(distinct.filter(result => result.ok)).toHaveLength(1);
    const loser = distinct[0].ok ? 'TOPUP-B' : 'TOPUP-A';
    expect(referenceRows(detail.order.id).some(row => row.reference === loser)).toBe(false);
    expect(await rehearseRefund(number, 100, loser)).toEqual({ ok: true });
    expect(referenceRows(detail.order.id)).toHaveLength(3);
  });

  it('guards against a reference inserted after the pre-read but before the batch', async () => {
    const { detail: original } = await createOrder();
    const detail = (await getOrderByNumber(original.order.orderNumber))!;
    const before = bankLedger(local.sqlite, detail.order.id);
    local.beforeNextBatch(() => {
      local.sqlite.prepare('INSERT INTO order_refund_references VALUES (?, ?, ?)').run(detail.order.id, 'RACING-KEY', 100);
    });
    expect(await recordRefund(detail, 100, 'RACING-KEY', REHEARSAL_STAFF.name)).toMatchObject({ ok: false });
    expect(bankLedger(local.sqlite, detail.order.id)).toEqual(before);
  });

  it.each(['order_refund_references', 'order_events', 'notifications'])('rolls back the total, identity, event and notification if %s fails', async (table) => {
    const { detail: original } = await createOrder();
    const number = original.order.orderNumber;
    const before = bankLedger(local.sqlite, original.order.id);
    local.sqlite.exec(`CREATE TRIGGER reject_refund BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;`);
    await expect(rehearseRefund(number, 100, 'ROLLBACK')).rejects.toThrow();
    expect(bankLedger(local.sqlite, original.order.id)).toEqual(before);
    expect(referenceRows(original.order.id)).toHaveLength(0);
    local.sqlite.exec('DROP TRIGGER reject_refund');
    expect(await rehearseRefund(number, 100, 'ROLLBACK')).toEqual({ ok: true });
  });

  it('trims references without truncation and scopes identity to the order', async () => {
    const { detail } = await createOrder();
    const number = detail.order.orderNumber;
    const reference = 'X'.repeat(120);
    expect(await rehearseRefund(number, 100, ` ${reference} `)).toEqual({ ok: true });
    expect(await rehearseRefund(number, 100, reference)).toMatchObject({ ok: false });
    expect(await rehearseRefund(number, 100, `${reference}Y`)).toMatchObject({ ok: false });
    expect(referenceRows(detail.order.id)).toHaveLength(1);
    const other = await createOrder();
    expect(await rehearseRefund(other.detail.order.orderNumber, 100, reference)).toEqual({ ok: true });
    expect(referenceRows(other.detail.order.id)).toHaveLength(1);
  });

  it('reserves historical references during migration without changing existing money or events', async () => {
    const { detail } = await createOrder();
    const number = detail.order.orderNumber;
    const reference = 'OLD. Reference: transfer.%_';
    await rehearseRefund(number, 100, reference);
    await rehearseRefund(number, 100, 'LATEST');
    // Replay only the new migration over a synthetic pre-migration ledger.
    local.sqlite.exec('DROP TABLE order_refund_references');
    // Simulate the original defect: two historical events share the same key.
    local.sqlite.prepare(`INSERT INTO order_events
      (id, order_id, from_status, to_status, note, actor, internal, created_at)
      SELECT id || '-duplicate', order_id, from_status, to_status, note, actor, internal, created_at
      FROM order_events WHERE order_id = ? AND note LIKE 'Refund of %' ORDER BY rowid LIMIT 1`).run(detail.order.id);
    local.sqlite.prepare('UPDATE orders SET refund_cents = 300 WHERE id = ?').run(detail.order.id);
    const before = bankLedger(local.sqlite, detail.order.id);
    local.sqlite.exec(readFileSync(new URL('../drizzle/0070_order_refund_references.sql', import.meta.url), 'utf8'));
    expect(referenceRows(detail.order.id)).toEqual([
      { reference: 'LATEST', amountCents: null },
      { reference, amountCents: null },
    ]);
    for (const ref of [reference, 'LATEST']) {
      expect(await rehearseRefund(number, 100, ref)).toMatchObject({ ok: false });
      expect(await rehearseRefund(number, 200, ref)).toMatchObject({ ok: false });
    }
    expect(bankLedger(local.sqlite, detail.order.id)).toEqual(before);
    expect(await rehearseRefund(number, 100, 'NEW')).toEqual({ ok: true });
  });

  it('reserves an order-only historical reference when its original event is unavailable', async () => {
    const { detail } = await createOrder();
    local.sqlite.exec('DROP TABLE order_refund_references');
    local.sqlite.prepare('UPDATE orders SET refund_cents = 100, refund_ref = ? WHERE id = ?')
      .run('ORDER-ONLY-LEGACY', detail.order.id);
    const before = bankLedger(local.sqlite, detail.order.id);
    local.sqlite.exec(readFileSync(new URL('../drizzle/0070_order_refund_references.sql', import.meta.url), 'utf8'));
    expect(referenceRows(detail.order.id)).toEqual([{ reference: 'ORDER-ONLY-LEGACY', amountCents: null }]);
    expect(await rehearseRefund(detail.order.orderNumber, 100, 'ORDER-ONLY-LEGACY')).toMatchObject({ ok: false });
    expect(bankLedger(local.sqlite, detail.order.id)).toEqual(before);
  });
});