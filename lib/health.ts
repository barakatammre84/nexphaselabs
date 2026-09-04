import { getTableColumns, getTableName, is, Table } from 'drizzle-orm';
import * as schema from '@/db/schema';

// Probe the actual schema, including every column, without reading business rows.
// A SELECT 1 succeeds against an empty database and cannot prove deploy readiness.
const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;
export const SCHEMA_PROBES = Object.values(schema)
  .filter((value) => is(value, Table))
  .map((table) => {
    const name = quote(getTableName(table));
    const columns = Object.values(getTableColumns(table)).map((column) => `${name}.${quote(column.name)}`);
    return `SELECT ${columns.join(', ')} FROM ${name} LIMIT 0`;
  });

export async function checkDependencies(bindings: {
  DB?: Pick<D1Database, 'prepare' | 'batch'>;
  DOCS?: Pick<R2Bucket, 'head'>;
}) {
  const [db, docs] = await Promise.all([
    (async () => {
      try {
        if (!bindings.DB || SCHEMA_PROBES.length === 0) return 'unavailable' as const;
        const results = await bindings.DB.batch(SCHEMA_PROBES.map((query) => bindings.DB!.prepare(query)));
        return results.length === SCHEMA_PROBES.length && results.every((result) => result.success)
          ? 'ok' as const : 'unavailable' as const;
      } catch { return 'unavailable' as const; }
    })(),
    (async () => {
      try {
        if (!bindings.DOCS) return 'unavailable' as const;
        // A missing object is expected; a successful HEAD proves bucket access.
        await bindings.DOCS.head('_health/readiness-probe');
        return 'ok' as const;
      } catch { return 'unavailable' as const; }
    })(),
  ]);
  return { ok: db === 'ok' && docs === 'ok', db, docs };
}
