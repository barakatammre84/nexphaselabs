import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm';
import { getDb } from '@/db';
import { accounts, lots, orderItems, orders } from '@/db/schema';
import { notifications } from '@/db/notifications-schema';

/**
 * Can this customer actually be reached?
 *
 * Chapter 10 §10.6: a lot fails a retest and the only question that matters is
 * "who received material from this lot, and how do I reach them today". A guest
 * order with a typo'd email and no phone number is a consignee you cannot
 * notify, and a recall you cannot execute is the failure mode that ends
 * companies in this category. Reachability is therefore a recall requirement,
 * not an account feature.
 *
 * Two distinctions this module refuses to blur:
 *
 *  - **Accepted is not delivered.** A provider accepting a message says the
 *    handoff worked, not that a human received it. The state is named
 *    `accepted`, never `delivered`, for the same reason the rest of this
 *    codebase refuses to record delivery from a provider response.
 *  - **Unverified is not unreachable.** An address nobody has confirmed may be
 *    perfectly good. It is `unproven`, and the difference matters: unreachable
 *    is a problem to solve now, unproven is a risk to measure.
 */

export type NoticeOutcome = 'accepted' | 'failed' | 'pending' | 'none';

export type ReachabilityFacts = {
  email: string | null;
  emailVerifiedAt: Date | null;
  phone: string | null;
  lastNotice: { status: NoticeOutcome; at: Date | null; error: string | null } | null;
};

export type ReachabilityState = 'reachable' | 'unproven' | 'unreachable';

export type Reachability = ReachabilityFacts & {
  state: ReachabilityState;
  /** A route that does not depend on mail working at all. */
  secondRoute: boolean;
  reasons: string[];
};

export function reachability(facts: ReachabilityFacts): Reachability {
  const reasons: string[] = [];
  const email = (facts.email ?? '').trim();
  const phone = (facts.phone ?? '').trim() || null;
  const notice = facts.lastNotice;

  let state: ReachabilityState;
  if (!email) {
    state = 'unreachable';
    reasons.push('No email address on the record.');
  } else if (notice?.status === 'failed') {
    state = 'unreachable';
    reasons.push(`The last notice to this address failed${notice.error ? `: ${notice.error}` : '.'}`);
  } else if (facts.emailVerifiedAt || notice?.status === 'accepted') {
    state = 'reachable';
    if (!facts.emailVerifiedAt) {
      reasons.push('Never verified, but a notice to this address was accepted by the mail provider.');
    }
  } else {
    state = 'unproven';
    reasons.push(
      notice?.status === 'pending'
        ? 'A notice is queued to this address and has not been attempted yet.'
        : 'The address has never been verified and nothing has been sent to it.',
    );
  }

  if (!phone) reasons.push('No phone number: email is the only route to this customer.');

  return {
    email: email || null,
    emailVerifiedAt: facts.emailVerifiedAt,
    phone,
    lastNotice: notice,
    state,
    secondRoute: Boolean(phone),
    reasons,
  };
}

const REACHABILITY_LABEL: Record<ReachabilityState, string> = {
  reachable: 'Reachable',
  unproven: 'Unproven',
  unreachable: 'Not reachable',
};

export const reachabilityLabel = (state: ReachabilityState) => REACHABILITY_LABEL[state];

/**
 * The last thing that actually happened to each address.
 *
 * A conclusive outcome — accepted or failed — is preferred over anything still
 * queued, however recent the queued one is. An order raises several notices at
 * once and they sit pending for seconds or minutes; "there are five messages
 * waiting to be sent" says nothing about whether the address works, while "the
 * last attempt bounced" says everything.
 */
async function lastNotices(addresses: string[]) {
  const found = new Map<string, ReachabilityFacts['lastNotice']>();
  const unique = [...new Set(addresses.map((address) => address.trim()).filter(Boolean))];
  if (unique.length === 0) return found;
  const rows = await getDb()
    .select({
      recipient: notifications.recipient,
      status: notifications.status,
      acceptedAt: notifications.acceptedAt,
      createdAt: notifications.createdAt,
      lastError: notifications.lastError,
    })
    .from(notifications)
    .where(inArray(notifications.recipient, unique))
    .orderBy(desc(notifications.createdAt))
    .limit(500);

  const outcome = (status: string): NoticeOutcome =>
    status === 'sent' || status === 'accepted'
      ? 'accepted'
      : status === 'failed' || status === 'abandoned'
        ? 'failed'
        : 'pending';

  for (const row of rows) {
    const key = row.recipient.trim().toLowerCase();
    const status = outcome(row.status);
    const existing = found.get(key);
    if (existing && (existing.status !== 'pending' || status === 'pending')) continue;
    found.set(key, { status, at: row.acceptedAt ?? row.createdAt, error: row.lastError });
  }
  return found;
}

export type Consignee = {
  orderNumber: string;
  shippedAt: Date | null;
  consigneeName: string;
  consigneeInstitution: string | null;
  destination: string;
  packs: number;
  sku: string;
  accountId: string;
  reachability: Reachability;
};

