import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Real SQLite under the D1 interface: tests execute generated SQL and atomic
 * batches, not canned query responses. Never connects to remote resources. */
export function localD1(migrate = true) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  const migrations = fileURLToPath(new URL('../../drizzle/', import.meta.url));
  if (migrate) {
    for (const file of readdirSync(migrations).filter((name) => /^\d+.*\.sql$/.test(name)).sort()) {
      sqlite.exec(readFileSync(`${migrations}/${file}`, 'utf8'));
    }
  }
  let beforeBatch: (() => void) | undefined;
  class Prepared {
    constructor(readonly query: string, readonly values: SQLInputValue[] = []) {}
    bind(...values: SQLInputValue[]) { return new Prepared(this.query, values); }
    execute() {
      const statement = sqlite.prepare(this.query);
      const results = statement.all(...this.values);
      return { success: true, results, meta: { changes: Number(sqlite.prepare('SELECT changes() AS n').get()!.n) } };
    }
    async all() { return this.execute(); }
    async run() { return this.execute(); }
    async raw() {
      const statement = sqlite.prepare(this.query);
      statement.setReturnArrays(true);
      return statement.all(...this.values);
    }
    async first(column?: string) {
      const result = this.execute().results[0];
      return result ? (column ? result[column] : result) : null;
    }
  }
  const binding = {
    prepare(query: string) { return new Prepared(query); },
    async batch(statements: Prepared[]) {
      const hook = beforeBatch;
      beforeBatch = undefined;
      hook?.();
      sqlite.exec('BEGIN');
      try {
        const results = statements.map((statement) => statement.execute());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  } as unknown as D1Database;
  return { sqlite, binding, beforeNextBatch(hook: () => void) { beforeBatch = hook; } };
}
