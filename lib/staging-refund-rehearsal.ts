import { and, eq, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import {
  notificationEvents,
  notifications,
  orderEvents,
  orderItems,
  orders,
} from '@/db/schema';
import { orderRefundReferences } from '@/db/commerce-schema';
import { getOrderByNumber, recordRefund } from '@/lib/orders';

const TOTAL_CENTS = 900;

type Check = {
  name: string;
  ok: boolean;
  detail: string;
};

export type StagingRefundRehearsalReport = {
  ok: boolean;
  release: string;
  fixture: 'synthetic-staging-refund';
  paymentProviderContacted: false;
  moneySent: false;
  checks: Check[];
  totals: {
    buyerTotalCents: number;
    staffRefundTotalCents: number;
    refundReferences: number;
    refundEvents: number;
  };
};

function fixtureId(): string {
  return `staging_refund_${crypto.randomUUID().replace(/-/g, '')}`;
}

function fixtureOrderNumber(): string {
  const date = new Date();
  const yy = String(date.getUTCFullYear()).slice(-2);
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const suffix = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
  return `NX-${yy}${mm}${dd}-9${suffix}`;
}

function check(
  checks: Check[],
  name: string,
  ok: boolean,
  detail: string,
): void {
  checks.push({ name, ok, detail });
}

async function createFixture() {
  const db = getDb();
  const id = fixtureId();
  const orderNumber = fixtureOrderNumber();
  const now = new Date();

  await db.insert(orders).values({
    id,
    orderNumber,
    accountId: `${id}_buyer`,
    contactEmail: 'staging-refund-rehearsal@example.invalid',
    channel: 'guest_checkout',
    status: 'cancelled',
    currency: 'USD',
    subtotalCents: TOTAL_CENTS,
    shippingCents: 0,
    taxCents: 0,
    discountCents: 0,
    totalCents: TOTAL_CENTS,
    priceTier: 'researcher',
    consigneeName: 'Synthetic staging refund rehearsal',
    shipToLine1: '1 Synthetic Way',
    shipToCity: 'Test',
    shipToRegion: 'CA',
    shipToPostalCode: '00000',
    shipToCountry: 'US',
    paymentMethod: 'bank_transfer',
    paymentRef: 'STAGING-SYNTHETIC-NO-PROVIDER',
    paymentStatus: 'refund_due',
    refundDueCents: TOTAL_CENTS,
    refundCents: 0,
    submittedAt: now,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(orderItems).values({
    id: `${id}_item`,
    orderId: id,
    productId: `${id}_product`,
    productCode: 'STAGING-SYNTHETIC',
    productName: 'Synthetic staging refund rehearsal',
    variantId: `${id}_variant`,
    sku: 'STAGING-SYNTHETIC-REFUND',
    packSize: '1 unit',
    presentation: 'synthetic',
    quantity: 1,
    unitPriceCents: TOTAL_CENTS,
    lineTotalCents: TOTAL_CENTS,
    createdAt: now,
  });
  return { id, orderNumber };
}

async function removeFixture(orderId: string, orderNumber: string): Promise<void> {
  const db = getDb();
  await db.batch([
    db.delete(notificationEvents).where(
      sql`${notificationEvents.notificationId} IN (SELECT ${notifications.id} FROM ${notifications} WHERE ${notifications.orderNumber} = ${orderNumber})`,
    ),
    db.delete(notifications).where(eq(notifications.orderNumber, orderNumber)),
    db.delete(orderRefundReferences).where(eq(orderRefundReferences.orderId, orderId)),
    db.delete(orderEvents).where(eq(orderEvents.orderId, orderId)),
    db.delete(orderItems).where(eq(orderItems.orderId, orderId)),
    db.delete(orders).where(eq(orders.id, orderId)),
  ]);
}

async function refund(
  orderNumber: string,
  amountCents: number,
  reference: string,
) {
  const detail = await getOrderByNumber(orderNumber);
  if (!detail) throw new Error('Synthetic staging refund order disappeared.');
  return recordRefund(detail, amountCents, reference, 'staging-refund-rehearsal');
}

export async function runStagingRefundRehearsal(
  release: string,
): Promise<StagingRefundRehearsalReport> {
  const checks: Check[] = [];
  let fixture: Awaited<ReturnType<typeof createFixture>> | null = null;
  try {
    fixture = await createFixture();
    const initial = await getOrderByNumber(fixture.orderNumber);
    if (!initial) throw new Error('Synthetic staging refund order was not readable.');
    const buyerTotalCents = initial.order.totalCents;

    const immediate = await refund(fixture.orderNumber, 100, 'STAGING-IMMEDIATE');
    check(checks, 'immediate refund', immediate.ok, immediate.ok ? 'accepted' : immediate.error);

    const immediateRetry = await refund(fixture.orderNumber, 100, 'STAGING-IMMEDIATE');
    check(checks, 'immediate same-reference retry', !immediateRetry.ok, immediateRetry.ok ? 'unexpectedly recorded twice' : immediateRetry.error);

    const immediateMismatch = await refund(fixture.orderNumber, 50, 'STAGING-IMMEDIATE');
    check(checks, 'mismatched same-reference retry', !immediateMismatch.ok, immediateMismatch.ok ? 'unexpectedly accepted a different amount' : immediateMismatch.error);

    const topUp = await refund(fixture.orderNumber, 200, 'STAGING-TOP-UP');
    check(checks, 'refund top-up', topUp.ok, topUp.ok ? 'accepted' : topUp.error);

    const stale = await getOrderByNumber(fixture.orderNumber);
    if (!stale) throw new Error('Synthetic staging refund order disappeared before race.');
    const [raceA, raceB] = await Promise.all([
      recordRefund(stale, 300, 'STAGING-RACE-A', 'staging-refund-rehearsal'),
      recordRefund(stale, 300, 'STAGING-RACE-B', 'staging-refund-rehearsal'),
    ]);
    const oneRaceWinner = Number(raceA.ok) + Number(raceB.ok) === 1;
    check(
      checks,
      'distinct-reference race has one winner',
      oneRaceWinner,
      `race outcomes: ${raceA.ok ? 'accepted' : 'rejected'}, ${raceB.ok ? 'accepted' : 'rejected'}`,
    );

    const afterRace = await getOrderByNumber(fixture.orderNumber);
    if (!afterRace) throw new Error('Synthetic staging refund order disappeared after race.');
    const remainingCents = TOTAL_CENTS - (afterRace.order.refundCents ?? 0);
    const completion = await refund(fixture.orderNumber, remainingCents, 'STAGING-COMPLETE');
    check(checks, 'completion refund', completion.ok, completion.ok ? 'accepted' : completion.error);

    const completionRetry = await refund(fixture.orderNumber, remainingCents, 'STAGING-COMPLETE');
    check(checks, 'completed same-reference retry', !completionRetry.ok, completionRetry.ok ? 'unexpectedly recorded after completion' : completionRetry.error);

    const final = await getOrderByNumber(fixture.orderNumber);
    if (!final) throw new Error('Synthetic staging refund order disappeared before totals check.');
    const references = await getDb()
      .select({ count: sql<number>`count(*)` })
      .from(orderRefundReferences)
      .where(eq(orderRefundReferences.orderId, fixture.id));
    const events = await getDb()
      .select({ count: sql<number>`count(*)` })
      .from(orderEvents)
      .where(eq(orderEvents.orderId, fixture.id));
    const staffRefundTotalCents = final.order.refundCents ?? 0;
    const referenceCount = Number(references[0]?.count ?? 0);
    const eventCount = Number(events[0]?.count ?? 0);
    check(
      checks,
      'buyer total unchanged and staff total recorded once',
      final.order.totalCents === buyerTotalCents &&
        buyerTotalCents === TOTAL_CENTS &&
        staffRefundTotalCents === TOTAL_CENTS &&
        referenceCount === 4 &&
        eventCount === 4,
      `buyer total ${final.order.totalCents}; staff refund total ${staffRefundTotalCents}; references ${referenceCount}; events ${eventCount}`,
    );

    return {
      ok: checks.every((entry) => entry.ok),
      release,
      fixture: 'synthetic-staging-refund',
      paymentProviderContacted: false,
      moneySent: false,
      checks,
      totals: {
        buyerTotalCents: final.order.totalCents,
        staffRefundTotalCents,
        refundReferences: referenceCount,
        refundEvents: eventCount,
      },
    };
  } finally {
    if (fixture) await removeFixture(fixture.id, fixture.orderNumber);
  }
}