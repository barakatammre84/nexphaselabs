import { sql } from 'drizzle-orm';
import { getDb } from '@/db';

const CLEANUP_LIMIT = 500;

/**
 * Remove short-lived quote records in bounded batches. Fulfillment quotes that
 * back a purchased/attention label remain as the immutable carrier audit trail.
 */
export async function cleanupExpiredCommerceRecords(now = new Date()) {
  const seconds = Math.floor(now.getTime() / 1000);
  const db = getDb();
  const checkout = await db.run(sql`DELETE FROM checkout_quotes
      WHERE id IN (
        SELECT id FROM checkout_quotes
        WHERE expires_at <= ${seconds}
        ORDER BY expires_at
        LIMIT ${CLEANUP_LIMIT}
      )`);
  const fulfillment = await db.run(sql`DELETE FROM fulfillment_quotes
      WHERE id IN (
        SELECT q.id FROM fulfillment_quotes q
        WHERE q.expires_at <= ${seconds}
          AND NOT EXISTS (SELECT 1 FROM shipping_labels l WHERE l.quote_id = q.id)
        ORDER BY q.expires_at
        LIMIT ${CLEANUP_LIMIT}
      )`);
  return {
    checkoutQuotes: checkout.meta.changes,
    fulfillmentQuotes: fulfillment.meta.changes,
  };
}
