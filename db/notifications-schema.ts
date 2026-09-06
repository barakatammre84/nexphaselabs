import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/** Durable transactional notices. Auth tokens never enter this table. */
export const notifications = sqliteTable(
  'notifications',
  {
    id: text('id').primaryKey(),
    orderNumber: text('order_number').notNull(),
    category: text('category').notNull().default('order'),
    actionPath: text('action_path'),
    recipient: text('recipient').notNull(),
    subject: text('subject').notNull(),
    body: text('body').notNull(),
    /** Immutable provider payload, frozen on first actual attempt. */
    envelope: text('envelope'),
    status: text('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: integer('next_attempt_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    firstAttemptAt: integer('first_attempt_at', { mode: 'timestamp' }),
    leaseId: text('lease_id'),
    leaseUntil: integer('lease_until', { mode: 'timestamp' }),
    acceptedAt: integer('accepted_at', { mode: 'timestamp' }),
    providerId: text('provider_id'),
    lastError: text('last_error'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    dueIdx: index('notifications_due_idx').on(
      table.status,
      table.nextAttemptAt,
    ),
  }),
);

export const notificationEvents = sqliteTable(
  'notification_events',
  {
    id: text('id').primaryKey(),
    notificationId: text('notification_id').notNull(),
    action: text('action').notNull(),
    actor: text('actor').notNull(),
    detail: text('detail'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    notificationIdx: index('notification_events_notification_idx').on(
      table.notificationId,
    ),
  }),
);

export type Notification = typeof notifications.$inferSelect;
