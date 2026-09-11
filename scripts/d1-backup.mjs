import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const environment = process.argv[2];
const requestedDirectory = process.argv[3];
if (!['staging', 'production'].includes(environment) || !requestedDirectory) {
  console.error('Usage: node scripts/d1-backup.mjs <staging|production> <existing-or-new-output-directory>');
  process.exit(2);
}
if (environment === 'production' && process.env.NEXPHASE_CONFIRM_PRODUCTION_BACKUP !== 'yes') {
  console.error('Production export refused. Set NEXPHASE_CONFIRM_PRODUCTION_BACKUP=yes for this read-only maintenance window.');
  process.exit(2);
}

const outputDirectory = resolve(requestedDirectory);
const forbidden = new Set(['/', resolve(process.env.HOME ?? '/nonexistent'), resolve('.')]);
if (forbidden.has(outputDirectory)) {
  console.error('Choose a dedicated backup output directory, not the filesystem, home, or repository root.');
  process.exit(2);
}
mkdirSync(outputDirectory, { recursive: true, mode: 0o700 });
const safeDirectory = realpathSync(outputDirectory);
const stamp = new Date().toISOString().replaceAll(':', '').replaceAll('.', '-');
const database = environment === 'staging' ? 'nexphase-labs-staging' : 'nexphase-labs';
const sqlPath = resolve(safeDirectory, `${database}-${stamp}.sql`);
const args = ['wrangler', 'd1', 'export', database, '--remote', '--skip-confirmation', `--output=${sqlPath}`];
if (environment === 'staging') args.push('--env', 'staging');
const result = spawnSync('npx', args, { cwd: resolve('.'), stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status ?? 1);

const bytes = readFileSync(sqlPath);
if (bytes.length === 0) {
  console.error('Export was empty; no manifest written.');
  process.exit(1);
}
const manifest = {
  format: 'nexphase-d1-backup-manifest-v1',
  environment,
  database,
  createdAt: new Date().toISOString(),
  file: sqlPath.split('/').at(-1),
  bytes: bytes.length,
  sha256: createHash('sha256').update(bytes).digest('hex'),
  restoreVerifiedAt: null,
};
const manifestPath = `${sqlPath}.manifest.json`;
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify({ ok: true, sqlPath, manifestPath, bytes: bytes.length, sha256: manifest.sha256 }, null, 2));
