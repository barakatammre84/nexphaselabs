import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { notificationEvents, notifications } from '@/db/notifications-schema';
import {
  deliverNotification,
  notificationConfigurationError,
  notificationEnvelope,
  type NotificationEnvelope,
} from '@/lib/notification-delivery';
import { publicOrigin } from '@/lib/site-config';
import { ENTITY_FOOTER } from '@/lib/entity';

const LEASE_SECONDS = 120;
export const MAX_NOTIFICATION_ATTEMPTS = 8;
// The alternative Resend adapter retains keys for 24h. Keep the common queue
// inside that window; Gmail ambiguous sends are marked attention immediately.
export const RETRY_WINDOW_SECONDS = 23 * 3600;
const id = () => crypto.randomUUID();

export async function dispatchNotifications(limit = 5, now = new Date()) {
  const db = getDb();
  const seconds = Math.floor(now.getTime() / 1000);
  const due = sql`((${notifications.status} IN ('pending', 'retry') AND ${notifications.nextAttemptAt} <= ${seconds}) OR (${notifications.status} = 'sending' AND ${notifications.leaseUntil} <= ${seconds}))`;
  const rows = await db
    .select()
    .from(notifications)
    .where(due)
    .orderBy(asc(notifications.createdAt))
    .limit(Math.max(1, Math.min(5, limit)));
  const summary = { accepted: 0, retrying: 0, attention: 0, skipped: 0 };
  for (let row of rows) {
    const lease = id();
    const [claimed] = await db
      .update(notifications)
      .set({
        status: 'sending',
        leaseId: lease,
        leaseUntil: new Date((seconds + LEASE_SECONDS) * 1000),
      })
      .where(and(eq(notifications.id, row.id), due))
      .returning();
    if (!claimed) {
      summary.skipped++;
      continue;
    }
    row = claimed;
    const owned = and(
      eq(notifications.id, row.id),
      eq(notifications.leaseId, lease),
    );
    const stop = async (detail: string) => {
      await db.batch([
        db
          .update(notifications)
          .set({ status: 'attention', leaseUntil: null, lastError: detail })
          .where(owned),
        db.insert(notificationEvents).select(
          db
            .select({
              id: sql<string>`${id()}`.as('id'),
              notificationId: notifications.id,
              action: sql<string>`'attention'`.as('action'),
              actor: sql<string>`'system'`.as('actor'),
              detail: sql<string>`${detail}`.as('detail'),
              createdAt: sql<number>`${seconds}`.as('created_at'),
            })
            .from(notifications)
            .where(owned),
        ),
      ]);
      summary.attention++;
    };
    const configIssue = notificationConfigurationError(row.recipient);
    const tooLate =
      row.firstAttemptAt !== null &&
      seconds - Math.floor(row.firstAttemptAt.getTime() / 1000) >=
        RETRY_WINDOW_SECONDS;
    if (configIssue || tooLate || row.attempts >= MAX_NOTIFICATION_ATTEMPTS) {
      await stop(
        configIssue ??
          'Automatic retries stopped. Verify provider history before contacting the customer; resending may duplicate delivery.',
      );
      continue;
    }
    let envelope: NotificationEnvelope;
    try {
      const actionUrl = row.actionPath
        ? `${publicOrigin()}${row.actionPath}`
        : `${publicOrigin()}/account/orders/${encodeURIComponent(row.orderNumber)}`;
      const actionLabel =
        row.category === 'feedback' ? 'Feedback record' : 'Order details';
      envelope = row.envelope
        ? JSON.parse(row.envelope)
        : notificationEnvelope(
            row.recipient,
            row.subject,
            `${row.body}\n\n${actionLabel}: ${actionUrl}\n\n${ENTITY_FOOTER}`,
          );
      if (
        !envelope ||
        !Array.isArray(envelope.to) ||
        envelope.to.length !== 1 ||
        envelope.to[0] !== row.recipient ||
        typeof envelope.from !== 'string' ||
        typeof envelope.subject !== 'string' ||
        typeof envelope.text !== 'string'
      )
        throw new Error('Invalid envelope');
    } catch {
      await stop(
        'Stored message payload is invalid. Inspect this record before contacting the customer.',
      );
      continue;
    }
    const attempt = row.attempts + 1;
    await db
      .update(notifications)
      .set({
        envelope: JSON.stringify(envelope),
        attempts: attempt,
        firstAttemptAt: row.firstAttemptAt ?? now,
      })
      .where(owned);
    const result = await deliverNotification(envelope, row.id);
    const status = result.ok
      ? 'accepted'
      : result.retryable && attempt < MAX_NOTIFICATION_ATTEMPTS
        ? 'retry'
        : 'attention';
    const detail = result.ok
      ? `Provider accepted: ${result.providerId}. Inbox delivery is not confirmed.`
      : result.error;
    await db.batch([
      db
        .update(notifications)
        .set({
          status,
          leaseUntil: null,
          acceptedAt: result.ok ? now : null,
          providerId: result.ok ? result.providerId : null,
          lastError: result.ok ? null : result.error,
          nextAttemptAt: new Date((seconds + 60 * 2 ** (attempt - 1)) * 1000),
        })
        .where(owned),
      db.insert(notificationEvents).select(
        db
          .select({
            id: sql<string>`${id()}`.as('id'),
            notificationId: notifications.id,
            action: sql<string>`${status}`.as('action'),
            actor: sql<string>`'system'`.as('actor'),
            detail: sql<string>`${detail}`.as('detail'),
            createdAt: sql<number>`${seconds}`.as('created_at'),
          })
          .from(notifications)
          .where(owned),
      ),
    ]);
    if (status === 'accepted') summary.accepted++;
    else if (status === 'retry') summary.retrying++;
    else summary.attention++;
  }
  return summary;
}

