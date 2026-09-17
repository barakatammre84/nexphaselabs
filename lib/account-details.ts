import { and, eq, isNull, ne, or, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { accounts, accountSessions } from '@/db/schema';
import { issueVerification, type AccountPrincipal } from '@/lib/account-auth';
import { normaliseEmail } from '@/lib/account-rules';
import { hashPassword, passwordPolicyError, verifyPassword } from '@/lib/staff-auth-core';

/**
 * What a customer may change about their own account from the dashboard
 * (owner, 16 September 2026). Every write is scoped to the signed-in account
 * inside the query. Nothing here touches an order: the order keeps its own
 * snapshot of who bought and where it went.
 */
export type DetailsResult = { ok: true; detail?: string } | { ok: false; error: string };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function changeName(accountId: string, rawName: string): Promise<DetailsResult> {
  const name = rawName.trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 120) return { ok: false, error: 'Enter your full name.' };
  await getDb()
    .update(accounts)
    .set({ name, updatedAt: new Date() })
    .where(eq(accounts.id, accountId));
  return { ok: true };
}

/**
 * The current password is checked first, so a session left open on a shared
 * machine cannot be used to lock the owner out. Other sessions are signed out
 * once the password changes; the one making the change stays.
 */
export async function changePassword(
  account: Pick<AccountPrincipal, 'id' | 'sessionId'>,
  current: string,
  next: string,
  confirm: string,
): Promise<DetailsResult> {
  const db = getDb();
  const [row] = await db
    .select({ passwordHash: accounts.passwordHash })
    .from(accounts)
    .where(eq(accounts.id, account.id))
    .limit(1);
  if (!row) return { ok: false, error: 'Account not found.' };
  if (!current || !(await verifyPassword(current, row.passwordHash)))
    return { ok: false, error: 'The current password is not right.' };
  const policy = passwordPolicyError(next);
  if (policy) return { ok: false, error: policy };
  if (next !== confirm) return { ok: false, error: 'The new passwords do not match.' };
  if (next === current) return { ok: false, error: 'Choose a password you have not used here before.' };
  const now = new Date();
  const passwordHash = await hashPassword(next);
  await db.batch([
    db.update(accounts).set({ passwordHash, updatedAt: now }).where(eq(accounts.id, account.id)),
    db
      .update(accountSessions)
      .set({ revokedAt: now })
      .where(
        and(
          eq(accountSessions.accountId, account.id),
          isNull(accountSessions.revokedAt),
          ne(accountSessions.id, account.sessionId),
        ),
      ),
  ]);
  return { ok: true, detail: 'Other devices have been signed out.' };
}

/**
 * The new address is only *requested* here. It becomes the account's email
 * when its confirmation link is opened (verifyEmailToken), so a mistyped
 * address never locks anyone out of the account they are signed in to.
 */
export async function requestEmailChange(
  account: Pick<AccountPrincipal, 'id' | 'email' | 'name'>,
  rawEmail: string,
): Promise<DetailsResult> {
  const email = normaliseEmail(rawEmail);
  if (!EMAIL_PATTERN.test(email) || email.length > 254) return { ok: false, error: 'Enter a valid email address.' };
  if (email === normaliseEmail(account.email)) return { ok: false, error: 'That is already the email address on this account.' };
  const db = getDb();
  const [taken] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(ne(accounts.id, account.id), or(eq(accounts.email, email), eq(accounts.pendingEmail, email))))
    .limit(1);
  if (taken) return { ok: false, error: 'That email address is already in use.' };
  await db
    .update(accounts)
    .set({ pendingEmail: email, updatedAt: new Date() })
    .where(eq(accounts.id, account.id));
  const sent = await issueVerification(account.id, email, account.name);
  if (sent) return { ok: true, detail: `A confirmation link was sent to ${email}. Your address changes when you open it.` };
  // No link reached the new mailbox, so nothing is left waiting for one.
  await db
    .update(accounts)
    .set({ pendingEmail: null, updatedAt: new Date() })
    .where(eq(accounts.id, account.id));
  return {
    ok: false,
    error: `The confirmation email to ${email} could not be sent. Your address is unchanged; try again shortly.`,
  };
}

/** Whether a requested address is still waiting for its link, for the details page. */
export async function pendingEmailFor(accountId: string): Promise<string | null> {
  const [row] = await getDb()
    .select({ pendingEmail: accounts.pendingEmail })
    .from(accounts)
    .where(and(eq(accounts.id, accountId), sql`${accounts.pendingEmail} IS NOT NULL`))
    .limit(1);
  return row?.pendingEmail ?? null;
}
