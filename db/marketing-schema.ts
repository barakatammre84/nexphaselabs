import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

/**
 * Product-news consent and the abandoned-cart reminder ledger (owner, 16 Sep 2026).
 *
 * This table is the source of truth for who may receive marketing email; Brevo is only the
 * synced list and the sender. Every subscription is double opt-in whatever its source: the
 * row is `pending` until the confirmation link is opened (or, for the sign-up checkbox, until
 * the account's own email verification proves the address). `revoked` rows are kept with the
 * reason so an unsubscribe can be shown to have been honoured.
 */
export const marketingConsents = sqliteTable(
  'marketing_consents',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    accountId: text('account_id'),
    /** pending | confirmed | revoked */
    status: text('status').notNull().default('pending'),
    /** sign_up | account | footer */
    source: text('source').notNull(),
    requestedAt: integer('requested_at', { mode: 'timestamp' }).notNull(),
    consentedAt: integer('consented_at', { mode: 'timestamp' }),
    revokedAt: integer('revoked_at', { mode: 'timestamp' }),
    revokeReason: text('revoke_reason'),
    clientAddress: text('client_address'),
    userAgent: text('user_agent'),
    /** SHA-256 of the confirmation token while a request is pending; cleared on confirmation. */
    confirmTokenHash: text('confirm_token_hash'),
    /** Opaque token in every marketing email's unsubscribe link and List-Unsubscribe header. */
    unsubscribeToken: text('unsubscribe_token').notNull(),
    brevoSyncedAt: integer('brevo_synced_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    uniqueIndex('marketing_consents_email_idx').on(table.email),
    uniqueIndex('marketing_consents_unsubscribe_idx').on(table.unsubscribeToken),
    index('marketing_consents_status_idx').on(table.status),
  ],
);

export type MarketingConsentRow = typeof marketingConsents.$inferSelect;

/** One reminder per cart contents per account, ever; a changed cart is a new fingerprint. */
export const cartReminders = sqliteTable(
  'cart_reminders',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    cartFingerprint: text('cart_fingerprint').notNull(),
    recipient: text('recipient').notNull(),
    sentAt: integer('sent_at', { mode: 'timestamp' }).notNull(),
    providerId: text('provider_id'),
  },
  (table) => [uniqueIndex('cart_reminders_cart_idx').on(table.accountId, table.cartFingerprint)],
);