export async function listNotifications(status: string | undefined) {
  const db = getDb();
  const allowed = [
    'pending',
    'retry',
    'sending',
    'attention',
    'accepted',
    'resolved',
  ];
  return db
    .select()
    .from(notifications)
    .where(
      status && allowed.includes(status)
        ? eq(notifications.status, status)
        : undefined,
    )
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(100);
}

export async function notificationCounts() {
  const rows = await getDb()
    .select({
      status: notifications.status,
      count: sql<number>`count(*)`.mapWith(Number),
    })
    .from(notifications)
    .groupBy(notifications.status);
  return Object.fromEntries(rows.map((row) => [row.status, row.count]));
}

/** Manual handling is attributed. An accepted notification is never re-sent. */
export async function handleNotification(
  notificationId: string,
  action: 'retry' | 'resolve',
  actor: string,
  note: string,
  now = new Date(),
): Promise<boolean> {
  const db = getDb();
  if (!note.trim() || note.length > 500) return false;
  const seconds = Math.floor(now.getTime() / 1000);
  const marker = id();
  const [changed] = await db.batch([
    db
      .update(notifications)
      .set({
        status: action === 'retry' ? 'retry' : 'resolved',
        nextAttemptAt: now,
        leaseId: marker,
        leaseUntil: null,
      })
      .where(
        and(
          eq(notifications.id, notificationId),
          eq(notifications.status, 'attention'),
          action === 'retry'
            ? sql`${notifications.attempts} < ${MAX_NOTIFICATION_ATTEMPTS} AND (${notifications.firstAttemptAt} IS NULL OR ${notifications.firstAttemptAt} > ${seconds - RETRY_WINDOW_SECONDS})`
            : sql`1 = 1`,
        ),
      )
      .returning({ id: notifications.id }),
    db.insert(notificationEvents).select(
      db
        .select({
          id: sql<string>`${id()}`.as('id'),
          notificationId: notifications.id,
          action: sql<string>`${action}`.as('action'),
          actor: sql<string>`${actor}`.as('actor'),
          detail: sql<string>`${note.trim()}`.as('detail'),
          createdAt: sql<number>`${seconds}`.as('created_at'),
        })
        .from(notifications)
        .where(
          and(
            eq(notifications.id, notificationId),
            eq(notifications.leaseId, marker),
          ),
        ),
    ),
  ]);
  return changed.length > 0;
}
