import { env } from 'cloudflare:workers';
import { sql } from 'drizzle-orm';
import { getDb } from '@/db';

/**
 * Deployment smoke check. Says whether the worker is up and whether its
 * database answers; nothing else. No caching, no secrets, no data.
 */
export async function GET() {
  let db: 'ok' | 'unavailable' = 'unavailable';
  try {
    await getDb().get(sql`SELECT 1`);
    db = 'ok';
  } catch {
    db = 'unavailable';
  }
  return Response.json(
    { ok: db === 'ok', env: env.APP_ENV ?? 'unknown', db, at: new Date().toISOString() },
    { status: db === 'ok' ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
