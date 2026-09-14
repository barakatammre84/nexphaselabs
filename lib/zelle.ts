import { and, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { env } from 'cloudflare:workers';
import { getDb } from '@/db';
import {
  zelleMailboxState,
  zellePaymentClaims,
  zelleReconciliationRuns,
  zelleReceipts,
} from '@/db/commerce-schema';
import { orderEvents, orders, type Order } from '@/db/schema';
import { conditionalInsert } from '@/lib/conditional-insert';
import { livePaymentsAllowed } from '@/lib/environment-safety';
import { reservationEligibility } from '@/lib/inventory-reservations';
import { getOrderByNumber } from '@/lib/order-reads';
import { parseZelleGmailMessage, type ZelleGmailMessage } from '@/lib/zelle-core';
import { zelleConfig, zelleMode } from '@/lib/zelle-config';

const newId = (prefix: string) =>
  `${prefix}_${crypto.randomUUID().replaceAll('-', '').slice(0, 24)}`;

async function sha256(value: string): Promise<string> {
  const bytes = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
  );
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function zelleClaimForOrder(orderId: string) {
  const [claim] = await getDb()
    .select()
    .from(zellePaymentClaims)
    .where(eq(zellePaymentClaims.orderId, orderId))
    .limit(1);
  return claim ?? null;
}

/** Customer input accelerates review but never changes payment or order state. */
export async function recordZellePaymentClaim(
  order: Order,
  payerName: string,
  actor: string,
) {
  if (
    order.paymentMethod !== 'zelle' ||
    order.status !== 'awaiting_payment' ||
    order.paymentStatus !== 'pending'
  )
    return { ok: false as const, error: 'This order is not awaiting a Zelle payment.' };
  const cleanName = payerName.replace(/\s+/gu, ' ').trim().slice(0, 120) || null;
  await getDb()
    .insert(zellePaymentClaims)
    .values({
      orderId: order.id,
      payerName: cleanName,
      claimedBy: actor,
      status: 'pending',
    })
    .onConflictDoNothing();
  return { ok: true as const, claim: await zelleClaimForOrder(order.id) };
}

export async function zelleReceiptsForOrder(orderId: string, limit = 20) {
  return getDb()
    .select()
    .from(zelleReceipts)
    .where(eq(zelleReceipts.orderId, orderId))
    .orderBy(desc(zelleReceipts.receivedAt))
    .limit(Math.max(1, Math.min(100, limit)));
}

export async function listZelleReceipts(
  outcome?: string,
  limit = 100,
) {
  const allowed = [
    'received',
    'review',
    'matched',
    'refund_due',
    'rejected',
    'duplicate',
    'ignored',
  ];
  return getDb()
    .select()
    .from(zelleReceipts)
    .where(outcome && allowed.includes(outcome) ? eq(zelleReceipts.outcome, outcome) : undefined)
    .orderBy(desc(zelleReceipts.receivedAt))
    .limit(Math.max(1, Math.min(250, limit)));
}

export async function zelleReceiptCounts() {
  const rows = await getDb()
    .select({
      outcome: zelleReceipts.outcome,
      count: sql<number>`count(*)`.mapWith(Number),
    })
    .from(zelleReceipts)
    .groupBy(zelleReceipts.outcome);
  return Object.fromEntries(rows.map((row) => [row.outcome, row.count]));
}

export async function zelleMailboxHealth() {
  const config = zelleConfig();
  if (!config.mailbox) return null;
  const [state] = await getDb()
    .select()
    .from(zelleMailboxState)
    .where(eq(zelleMailboxState.mailbox, config.mailbox))
    .limit(1);
  return state ?? null;
}

export async function listZelleReconciliationRuns(limit = 30) {
  return getDb()
    .select()
    .from(zelleReconciliationRuns)
    .orderBy(desc(zelleReconciliationRuns.createdAt))
    .limit(Math.max(1, Math.min(100, limit)));
}

function moneyCents(raw: string): number | null {
  const value = raw.trim().replace(/^\$/u, '');
  if (!/^\d+(?:\.\d{1,2})?$/u.test(value)) return null;
  const cents = Math.round(Number(value) * 100);
  return Number.isSafeInteger(cents) && cents >= 0 ? cents : null;
}

/** Convert a calendar midnight in the Oakland operating timezone to UTC without
 * depending on the runtime's local timezone. */
function pacificMidnight(year: number, month: number, day: number): Date {
  const guess = Date.UTC(year, month - 1, day);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(guess))
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  );
  const shownAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return new Date(guess - (shownAsUtc - guess));
}