/**
 * Who received material from this lot, and how to reach them — the recall query.
 *
 * Read from the order lines stamped at dispatch, never from `lotMovements`.
 * The movement ledger is append-only and stays internal to inventory; this
 * question is answered from the orders themselves so the boundary that keeps
 * the ledger out of every other read path is not widened here. (Chapter 10
 * §10.3 draws the same line for the customer's own view.)
 */
export async function lotConsignees(lotNumber: string): Promise<Consignee[]> {
  const db = getDb();
  const rows = await db
    .select({
      orderNumber: orders.orderNumber,
      shippedAt: orders.shippedAt,
      consigneeName: orders.consigneeName,
      consigneeInstitution: orders.consigneeInstitution,
      city: orders.shipToCity,
      region: orders.shipToRegion,
      country: orders.shipToCountry,
      phone: orders.shipToPhone,
      contactEmail: orders.contactEmail,
      contactVerifiedAt: orders.contactVerifiedAt,
      accountId: orders.accountId,
      accountEmail: accounts.email,
      emailVerifiedAt: accounts.emailVerifiedAt,
      packs: orderItems.quantity,
      sku: orderItems.sku,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .leftJoin(accounts, eq(accounts.id, orders.accountId))
    .where(and(eq(orderItems.lotNumber, lotNumber), isNotNull(orders.shippedAt)))
    .orderBy(desc(orders.shippedAt));

  const notices = await lastNotices(rows.map((row) => row.contactEmail ?? row.accountEmail ?? ''));
  return rows.map((row) => {
    const email = row.contactEmail ?? row.accountEmail ?? null;
    return {
      orderNumber: row.orderNumber,
      shippedAt: row.shippedAt,
      consigneeName: row.consigneeName,
      consigneeInstitution: row.consigneeInstitution,
      destination: [row.city, row.region, row.country].filter(Boolean).join(', '),
      packs: row.packs,
      sku: row.sku,
      accountId: row.accountId,
      reachability: reachability({
        email,
        // Two ways an address can be proved, and neither is inherited: the
        // account's own verification only counts when the order used that same
        // address, and the order's own confirmation stands on its own — which is
        // how a guest contact becomes reachable without ever holding an account
        // (§10.6, §10.8).
        emailVerifiedAt:
          row.contactVerifiedAt ??
          (email && row.accountEmail && email.toLowerCase() === row.accountEmail.toLowerCase()
            ? row.emailVerifiedAt
            : null),
        phone: row.phone,
        lastNotice: notices.get((email ?? '').trim().toLowerCase()) ?? null,
      }),
    };
  });
}

/** The honest measure asked for in §10.6: of the people who hold this lot, how many could you reach today? */
export function reachabilitySummary(consignees: Consignee[]) {
  const byState = (state: ReachabilityState) =>
    consignees.filter((consignee) => consignee.reachability.state === state).length;
  return {
    total: consignees.length,
    reachable: byState('reachable'),
    unproven: byState('unproven'),
    unreachable: byState('unreachable'),
    withSecondRoute: consignees.filter((consignee) => consignee.reachability.secondRoute).length,
  };
}

/** Reachability for one account, for the staff customer view. */
export async function accountReachability(accountId: string): Promise<Reachability | null> {
  const db = getDb();
  const [account] = await db
    .select({ email: accounts.email, emailVerifiedAt: accounts.emailVerifiedAt })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);
  if (!account) return null;
  const [recent] = await db
    .select({ phone: orders.shipToPhone })
    .from(orders)
    .where(and(eq(orders.accountId, accountId), isNotNull(orders.shipToPhone)))
    .orderBy(desc(orders.submittedAt))
    .limit(1);
  const notices = await lastNotices([account.email]);
  return reachability({
    email: account.email,
    emailVerifiedAt: account.emailVerifiedAt,
    phone: recent?.phone ?? null,
    lastNotice: notices.get(account.email.trim().toLowerCase()) ?? null,
  });
}

/** Lots a recall would have to chase, newest shipment first; only one account's when `accountId` is given. */
export async function shippedLotNumbers(limit = 50, accountId?: string): Promise<string[]> {
  const rows = await getDb()
    .selectDistinct({ lotNumber: orderItems.lotNumber })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(
      and(
        isNotNull(orderItems.lotNumber),
        isNotNull(orders.shippedAt),
        accountId ? eq(orders.accountId, accountId) : undefined,
      ),
    )
    .orderBy(desc(orders.shippedAt))
    .limit(limit);
  return rows.map((row) => row.lotNumber).filter((value): value is string => Boolean(value));
}

/** Guard: a lot number that does not exist should not silently return an empty consignee list. */
export async function lotExists(lotNumber: string): Promise<boolean> {
  const rows = await getDb()
    .select({ id: lots.id })
    .from(lots)
    .where(inArray(lots.lotNumber, [lotNumber]))
    .limit(1);
  return rows.length > 0;
}
