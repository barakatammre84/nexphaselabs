import { sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { windowStart } from '@/lib/rate-limit-core';

export { clientAddress, rateLimitKey, windowStart } from '@/lib/rate-limit-core';

/**
 * Fixed-window rate limit backed by D1. `allow` is one atomic upsert: the row
 * is created or, if its window is current, incremented; a stale window resets
 * to 1. Returns whether this call is within the limit.
 *
 * Callers decide what to do when it is not — for the password-reset endpoint
 * that is "respond exactly as if it had worked, but send nothing", so the
 * limiter itself never becomes an oracle.
 */
export async function allow(key: string, limit: number, windowSeconds: number, now = new Date()): Promise<boolean> {
  const db = getDb();
  const start = windowStart(now.getTime(), windowSeconds);
  const rows = await db.all<{ count: number }>(sql`
    INSERT INTO rate_limits (key, window_start, count) VALUES (${key}, ${start}, 1)
    ON CONFLICT(key) DO UPDATE SET
      count = CASE WHEN rate_limits.window_start = ${start} THEN rate_limits.count + 1 ELSE 1 END,
      window_start = ${start}
    RETURNING count
  `);
  const count = Number(rows[0]?.count ?? 1);
  return count <= limit;
}

/** How many times `key` has counted in the current window, without counting this look. */
export async function currentCount(key: string, windowSeconds: number, now = new Date()): Promise<number> {
  const start = windowStart(now.getTime(), windowSeconds);
  const rows = await getDb().all<{ count: number }>(sql`
    SELECT count FROM rate_limits WHERE key = ${key} AND window_start = ${start}
  `);
  return Number(rows[0]?.count ?? 0);
}

