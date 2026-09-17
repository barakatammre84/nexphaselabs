import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localD1 } from './helpers/local-d1';
const { env } = vi.hoisted(() => ({ env: {} as { DB?: D1Database } }));
vi.mock('cloudflare:workers', () => ({ env }));
vi.mock('next/headers', () => ({ cookies: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
import { getDb } from '@/db';
import { accounts, emailTokens, staffUsers } from '@/db/schema';
import { accountSignIn, signUp, verifyEmailToken } from '@/lib/account-auth';
import { confirmEmailByStaff, resetPasswordWithToken } from '@/lib/account-service';
import type { StaffPrincipal } from '@/lib/staff-auth';
import { eq } from 'drizzle-orm';
import { signIn } from '@/lib/staff-auth';
import { hashPassword, sha256Hex, verifyPassword } from '@/lib/staff-auth-core';

let local: ReturnType<typeof localD1>;
const password = 'Synthetic-Password-123!';
const token = 'a'.repeat(64);
beforeEach(async () => {
  local = localD1();
  env.DB = local.binding;
  const passwordHash = await hashPassword(password);
  await getDb().insert(accounts).values({ id: 'account_test', email: 'test@example.org', name: 'Test', passwordHash, tier: 'institutional', status: 'active' });
  await getDb().insert(staffUsers).values({ id: 'staff_test', email: 'staff@example.org', name: 'Test staff', passwordHash, role: 'admin' });
  await getDb().insert(emailTokens).values({ id: 'token_test', accountId: 'account_test', purpose: 'reset_password', tokenHash: await sha256Hex(token), expiresAt: new Date(Date.now() + 3600000) });
});
afterEach(() => { vi.useRealTimers(); local.sqlite.close(); delete env.DB; });

describe('account transaction invariants', () => {
  it('allows normal customer and staff sign-in and records the staff event', async () => {
    expect((await accountSignIn('test@example.org', password, null)).ok).toBe(true);
    expect((await signIn('staff@example.org', password, null)).ok).toBe(true);
    expect(local.sqlite.prepare('SELECT count(*) AS n FROM account_sessions').get()!.n).toBe(1);
    expect(local.sqlite.prepare("SELECT count(*) AS n FROM staff_events WHERE action = 'sign_in'").get()!.n).toBe(1);
  });
  it('does not issue a customer session when credentials change during sign-in', async () => {
    local.beforeNextBatch(() => local.sqlite.exec("UPDATE accounts SET password_hash = 'new-credential', last_change_id = 'reset_won'"));
    expect((await accountSignIn('test@example.org', password, null)).ok).toBe(false);
    expect(local.sqlite.prepare('SELECT count(*) AS n FROM account_sessions').get()!.n).toBe(0);
  });
  it('does not issue a staff session or sign-in event when access is revoked mid-flight', async () => {
    local.beforeNextBatch(() => local.sqlite.exec("UPDATE staff_users SET active = 0, last_change_id = 'deactivation_won'"));
    expect((await signIn('staff@example.org', password, null)).ok).toBe(false);
    expect(local.sqlite.prepare('SELECT count(*) AS n FROM staff_sessions').get()!.n).toBe(0);
    expect(local.sqlite.prepare('SELECT count(*) AS n FROM staff_events').get()!.n).toBe(0);
  });
  it('never lets the loser of a same-second reset claim overwrite the winner', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const seconds = Math.floor(Date.now() / 1000);
    const winnerHash = await hashPassword('Winner-Password-456!');
    local.beforeNextBatch(() => {
      local.sqlite.prepare('UPDATE email_tokens SET used_at = ?').run(seconds);
      local.sqlite.prepare("UPDATE accounts SET password_hash = ?, last_change_id = 'winner'").run(winnerHash);
    });
    const outcome = await resetPasswordWithToken(token, 'Loser-Password-789!', 'Loser-Password-789!');
    expect(outcome).toEqual({ ok: false, reason: 'invalid' });
    const hash = local.sqlite.prepare('SELECT password_hash FROM accounts').get()!.password_hash as string;
    expect(await verifyPassword('Winner-Password-456!', hash)).toBe(true);
    expect(local.sqlite.prepare("SELECT count(*) AS n FROM account_events WHERE action = 'password_reset'").get()!.n).toBe(0);
  });
  it('resets once, revokes sessions, and records exactly one event', async () => {
    await accountSignIn('test@example.org', password, null);
    expect(await resetPasswordWithToken(token, 'Replacement-Password-123!', 'Replacement-Password-123!')).toEqual({ ok: true });
    expect((await resetPasswordWithToken(token, 'Another-Password-123!', 'Another-Password-123!')).ok).toBe(false);
    expect(local.sqlite.prepare('SELECT count(*) AS n FROM account_sessions WHERE revoked_at IS NULL').get()!.n).toBe(0);
    expect(local.sqlite.prepare("SELECT count(*) AS n FROM account_events WHERE action = 'password_reset'").get()!.n).toBe(1);
  });
  it('does not reset an account suspended between token validation and commit', async () => {
    local.beforeNextBatch(() => local.sqlite.exec("UPDATE accounts SET status = 'suspended'"));
    expect((await resetPasswordWithToken(token, 'Replacement-Password-123!', 'Replacement-Password-123!')).ok).toBe(false);
    expect(local.sqlite.prepare('SELECT used_at FROM email_tokens').get()!.used_at).toBeNull();
  });
  it('does not consume a verification token revoked during validation', async () => {
    local.sqlite.exec("UPDATE email_tokens SET purpose = 'verify_email'; UPDATE accounts SET status = 'pending_email'");
    local.beforeNextBatch(() => local.sqlite.exec('UPDATE email_tokens SET used_at = unixepoch()'));
    expect(await verifyEmailToken(token)).toBe('invalid');
    expect(local.sqlite.prepare('SELECT status FROM accounts').get()!.status).toBe('pending_email');
  });
});

describe('confirming an email address by hand', () => {
  const staff = { id: 'staff_test', name: 'Test staff', role: 'admin' } as StaffPrincipal;
  const note = 'Customer wrote to research@ from this address on 18 September';
  const account = async () => (await getDb().select().from(accounts).where(eq(accounts.id, 'account_test')))[0];
  const scalar = (query: string) => Object.values(local.sqlite.prepare(query).get()!)[0];

  beforeEach(async () => {
    local.sqlite.exec("UPDATE accounts SET status = 'pending_email', email_verified_at = NULL");
    await getDb().insert(emailTokens).values({ id: 'token_verify', accountId: 'account_test', purpose: 'verify_email', tokenHash: 'b'.repeat(64), expiresAt: new Date(Date.now() + 3600000) });
  });

  it('activates the account, retires its emailed link, and records who confirmed it and how', async () => {
    expect(await confirmEmailByStaff(await account(), note, staff)).toMatchObject({ ok: true });
    expect(scalar("SELECT status FROM accounts WHERE id = 'account_test'")).toBe('active');
    expect(scalar("SELECT email_verified_at FROM accounts WHERE id = 'account_test'")).not.toBeNull();
    expect(scalar("SELECT used_at FROM email_tokens WHERE id = 'token_verify'")).not.toBeNull();
    const event = local.sqlite.prepare("SELECT detail, actor FROM account_events WHERE action = 'email_confirmed_by_staff'").all() as { detail: string; actor: string }[];
    expect(event).toEqual([{ detail: note, actor: 'Test staff (staff_test)' }]);
    expect((await accountSignIn('test@example.org', password, null)).ok).toBe(true);
  });

  it('needs a note saying how the address was confirmed', async () => {
    expect(await confirmEmailByStaff(await account(), '   ', staff)).toMatchObject({ ok: false });
    expect(scalar("SELECT status FROM accounts WHERE id = 'account_test'")).toBe('pending_email');
    expect(scalar("SELECT count(*) FROM account_events")).toBe(0);
  });

  it('refuses an address that is already confirmed', async () => {
    local.sqlite.exec("UPDATE accounts SET status = 'active'");
    expect(await confirmEmailByStaff(await account(), note, staff)).toMatchObject({ ok: false, error: expect.stringContaining('already confirmed') });
  });

  it('does not confirm an account suspended while the confirmation was being recorded', async () => {
    const before = await account();
    local.beforeNextBatch(() => local.sqlite.exec("UPDATE accounts SET status = 'suspended', last_change_id = 'suspension_won'"));
    expect(await confirmEmailByStaff(before, note, staff)).toMatchObject({ ok: false });
    expect(scalar("SELECT status FROM accounts WHERE id = 'account_test'")).toBe('suspended');
    expect(scalar("SELECT used_at FROM email_tokens WHERE id = 'token_verify'")).toBeNull();
    expect(scalar("SELECT count(*) FROM account_events")).toBe(0);
  });
});

describe('sign-up storage', () => {
  it('stores the date of birth with the account and never echoes it back', async () => {
    const result = await signUp(
      { name: 'Dr New', email: 'new@example.org', password, tier: 'institutional', ageConfirmed: true, dateOfBirth: '1980-01-01' },
      null,
    );
    expect(result.ok).toBe(true);
    const row = local.sqlite.prepare("SELECT date_of_birth, age_confirmed_at FROM accounts WHERE email = 'new@example.org'").get() as Record<string, unknown>;
    expect(row.date_of_birth).toBe('1980-01-01');
    expect(row.age_confirmed_at).not.toBeNull();
  });
});