function businessDayBounds(value: string): { start: Date; end: Date } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.toISOString().slice(0, 10) !== value) return null;
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return {
    start: pacificMidnight(year, month, day),
    end: pacificMidnight(
      next.getUTCFullYear(),
      next.getUTCMonth() + 1,
      next.getUTCDate(),
    ),
  };
}

export function currentPacificDate(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export async function recordZelleReconciliation(
  businessDate: string,
  rawReceived: string,
  rawRefunded: string,
  actor: string,
  note: string,
) {
  const bounds = businessDayBounds(businessDate);
  if (!bounds) return { ok: false as const, error: 'Enter a real business date.' };
  const chaseReceivedCents = moneyCents(rawReceived);
  const chaseRefundedCents = moneyCents(rawRefunded);
  if (chaseReceivedCents === null || chaseRefundedCents === null)
    return { ok: false as const, error: 'Enter Chase totals in dollars, for example 125.40.' };
  const receipts = await getDb()
    .select({
      amountCents: zelleReceipts.amountCents,
      outcome: zelleReceipts.outcome,
    })
    .from(zelleReceipts)
    .where(
      and(
        gte(zelleReceipts.occurredAt, bounds.start),
        lt(zelleReceipts.occurredAt, bounds.end),
        inArray(zelleReceipts.outcome, [
          'review',
          'matched',
          'refund_due',
          'duplicate',
          'rejected',
        ]),
      ),
    );
  const matched = receipts.filter((receipt) =>
    ['matched', 'refund_due'].includes(receipt.outcome),
  );
  const matchedCents = matched.reduce(
    (total, receipt) => total + (receipt.amountCents ?? 0),
    0,
  );
  const exceptionCount = receipts.length - matched.length;
  const run = {
    id: newId('zrr'),
    businessDate,
    chaseReceivedCents,
    chaseRefundedCents,
    matchedCents,
    matchedCount: matched.length,
    exceptionCount,
    differenceCents: chaseReceivedCents - matchedCents,
    actor,
    note: note.replace(/\s+/gu, ' ').trim().slice(0, 500) || null,
  };
  await getDb().insert(zelleReconciliationRuns).values(run);
  return { ok: true as const, run };
}

export type ZelleSettlementResult = {
  ok: boolean;
  note: string;
  retryable?: boolean;
};

/** Settle one verified receipt against one order. The receipt, order transition,
 * customer notification trigger, and claim resolution commit as one D1 batch. */
export async function settleZelleReceipt(
  receiptId: string,
  orderNumber: string,
  actor: string,
  automatic = false,
): Promise<ZelleSettlementResult> {
  if (!livePaymentsAllowed(env.APP_ENV))
    return { ok: false, note: 'live Zelle settlement is disabled outside production' };
  const db = getDb();
  for (let attempt = 0; attempt < 2; attempt++) {
    const [receipt] = await db
      .select()
      .from(zelleReceipts)
      .where(eq(zelleReceipts.id, receiptId))
      .limit(1);
    if (!receipt) return { ok: false, note: 'unknown receipt' };
    if (['matched', 'refund_due'].includes(receipt.outcome))
      return { ok: true, note: 'receipt already recorded' };
    if (receipt.outcome !== 'review')
      return { ok: false, note: `receipt is ${receipt.outcome}` };
    if (
      receipt.authentication !== 'verified' ||
      receipt.completion !== 'received' ||
      receipt.amountCents === null ||
      receipt.currency !== 'USD'
    )
      return { ok: false, note: 'receipt evidence is incomplete or unverified' };
    if (automatic && receipt.orderNumber !== orderNumber)
      return { ok: false, note: 'automatic posting requires the exact order memo' };
    if (receipt.orderNumber && receipt.orderNumber !== orderNumber)
      return { ok: false, note: 'receipt names a different order' };

    const detail = await getOrderByNumber(orderNumber);
    if (!detail) return { ok: false, note: 'unknown order' };
    const order = detail.order;
    if (
      order.paymentMethod !== 'zelle' ||
      order.paymentRef !== order.orderNumber
    )
      return { ok: false, note: 'order is not configured for this Zelle payment' };
    if (order.totalCents !== receipt.amountCents || order.currency !== receipt.currency)
      return { ok: false, note: 'receipt amount or currency does not match the order' };
    if (
      order.paidAt ||
      ['paid', 'refund_due', 'refunded'].includes(order.paymentStatus)
    ) {
      await db
        .update(zelleReceipts)
        .set({
          orderId: order.id,
          outcome: 'duplicate',
          outcomeDetail: 'The order already has a recorded settlement. Review for a possible duplicate payment.',
          decidedBy: actor,
          processedAt: new Date(),
        })
        .where(and(eq(zelleReceipts.id, receipt.id), eq(zelleReceipts.outcome, 'review')));
      return { ok: false, note: 'order already has a settlement; receipt held as duplicate' };
    }
    if (!['awaiting_payment', 'cancelled'].includes(order.status))
      return { ok: false, note: 'order is not ready for settlement', retryable: true };

    const allocation = await reservationEligibility(order.id);
    const cancelled =
      order.status === 'cancelled' || (allocation.tracked && !allocation.valid);
    const now = new Date();
    const marker = newId('otr');
    const nextOutcome = cancelled ? 'refund_due' : 'matched';
    const note = cancelled
      ? `Verified Zelle receipt ${receipt.sourceMessageId} arrived after cancellation or inventory expiry. Refund review required; no shipment authorized.`
      : `Verified Zelle receipt ${receipt.sourceMessageId} matched for ${receipt.amountCents} cents.`;
    const orderMarker = and(eq(orders.id, order.id), eq(orders.lastTransitionId, marker))!;
    const [changed] = await db.batch([
      db
        .update(orders)
        .set({
          status: cancelled ? 'cancelled' : 'paid',
          paymentStatus: cancelled ? 'refund_due' : 'paid',
          paidAt: now,
          ...(cancelled && order.status !== 'cancelled'
            ? {
                cancelledAt: now,
                cancelReason:
                  'Stock reservation expired or allocated lot was unavailable when the Zelle payment arrived.',
              }
            : {}),
          ...(cancelled ? { refundDueCents: order.totalCents } : {}),
          lastTransitionId: marker,
          updatedAt: now,
        })
        .where(
          and(
            eq(orders.id, order.id),
            eq(orders.status, order.status),
            eq(orders.paymentStatus, order.paymentStatus),
            eq(orders.paymentMethod, 'zelle'),
            eq(orders.paymentRef, order.orderNumber),
            sql`${orders.paidAt} IS NULL`,
            sql`${orders.lastTransitionId} IS ${order.lastTransitionId}`,
            allocation.valid ? allocation.guard : sql`NOT (${allocation.guard})`,
          ),
        )
        .returning({ id: orders.id }),
      db
        .update(zelleReceipts)
        .set({
          orderId: order.id,
          orderNumber: order.orderNumber,
          outcome: nextOutcome,
          outcomeDetail: cancelled
            ? 'Payment recorded and routed to refund review; fulfillment remains blocked.'
            : 'Verified receipt posted to the order.',
          decidedBy: actor,
          processedAt: now,
        })
        .where(
          and(
            eq(zelleReceipts.id, receipt.id),
            eq(zelleReceipts.outcome, 'review'),
            sql`EXISTS (SELECT 1 FROM ${orders} WHERE ${orderMarker})`,
          ),
        ),
      db
        .update(zellePaymentClaims)
        .set({
          status: 'matched',
          matchedReceiptId: receipt.id,
          updatedAt: now,
        })
        .where(
          and(
            eq(zellePaymentClaims.orderId, order.id),
            sql`EXISTS (SELECT 1 FROM ${orders} WHERE ${orderMarker})`,
          ),
        ),
      conditionalInsert(
        orderEvents,
        {
          id: newId('oev'),
          orderId: order.id,
          fromStatus: order.status,
          toStatus: cancelled ? 'cancelled' : 'paid',
          note,
          actor,
          createdAt: now,
        },
        orders,
        orderMarker,
      ),
    ]);
    if (changed.length)
      return {
        ok: true,
        note: cancelled ? 'late payment recorded; refund review required' : 'paid',
      };
  }
  return { ok: false, note: 'order changed during settlement; retry required', retryable: true };
}

export async function rejectZelleReceipt(
  receiptId: string,
  actor: string,
  note: string,
) {
  const reason = note.replace(/\s+/gu, ' ').trim().slice(0, 300);
  if (!reason) return { ok: false, note: 'Enter a reason for rejecting this receipt.' };
  const [changed] = await getDb()
    .update(zelleReceipts)
    .set({
      outcome: 'rejected',
      outcomeDetail: reason,
      decidedBy: actor,
      processedAt: new Date(),
    })
    .where(and(eq(zelleReceipts.id, receiptId), eq(zelleReceipts.outcome, 'review')))
    .returning({ id: zelleReceipts.id });
  return changed
    ? { ok: true, note: 'Receipt rejected.' }
    : { ok: false, note: 'Receipt changed; reload before deciding.' };
}

export async function recordZelleGmailMessage(message: ZelleGmailMessage) {
  const config = zelleConfig();
  const parsed = parseZelleGmailMessage(message, config);
  const messageHash = await sha256(
    JSON.stringify({
      id: message.id,
      threadId: message.threadId,
      internalDate: message.internalDate,
      headers: message.headers,
      text: message.text,
    }),
  );
  const initialOutcome =
    parsed.authentication === 'failed'
      ? 'rejected'
      : parsed.completion === 'negative'
        ? 'ignored'
        : 'review';
  const initialDetail =
    parsed.authentication === 'failed'
      ? 'Sender, recipient, DKIM, or DMARC evidence did not pass the configured policy.'
      : parsed.completion === 'negative'
        ? 'The message describes a request, pending, failed, cancelled, or reversed payment.'
        : parsed.completion !== 'received'
          ? 'The message did not contain a recognized completed-payment phrase.'
          : parsed.amountCents === null
            ? 'A single unambiguous USD amount could not be parsed.'
            : parsed.orderNumber === null
              ? 'No unique NexPhase order number was present; staff review is required.'
              : 'Candidate receipt is ready for matching.';
  const id = newId('zrc');
  const [inserted] = await getDb()
    .insert(zelleReceipts)
    .values({
      id,
      sourceMessageId: parsed.sourceMessageId,
      sourceThreadId: parsed.sourceThreadId,
      messageHash,
      sender: parsed.sender,
      recipient: parsed.recipient,
      authentication: parsed.authentication,
      completion: parsed.completion,
      amountCents: parsed.amountCents,
      currency: parsed.currency,
      payerName: parsed.payerName,
      memo: parsed.memo,
      orderNumber: parsed.orderNumber,
      occurredAt: parsed.occurredAt,
      outcome: initialOutcome,
      outcomeDetail: initialDetail,
      parserVersion: parsed.parserVersion,
      processedAt: initialOutcome === 'review' ? null : new Date(),
    })
    .onConflictDoNothing()
    .returning();
  if (!inserted) return { ok: true as const, duplicate: true as const, outcome: 'duplicate' };

  if (
    inserted.outcome !== 'review' ||
    inserted.authentication !== 'verified' ||
    inserted.completion !== 'received' ||
    inserted.amountCents === null ||
    !inserted.orderNumber
  )
    return { ok: true as const, duplicate: false as const, outcome: inserted.outcome };

  const detail = await getOrderByNumber(inserted.orderNumber);
  if (!detail) {
    await getDb()
      .update(zelleReceipts)
      .set({ outcomeDetail: 'The memo names an order that does not exist.' })
      .where(eq(zelleReceipts.id, inserted.id));
    return { ok: true as const, duplicate: false as const, outcome: 'review' };
  }
  await getDb()
    .update(zelleReceipts)
    .set({ orderId: detail.order.id })
    .where(eq(zelleReceipts.id, inserted.id));
  const exact =
    detail.order.paymentMethod === 'zelle' &&
    detail.order.paymentRef === detail.order.orderNumber &&
    detail.order.totalCents === inserted.amountCents &&
    detail.order.currency === inserted.currency;
  if (!exact) {
    await getDb()
      .update(zelleReceipts)
      .set({ outcomeDetail: 'The order payment method, reference, amount, or currency does not match.' })
      .where(eq(zelleReceipts.id, inserted.id));
    return { ok: true as const, duplicate: false as const, outcome: 'review' };
  }

  if (zelleMode() === 'automatic') {
    const settlement = await settleZelleReceipt(
      inserted.id,
      inserted.orderNumber,
      'Chase notification via Gmail',
      true,
    );
    return {
      ok: settlement.ok,
      duplicate: false as const,
      outcome: settlement.ok ? settlement.note : 'review',
    };
  }
  const detailText =
    zelleMode() === 'shadow'
      ? 'Shadow match passed every automatic rule; no order change was made.'
      : 'Exact match is ready for staff approval.';
  await getDb()
    .update(zelleReceipts)
    .set({ outcomeDetail: detailText })
    .where(eq(zelleReceipts.id, inserted.id));
  return { ok: true as const, duplicate: false as const, outcome: 'review' };
}
