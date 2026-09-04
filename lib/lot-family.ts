import { sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { lots, type Lot } from '@/db/schema';

/**
 * Record versions of one lot. A correction inserts a new row and points the
 * old one at it through superseded_by_id; tests, documents, movements and
 * events stay on the version they were written against. Readers on both the
 * staff and the public side gather the family from the current id. This
 * module is deliberately free of any admin capability so the public lookup
 * can import it without pulling in the admin module.
 */

/** Ids of every version, current first. */
export async function lotFamilyIds(currentId: string): Promise<string[]> {
  const db = getDb();
  const rows = await db.all<{ id: string }>(sql`
    WITH RECURSIVE fam(id) AS (
      SELECT ${currentId}
      UNION
      SELECT l.id FROM lots l JOIN fam ON l.superseded_by_id = fam.id
    )
    SELECT id FROM fam ORDER BY CASE WHEN id = ${currentId} THEN 0 ELSE 1 END, id
  `);
  return rows.map((r) => r.id);
}

/** Every version, oldest first, for the audit trail. */
export async function lotVersions(currentId: string): Promise<Lot[]> {
  const ids = await lotFamilyIds(currentId);
  if (ids.length === 0) return [];
  const db = getDb();
  const rows = await db.select().from(lots).where(sql`${lots.id} IN ${ids}`);
  return rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}
