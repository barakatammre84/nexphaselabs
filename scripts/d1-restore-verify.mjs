import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const requested = process.argv[2];
if (!requested) {
  console.error('Usage: node scripts/d1-restore-verify.mjs <database-export.sql>');
  process.exit(2);
}
const sqlPath = resolve(requested);
const contents = readFileSync(sqlPath);
if (contents.length === 0) {
  console.error('Backup is empty.');
  process.exit(1);
}

const database = new DatabaseSync(':memory:');
try {
  database.exec(contents.toString('utf8'));
  database.exec('PRAGMA foreign_keys = ON');
  const integrity = database.prepare('PRAGMA integrity_check').all();
  const foreignKeys = database.prepare('PRAGMA foreign_key_check').all();
  const tables = database
    .prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all()
    .map((row) => String(row.name));
  const required = ['orders', 'lots', 'lot_movements', 'operational_controls', 'operational_cases'];
  const missing = required.filter((name) => !tables.includes(name));
  const ok = integrity.length === 1 && integrity[0].integrity_check === 'ok' && foreignKeys.length === 0 && missing.length === 0;
  console.log(JSON.stringify({
    ok,
    verifiedAt: new Date().toISOString(),
    sqlPath,
    bytes: contents.length,
    sha256: createHash('sha256').update(contents).digest('hex'),
    tableCount: tables.length,
    missingRequiredTables: missing,
    integrity,
    foreignKeyViolations: foreignKeys,
  }, null, 2));
  if (!ok) process.exitCode = 1;
} finally {
  database.close();
}
