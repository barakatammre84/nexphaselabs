/**
 * Create a staff user. Prints a one-time password to the terminal and writes
 * the INSERT to drizzle/seed/staff-<id>.sql for you to apply:
 *
 *   npx tsx scripts/staff-create.ts --email you@nexphaselabs.net --name "Your Name" --role admin
 *   npx wrangler d1 execute nexphase-labs --local --persist-to .wrangler/state --file drizzle/seed/staff-<id>.sql
 *   npx wrangler d1 execute nexphase-labs --remote --file drizzle/seed/staff-<id>.sql
 *
 * The SQL file contains only the hash, never the password. Delete it after
 * applying; it is git-ignored regardless.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { hashPassword } from '../lib/staff-auth-core';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const email = arg('email')?.trim().toLowerCase();
const name = arg('name')?.trim();
const role = arg('role') ?? 'ops';

if (!email || !name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error('Usage: tsx scripts/staff-create.ts --email <email> --name "<name>" [--role admin|qc|ops]');
  process.exit(1);
}
if (!['admin', 'qc', 'ops'].includes(role)) {
  console.error('Role must be admin, qc or ops.');
  process.exit(1);
}

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
const bytes = crypto.getRandomValues(new Uint8Array(20));
const password = [...bytes].map((b) => alphabet[b % alphabet.length]).join('');

const id = `stf_${[...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

const hash = await hashPassword(password);
const sql = `INSERT INTO staff_users (id, email, name, password_hash, role, active, must_change_password) VALUES (${q(id)}, ${q(email)}, ${q(name)}, ${q(hash)}, ${q(role)}, 1, 1);\n`;

mkdirSync('drizzle/seed', { recursive: true });
const file = `drizzle/seed/staff-${id}.sql`;
writeFileSync(file, sql);

console.log(`Staff user prepared: ${email} (${role})`);
console.log(`SQL written to ${file}`);
console.log('');
console.log(`One-time password (shown once, not stored):  ${password}`);
console.log('');
console.log('Apply with:');
console.log(`  npx wrangler d1 execute nexphase-labs --local --persist-to .wrangler/state --file ${file}`);
console.log(`  npx wrangler d1 execute nexphase-labs --remote --file ${file}`);
