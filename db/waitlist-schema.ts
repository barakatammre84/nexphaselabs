import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

/**
 * Back-in-stock requests (owner, 16 Sep 2026; ionpeptide.com's WooCommerce Waitlist as
 * the reference). One row per account and pack size. `status` moves waiting → notified
 * when a released lot can supply the pack size, and back to waiting only if the customer
 * asks again; cancelled rows are kept so the request history stays attributable.
 * The notification itself is an ordinary outbox row (lib/waitlist.ts).
 */
export const stockWaitlist = sqliteTable(
  'stock_waitlist',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    productCode: text('product_code').notNull(),
    sku: text('sku').notNull(),
    status: text('status').notNull().default('waiting'),
    notifyCount: integer('notify_count').notNull().default(0),
    notifiedAt: integer('notified_at', { mode: 'timestamp' }),
    lastNotificationId: text('last_notification_id'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    uniqueIndex('stock_waitlist_account_sku_idx').on(table.accountId, table.sku),
    index('stock_waitlist_product_status_idx').on(table.productCode, table.status),
  ],
);

export type StockWaitlistRow = typeof stockWaitlist.$inferSelect;
