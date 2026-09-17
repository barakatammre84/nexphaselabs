import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localD1 } from './helpers/local-d1';

const { env } = vi.hoisted(() => ({ env: {} as Record<string, unknown> }));
vi.mock('cloudflare:workers', () => ({ env }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(to);
  },
}));
const mail = vi.hoisted(() => ({ ok: true }));
vi.mock('@/lib/email', () => ({ sendEmail: async () => ({ ok: mail.ok, id: mail.ok ? 'msg_test' : null }) }));

import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { accounts, accountSessions, emailTokens } from '@/db/schema';
import { verifyEmailToken } from '@/lib/account-auth';
import { changeName, changePassword, pendingEmailFor, requestEmailChange } from '@/lib/account-details';
import { hashPassword, sha256Hex, verifyPassword } from '@/lib/staff-auth-core';

let local: ReturnType<typeof localD1>;
const OLD = 'Old-password-123';
const future = () => new Date(Date.now() + 60 * 60 * 1000);

async function account(id: string, email: string) {
  await getDb().insert(accounts).values({
    id,
    email,
    name: 'Synthetic',
    passwordHash: await hashPassword(OLD),
    status: 'active',
    tier: 'researcher',
  } as never);
}
async function session(id: string, accountId: string) {
  await getDb().insert(accountSessions).values({ id, accountId, tokenHash: await sha256Hex(id), expiresAt: future() } as never);
}
async function row(id: string) {
  const [r] = await getDb().select().from(accounts).where(eq(accounts.id, id));
  return r;
}

beforeEach(async () => {
  local = localD1();
  Object.assign(env, { DB: local.binding, APP_ENV: 'test', PUBLIC_ORIGIN: 'http://localhost:3000' });
  mail.ok = true;
  await account('acct_a', 'a@example.invalid');
  await account('acct_b', 'b@example.invalid');
  await session('sess_current', 'acct_a');
  await session('sess_other', 'acct_a');
});
afterEach(() => {
  local.sqlite.close();
  for (const key of Object.keys(env)) delete env[key];
});

describe('account details (owner, 16 Sep 2026)', () => {
  it('changes the name after tidying it, and refuses a name that is not one', async () => {
    expect(await changeName('acct_a', '  Jane   Doe ')).toEqual({ ok: true });
    expect((await row('acct_a')).name).toBe('Jane Doe');
    expect(await changeName('acct_a', 'J')).toMatchObject({ ok: false });
  });

  it('changes the password only with the current one, and signs out the other devices', async () => {
    const me = { id: 'acct_a', sessionId: 'sess_current' };
    expect(await changePassword(me, 'wrong-password-1', 'New-password-4567', 'New-password-4567')).toMatchObject({ ok: false, error: 'The current password is not right.' });
    expect(await changePassword(me, OLD, 'short', 'short')).toMatchObject({ ok: false });
    expect(await changePassword(me, OLD, 'New-password-4567', 'New-password-4568')).toMatchObject({ ok: false, error: 'The new passwords do not match.' });
    expect(await changePassword(me, OLD, 'New-password-4567', 'New-password-4567')).toMatchObject({ ok: true });
    expect(await verifyPassword('New-password-4567', (await row('acct_a')).passwordHash)).toBe(true);
    const sessions = await getDb().select().from(accountSessions).where(eq(accountSessions.accountId, 'acct_a'));
    expect(sessions.find((s) => s.id === 'sess_current')?.revokedAt).toBeNull();
    expect(sessions.find((s) => s.id === 'sess_other')?.revokedAt).not.toBeNull();
  });

  it('parks a new email address until its link is opened, then applies it', async () => {
    const me = { id: 'acct_a', email: 'a@example.invalid', name: 'Synthetic' };
    expect(await requestEmailChange(me, 'A@example.invalid')).toMatchObject({ ok: false });
    expect(await requestEmailChange(me, 'b@example.invalid')).toMatchObject({ ok: false, error: 'That email address is already in use.' });
    expect(await requestEmailChange(me, 'not an address')).toMatchObject({ ok: false });
    expect(await requestEmailChange(me, ' New@Example.invalid ')).toMatchObject({ ok: true });
    expect(await pendingEmailFor('acct_a')).toBe('new@example.invalid');
    expect((await row('acct_a')).email).toBe('a@example.invalid');
    const issued = await getDb().select().from(emailTokens).where(eq(emailTokens.accountId, 'acct_a'));
    expect(issued.filter((t) => t.purpose === 'verify_email' && !t.usedAt)).toHaveLength(1);

    // The link is opened: the parked address becomes the account's address.
    const raw = 'c'.repeat(64);
    await getDb().insert(emailTokens).values({ id: 'tok_swap', accountId: 'acct_a', purpose: 'verify_email', tokenHash: await sha256Hex(raw), expiresAt: future(), createdAt: new Date() } as never);
    expect(await verifyEmailToken(raw)).toBe('verified');
    const after = await row('acct_a');
    expect(after.email).toBe('new@example.invalid');
    expect(after.pendingEmail).toBeNull();
    expect(after.emailVerifiedAt).not.toBeNull();
  });

  it('cannot apply a parked address another account took meanwhile', async () => {
    const me = { id: 'acct_a', email: 'a@example.invalid', name: 'Synthetic' };
    expect(await requestEmailChange(me, 'new@example.invalid')).toMatchObject({ ok: true });
    await getDb().update(accounts).set({ email: 'new@example.invalid' }).where(eq(accounts.id, 'acct_b'));
    const raw = 'd'.repeat(64);
    await getDb().insert(emailTokens).values({ id: 'tok_clash', accountId: 'acct_a', purpose: 'verify_email', tokenHash: await sha256Hex(raw), expiresAt: future(), createdAt: new Date() } as never);
    expect(await verifyEmailToken(raw)).toBe('invalid');
    expect((await row('acct_a')).email).toBe('a@example.invalid');
    const [tok] = await getDb().select().from(emailTokens).where(eq(emailTokens.id, 'tok_clash'));
    expect(tok.usedAt).toBeNull();
  });

  it('leaves nothing parked when the confirmation mail cannot be sent', async () => {
    mail.ok = false;
    const me = { id: 'acct_a', email: 'a@example.invalid', name: 'Synthetic' };
    expect(await requestEmailChange(me, 'new@example.invalid')).toMatchObject({ ok: false });
    expect(await pendingEmailFor('acct_a')).toBeNull();
  });
});
