import { and, asc, eq, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import {
  chemicalClassRevisions,
  chemicalClasses,
  products,
  type ChemicalClassRow,
} from '@/db/schema';
import { isNotNull } from 'drizzle-orm';
import type { StaffPrincipal } from '@/lib/staff-auth';

export type { ChemicalClassRow };
export type ClassValue = {
  id: string;
  name: string;
  blurb: string;
  sortOrder: number;
  active: boolean;
};
export type ClassWriteResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

function revisionId(): string {
  return `crv_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
}

/** Classes shown on the public site and offered in the product form. */
export async function listActiveClasses(): Promise<ChemicalClassRow[]> {
  const db = getDb();
  return db
    .select()
    .from(chemicalClasses)
    .where(eq(chemicalClasses.active, true))
    .orderBy(asc(chemicalClasses.sortOrder), asc(chemicalClasses.name));
}

/** Every class, for the manager. */
export async function listAllClasses(): Promise<
  (ChemicalClassRow & { productCount: number; publishedCount: number })[]
> {
  const db = getDb();
  const rows = await db
    .select({
      cls: chemicalClasses,
      // Qualified by hand: drizzle drops table qualifiers in a single-table select, which would
      // turn this into products.chemical_class = products.name.
      productCount:
        sql<number>`(SELECT count(*) FROM products p WHERE p.chemical_class = chemical_classes.name)`
          .mapWith(Number)
          .as('product_count'),
      publishedCount:
        sql<number>`(SELECT count(*) FROM products p WHERE p.chemical_class = chemical_classes.name AND p.visibility = 'published')`
          .mapWith(Number)
          .as('published_count'),
    })
    .from(chemicalClasses)
    .orderBy(asc(chemicalClasses.sortOrder), asc(chemicalClasses.name));
  return rows.map((r) => ({
    ...r.cls,
    productCount: Number(r.productCount),
    publishedCount: Number(r.publishedCount),
  }));
}

/**
 * Class names carried by products that match no class row (a rename that
 * raced a product save, or a seed loaded out of order). Such products are
 * reachable by URL but absent from the public index, so the manager must show them.
 */
export async function listOrphanClassNames(): Promise<
  { name: string; productCount: number; publishedCount: number }[]
> {
  const db = getDb();
  const rows = await db
    .select({
      name: products.chemicalClass,
      productCount: sql<number>`count(*)`.mapWith(Number).as('product_count'),
      publishedCount:
        sql<number>`sum(CASE WHEN ${products.visibility} = 'published' THEN 1 ELSE 0 END)`
          .mapWith(Number)
          .as('published_count'),
    })
    .from(products)
    .where(
      and(
        isNotNull(products.chemicalClass),
        sql`${products.chemicalClass} NOT IN (SELECT name FROM chemical_classes)`,
      ),
    )
    .groupBy(products.chemicalClass);
  return rows;
}

export async function getClass(id: string): Promise<ChemicalClassRow | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(chemicalClasses)
    .where(eq(chemicalClasses.id, id))
    .limit(1);
  return row ?? null;
}

export async function listClassRevisions(id: string) {
  const db = getDb();
  return db
    .select()
    .from(chemicalClassRevisions)
    .where(eq(chemicalClassRevisions.classId, id))
    .orderBy(asc(chemicalClassRevisions.createdAt));
}

function by(staff: StaffPrincipal): string {
  return `${staff.name} (${staff.id})`;
}

export async function createClass(
  v: ClassValue,
  staff: StaffPrincipal,
  note: string | null,
): Promise<ClassWriteResult> {
  const db = getDb();
  const now = new Date();
  try {
    await db.batch([
      db
        .insert(chemicalClasses)
        .values({
          id: v.id,
          name: v.name,
          blurb: v.blurb,
          sortOrder: v.sortOrder,
          active: v.active,
          createdAt: now,
          updatedAt: now,
          updatedBy: staff.id,
        }),
      db
        .insert(chemicalClassRevisions)
        .values({
          id: revisionId(),
          classId: v.id,
          action: 'create',
          snapshot: { ...v },
          changedBy: by(staff),
          note,
          createdAt: now,
        }),
    ]);
  } catch (error) {
    if (
      /UNIQUE constraint failed/i.test(
        error instanceof Error ? error.message : String(error),
      )
    ) {
      return {
        ok: false,
        error: 'A class with that anchor or name already exists.',
      };
    }
    throw error;
  }
  return { ok: true, id: v.id };
}

/**
 * Update a class. A rename cascades to every product carrying the old name in
 * the same batch, so products and classes never disagree. Deactivation is
 * refused while any published product is in the class.
 */
export async function updateClass(
  current: ChemicalClassRow,
  v: ClassValue,
  staff: StaffPrincipal,
  note: string | null,
): Promise<ClassWriteResult> {
  if (v.id !== current.id)
    return {
      ok: false,
      error: 'The anchor cannot change; it is the public URL.',
    };
  const db = getDb();
  const now = new Date();

  if (current.active && !v.active) {
    // Deactivation is guarded inside the statement itself, so a publish that lands between a
    // check and the update cannot leave a published product in an inactive class.
    const stamp = Math.floor(now.getTime() / 1000);
    const marker = `chg_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
    let updated: { id: string }[] | undefined;
    try {
      [updated] = await db.batch([
        db
          .update(chemicalClasses)
          .set({
            name: v.name,
            blurb: v.blurb,
            sortOrder: v.sortOrder,
            active: false,
            updatedAt: now,
            updatedBy: staff.id,
            lastChangeId: marker,
          })
          .where(
            and(
              eq(chemicalClasses.id, current.id),
              eq(chemicalClasses.active, true),
              sql`NOT EXISTS (SELECT 1 FROM products WHERE chemical_class = ${current.name} AND visibility = 'published')`,
            ),
          )
          .returning({ id: chemicalClasses.id }),
        // A rename in the same save moves the products too, guarded on the update having applied.
        db
          .update(products)
          .set({ chemicalClass: v.name, updatedAt: now })
          .where(
            and(
              eq(products.chemicalClass, current.name),
              sql`EXISTS (SELECT 1 FROM chemical_classes WHERE id = ${current.id} AND last_change_id = ${marker})`,
            ),
          ),
        // Revision row exists only where this batch's own marker landed — a concurrent identical
        // change cannot reproduce it.
        db.insert(chemicalClassRevisions).select(
          db
            .select({
              id: sql<string>`${revisionId()}`.as('id'),
              classId: chemicalClasses.id,
              action: sql<string>`'deactivate'`.as('action'),
              snapshot:
                sql<string>`${JSON.stringify({ ...v, previousName: current.name })}`.as(
                  'snapshot',
                ),
              changedBy: sql<string>`${by(staff)}`.as('changed_by'),
              note: sql<string | null>`${note}`.as('note'),
              createdAt: sql<number>`${stamp}`.as('created_at'),
            })
            .from(chemicalClasses)
            .where(and(eq(chemicalClasses.id, current.id), eq(chemicalClasses.lastChangeId, marker))),
        ),
      ]);
    } catch (error) {
      if (
        /UNIQUE constraint failed/i.test(
          error instanceof Error ? error.message : String(error),
        )
      ) {
        return { ok: false, error: 'Another class already has that name.' };
      }
      throw error;
    }
    if (!updated || updated.length === 0) {
      return {
        ok: false,
        error:
          'Published products are in this class (or it changed while you were editing). Move them to another class before deactivating it.',
      };
    }
    return { ok: true, id: current.id };
  }

  const marker = `chg_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
  const action = !current.active && v.active ? 'reactivate' : 'update';
  const statements = [
    db
      .update(chemicalClasses)
      .set({
        name: v.name,
        blurb: v.blurb,
        sortOrder: v.sortOrder,
        active: v.active,
        updatedAt: now,
        lastChangeId: marker,
        updatedBy: staff.id,
      })
      .where(eq(chemicalClasses.id, current.id)),
  ] as unknown[];
  if (v.name !== current.name) {
    statements.push(
      db
        .update(products)
        .set({ chemicalClass: v.name, updatedAt: now })
        .where(eq(products.chemicalClass, current.name)),
    );
  }
  statements.push(
    db.insert(chemicalClassRevisions).values({
      id: revisionId(),
      classId: current.id,
      action,
      snapshot: { ...v, previousName: current.name },
      changedBy: by(staff),
      note,
      createdAt: now,
    }),
  );
  try {
    await db.batch(statements as unknown as Parameters<typeof db.batch>[0]);
  } catch (error) {
    if (
      /UNIQUE constraint failed/i.test(
        error instanceof Error ? error.message : String(error),
      )
    ) {
      return { ok: false, error: 'Another class already has that name.' };
    }
    throw error;
  }
  return { ok: true, id: current.id };
}
