import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

/** Permanent customer-feedback record. WebSockets only announce changes; D1 is canonical. */
export const feedbackConversations = sqliteTable(
  'feedback_conversations',
  {
    id: text('id').primaryKey(),
    publicId: text('public_id').notNull(),
    visitorTokenHash: text('visitor_token_hash').notNull(),
    visitorName: text('visitor_name'),
    visitorEmail: text('visitor_email'),
    subject: text('subject'),
    kind: text('kind').notNull().default('comment'),
    severity: text('severity').notNull().default('suggestion'),
    expectedBehavior: text('expected_behavior'),
    browserContext: text('browser_context'),
    status: text('status').notNull().default('new'),
    priority: text('priority').notNull().default('normal'),
    labels: text('labels').notNull().default('[]'),
    resolutionSummary: text('resolution_summary'),
    issueUrl: text('issue_url'),
    sourcePath: text('source_path').notNull(),
    assignedTo: text('assigned_to'),
    unreadForStaff: integer('unread_for_staff').notNull().default(0),
    unreadForVisitor: integer('unread_for_visitor').notNull().default(0),
    lastSender: text('last_sender').notNull().default('visitor'),
    lastMessageAt: integer('last_message_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [
    uniqueIndex('feedback_conversations_public_id_idx').on(table.publicId),
    index('feedback_conversations_token_idx').on(table.visitorTokenHash),
    index('feedback_conversations_queue_idx').on(
      table.status,
      table.lastMessageAt,
    ),
    check(
      'feedback_conversations_status_check',
      sql`${table.status} IN ('new','open','waiting_customer','closed')`,
    ),
    check(
      'feedback_conversations_kind_check',
      sql`${table.kind} IN ('bug','improvement','comment')`,
    ),
    check(
      'feedback_conversations_severity_check',
      sql`${table.severity} IN ('blocking','major','minor','suggestion')`,
    ),
    check(
      'feedback_conversations_priority_check',
      sql`${table.priority} IN ('urgent','high','normal','low')`,
    ),
    check(
      'feedback_conversations_last_sender_check',
      sql`${table.lastSender} IN ('visitor','staff')`,
    ),
    check(
      'feedback_conversations_unread_check',
      sql`${table.unreadForStaff} >= 0 AND ${table.unreadForVisitor} >= 0`,
    ),
  ],
);

/** Append-only transcript. Messages are never edited in place or silently deleted. */
export const feedbackMessages = sqliteTable(
  'feedback_messages',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => feedbackConversations.id),
    sender: text('sender').notNull(),
    body: text('body').notNull(),
    reportTitle: text('report_title'),
    reportKind: text('report_kind'),
    reportSeverity: text('report_severity'),
    expectedBehavior: text('expected_behavior'),
    browserContext: text('browser_context'),
    screenshotKey: text('screenshot_key'),
    screenshotMime: text('screenshot_mime'),
    screenshotSize: integer('screenshot_size'),
    staffId: text('staff_id'),
    staffName: text('staff_name'),
    sourcePath: text('source_path'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [
    index('feedback_messages_conversation_idx').on(
      table.conversationId,
      table.createdAt,
    ),
    check(
      'feedback_messages_sender_check',
      sql`${table.sender} IN ('visitor','staff')`,
    ),
    check(
      'feedback_messages_body_check',
      sql`length(${table.body}) BETWEEN 1 AND 2000`,
    ),
    check(
      'feedback_messages_kind_check',
      sql`${table.reportKind} IS NULL OR ${table.reportKind} IN ('bug','improvement','comment')`,
    ),
    check(
      'feedback_messages_severity_check',
      sql`${table.reportSeverity} IS NULL OR ${table.reportSeverity} IN ('blocking','major','minor','suggestion')`,
    ),
  ],
);

/** Attributed workflow history separate from the customer-visible transcript. */
export const feedbackEvents = sqliteTable(
  'feedback_events',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => feedbackConversations.id),
    action: text('action').notNull(),
    actor: text('actor').notNull(),
    detail: text('detail'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [
    index('feedback_events_conversation_idx').on(
      table.conversationId,
      table.createdAt,
    ),
  ],
);

/** Staff-only notes keep investigation details out of the visitor transcript. */
export const feedbackNotes = sqliteTable(
  'feedback_notes',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => feedbackConversations.id),
    staffId: text('staff_id').notNull(),
    staffName: text('staff_name').notNull(),
    body: text('body').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [
    index('feedback_notes_conversation_idx').on(
      table.conversationId,
      table.createdAt,
    ),
    check(
      'feedback_notes_body_check',
      sql`length(${table.body}) BETWEEN 1 AND 2000`,
    ),
  ],
);

export type FeedbackConversation = typeof feedbackConversations.$inferSelect;
export type FeedbackMessage = typeof feedbackMessages.$inferSelect;
export type FeedbackNote = typeof feedbackNotes.$inferSelect;
