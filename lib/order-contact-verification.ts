import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { orderContactVerifications, orders } from '@/db/schema';
import { notifications } from '@/db/notifications-schema';
import { randomToken, sha256Hex } from '@/lib/staff-auth-core';
import { publicOrigin } from '@/lib/site-config';

/**
 * Proving the customer's email reaches them — after the order, before it ships.
 *
 * Chapter 10 §10.6 reframes this, and the reframing is the whole point: email
 * verification here is a **recall requirement**, not an account feature. If a
 * lot has to be withdrawn, a consignee whose address was mistyped is a person
 * you cannot warn. That is what justifies the friction — and also what decides
 * where the friction goes.
 *
 *  - It is asked for **after the order is accepted**. Nothing is blocked at the
 *    point of sale. The owner's direction on guest checkout stands: no
 *    registration, no verification gate, no approval before ordering.
 *  - It is **not** a dispatch block. An unverified contact raises a warning on
 *    the fulfilment desk with a one-click resend; refusing to ship a paid order
 *    over an unclicked link is a policy decision for the members, not a default
 *    this code should impose.
 *  - Verifying changes nothing about the order except that the consignee is
 *    known to be reachable.
 */

const TTL_DAYS = 30;
const RESEND_LIMIT = 5;

const id = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;

export type VerificationState = {
  email: string | null;
  verifiedAt: Date | null;
  requestedAt: Date | null;
  sentCount: number;
  expired: boolean;
};

export function verificationPath(token: string): string {
  return `/api/orders/verify?token=${encodeURIComponent(token)}`;
}

/**
 * Issue (or re-issue) the request for one order. Returns the token only so the
 * caller can build the link; it is stored hashed and never logged.
 */
export async function requestContactVerification(
  orderId: string,
  { resend = false }: { resend?: boolean } = {},
): Promise<{ ok: true; sent: boolean } | { ok: false; error: string }> {
  const db = getDb();
  const [order] = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      email: orders.contactEmail,
      verifiedAt: orders.contactVerifiedAt,
      ruoVersion: orders.ruoVersion,
      termsVersion: orders.termsVersion,
      ageConfirmed: orders.ageConfirmed,
    })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!order) return { ok: false, error: 'Order not found.' };
  if (!order.email) return { ok: false, error: 'This order has no contact email to verify.' };
  if (order.verifiedAt) return { ok: true, sent: false };

  const now = new Date();
  const [existing] = await db
    .select()
    .from(orderContactVerifications)
    .where(
      and(
        eq(orderContactVerifications.orderId, orderId),
        eq(orderContactVerifications.email, order.email),
        isNull(orderContactVerifications.verifiedAt),
        gt(orderContactVerifications.expiresAt, now),
      ),
    )
    .limit(1);
  if (existing && !resend) return { ok: true, sent: false };
  if (existing && existing.sentCount >= RESEND_LIMIT) {
    return { ok: false, error: `This request has already been sent ${RESEND_LIMIT} times.` };
  }

  // A resend always issues a fresh token and retires the old one, so a link
  // forwarded to the wrong person stops working the moment a new one is asked for.
  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(now.getTime() + TTL_DAYS * 86_400_000);
  const statements: unknown[] = [];
  if (existing) {
    statements.push(
      db
        .update(orderContactVerifications)
        .set({
          tokenHash,
          expiresAt,
          sentCount: existing.sentCount + 1,
          lastSentAt: now,
        })
        .where(eq(orderContactVerifications.id, existing.id)),
    );
  } else {
    statements.push(
      db.insert(orderContactVerifications).values({
        id: id('ocv'),
        orderId,
        email: order.email,
        tokenHash,
        expiresAt,
        sentCount: 1,
        lastSentAt: now,
        createdAt: now,
      }),
    );
  }
  statements.push(
    db.insert(notifications).values({
      id: `verify:${id('ntf')}`,
      orderNumber: order.orderNumber,
      category: 'order',
      actionPath: verificationPath(token),
      recipient: order.email,
      subject: `Confirm your email for order ${order.orderNumber} — NexPhase Labs`,
      body: [
        `Order ${order.orderNumber} has been received.`,
        '',
        'Please confirm this address so we can reach you about the material you have ordered —',
        'including in the unlikely event that a lot you hold has to be withdrawn.',
        '',
        `${publicOrigin()}${verificationPath(token)}`,
        '',
        'Nothing is held up while you do this. The link works for 30 days.',
        '',
        ...(order.ruoVersion || order.termsVersion
          ? [
              `This order was placed under the research-use acknowledgement (version ${order.ruoVersion ?? 'n/a'})` +
                ` and terms of sale (version ${order.termsVersion ?? 'n/a'})` +
                `${order.ageConfirmed ? ', with the confirmation that the buyer is at least 21 years of age' : ''}.` +
                ' Materials are for laboratory research use only; not for human or veterinary use.',
              `Policies: ${publicOrigin()}/legal/research-use`,
            ]
          : []),
      ].join('\n'),
      status: 'pending',
      nextAttemptAt: now,
      createdAt: now,
    }),
  );
  await db.batch(statements as unknown as Parameters<typeof db.batch>[0]);
  return { ok: true, sent: true };
}

