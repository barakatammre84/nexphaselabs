import { getTableColumns, is, SQL, sql } from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import { getDb } from '@/db';

/** Guarded INSERT SELECT, preserving each target column's driver encoding and defaults. */
export function conditionalInsert<T extends SQLiteTable>(table: T, values: T['$inferInsert'], source: SQLiteTable, guard: SQL) {
  const db = getDb();
  const columns = getTableColumns(table);
  const projection = Object.fromEntries(Object.entries(columns).map(([key, column]) => {
    let value: unknown = (values as Record<string, unknown>)[key];
    if (value === undefined) {
      if (is(column.default, SQL)) return [key, column.default.as(column.name)];
      if (column.default !== undefined) value = column.default;
      else if (column.notNull) throw new Error(`Missing required field: ${column.name}`);
      else value = null;
    }
    const encoded = value === null ? null : column.mapToDriverValue(value);
    return [key, sql`${encoded}`.as(column.name)];
  })) as unknown as typeof columns;
  return db.insert(table).select(db.select(projection).from(source).where(guard) as never);
}