/**
 * Accept a token. Single-use, time-limited, and it only ever marks the one
 * order it was issued for — plus any other unverified order of the same account
 * carrying exactly the same address, because the person has just proved it.
 */
export async function verifyContactToken(
  token: string,
): Promise<{ ok: true; orderNumber: string } | { ok: false; reason: 'unknown' | 'expired' | 'used' }> {
  if (!/^[a-f0-9]{32,128}$/i.test(token)) return { ok: false, reason: 'unknown' };
  const db = getDb();
  const tokenHash = await sha256Hex(token);
  const [row] = await db
    .select()
    .from(orderContactVerifications)
    .where(eq(orderContactVerifications.tokenHash, tokenHash))
    .limit(1);
  if (!row) return { ok: false, reason: 'unknown' };
  const now = new Date();
  if (row.verifiedAt) {
    const [order] = await db
      .select({ orderNumber: orders.orderNumber })
      .from(orders)
      .where(eq(orders.id, row.orderId))
      .limit(1);
    return order ? { ok: true, orderNumber: order.orderNumber } : { ok: false, reason: 'used' };
  }
  if (row.expiresAt.getTime() <= now.getTime()) return { ok: false, reason: 'expired' };

  const [order] = await db
    .select({ orderNumber: orders.orderNumber, accountId: orders.accountId })
    .from(orders)
    .where(eq(orders.id, row.orderId))
    .limit(1);
  if (!order) return { ok: false, reason: 'unknown' };

  await db.batch([
    db
      .update(orderContactVerifications)
      .set({ verifiedAt: now })
      .where(and(eq(orderContactVerifications.id, row.id), isNull(orderContactVerifications.verifiedAt))),
    db
      .update(orders)
      .set({ contactVerifiedAt: now })
      .where(
        and(
          eq(orders.accountId, order.accountId),
          isNull(orders.contactVerifiedAt),
          sql`lower(${orders.contactEmail}) = lower(${row.email})`,
        ),
      ),
  ]);
  return { ok: true, orderNumber: order.orderNumber };
}

/** What the staff desk shows, and what the customer's own order page shows. */
export async function contactVerification(orderId: string): Promise<VerificationState> {
  const db = getDb();
  const [order] = await db
    .select({ email: orders.contactEmail, verifiedAt: orders.contactVerifiedAt })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  const [request] = await db
    .select()
    .from(orderContactVerifications)
    .where(eq(orderContactVerifications.orderId, orderId))
    .limit(1);
  return {
    email: order?.email ?? null,
    verifiedAt: order?.verifiedAt ?? null,
    requestedAt: request?.lastSentAt ?? request?.createdAt ?? null,
    sentCount: request?.sentCount ?? 0,
    expired: Boolean(request && !request.verifiedAt && request.expiresAt.getTime() <= Date.now()),
  };
}
