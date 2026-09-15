import { and, desc, eq, gt, isNull, ne, or, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import {
  accountAcknowledgements,
  accountEvents,
  accountSessions,
  accounts,
  emailTokens,
  orders,
  organizations,
  type Account,
  type AccountEvent,
} from '@/db/schema';
import { sendEmail } from '@/lib/email';
import { publicOrigin } from '@/lib/site-config';
import type { StaffPrincipal } from '@/lib/staff-auth';
import { hashPassword, passwordPolicyError, randomToken, sha256Hex } from '@/lib/staff-auth-core';
import { issueVerification } from '@/lib/account-auth';
import { ENTITY_FOOTER } from '@/lib/entity';

/**
 * Customer service: the customer's own password reset, and the staff tools
 * for looking after an account (lookup, resend verification, send a reset,
 * suspend and reinstate, end sessions). Every staff action is an append-only
 * account_events row naming the actor. Nothing is deleted.
 */

const RESET_TTL_SECONDS = 60 * 60;
const id = (prefix: string) => `${prefix}_${randomToken().slice(0, 24)}`;
const by = (staff: StaffPrincipal) => `${staff.name} (${staff.id})`;
const FOOTER = ENTITY_FOOTER;

/* ------------------------------------------------------------------------ */
/* Password reset                                                            */
/* ------------------------------------------------------------------------ */

async function issueReset(account: Account, actor: string): Promise<boolean> {
  const db = getDb();
  const now = new Date();
  const token = randomToken();
  await db.batch([
    db
      .update(emailTokens)
      .set({ usedAt: now })
      .where(and(eq(emailTokens.accountId, account.id), eq(emailTokens.purpose, 'reset_password'), isNull(emailTokens.usedAt))),
    db.insert(emailTokens).values({
      id: id('tok'),
      accountId: account.id,
      purpose: 'reset_password',
      tokenHash: await sha256Hex(token),
      expiresAt: new Date(now.getTime() + RESET_TTL_SECONDS * 1000),
      createdAt: now,
    }),
  ]);
  const link = `${publicOrigin()}/account/reset?token=${token}`;
  const result = await sendEmail({
    to: account.email,
    subject: 'Reset your password — NexPhase Labs',
    text: [
      `Hello ${account.name},`,
      '',
      'A password reset was requested for your NexPhase Labs research account. Choose a new password by opening this link within one hour:',
      link,
      '',
      'If you did not ask for this, ignore this message; your password is unchanged.',
      '',
      FOOTER,
    ].join('\n'),
  });
  // The history row is written after the send so it records what happened, not what was intended.
  await db.insert(accountEvents).values({
    id: id('aev'),
    accountId: account.id,
    action: actor === 'self' ? 'password_reset_requested' : 'reset_sent',
    detail: result.ok ? 'reset link emailed; valid one hour' : `reset link email failed: ${result.error.slice(0, 120)}`,
    actor,
    createdAt: new Date(),
  });
  return result.ok;
}

/**
 * The customer asks for a reset. The response never says whether the address
 * exists, and every branch runs the same PBKDF2 work. Only a real account is
 * ever emailed: a reset link to an active one, a fresh verification link to
 * an unverified one, a "contact us" notice to a suspended one. An unknown
 * address gets nothing — mailing strangers on request would make this
 * endpoint a relay, which is a worse outcome than the residual timing
 * difference of the provider call; that difference is bounded by the
 * per-address and per-IP limits in the route.
 */
export async function requestPasswordReset(emailRaw: string): Promise<void> {
  const email = emailRaw.trim().toLowerCase();
  const db = getDb();
  const [account] = await db.select().from(accounts).where(eq(accounts.email, email)).limit(1);
  await hashPassword(email); // same work in every branch
  if (!account) return;
  if (account.status === 'suspended') {
    await sendEmail({
      to: account.email,
      subject: 'Password reset request — NexPhase Labs',
      text: [
        `Hello ${account.name},`,
        '',
        'A password reset was requested for your NexPhase Labs account. This account is currently suspended, so the password cannot be reset online.',
        'Contact research@nexphaselabs.net and a person will help.',
        '',
        FOOTER,
      ].join('\n'),
    });
    return;
  }
  if (account.status === 'pending_email') {
    // The address is not verified yet; the useful link is the verification one.
    const sent = await issueVerification(account.id, account.email, account.name);
    await db.insert(accountEvents).values({ id: id('aev'), accountId: account.id, action: 'verification_resent', detail: sent ? 'requested from the reset form; emailed' : 'requested from the reset form; email failed', actor: 'self', createdAt: new Date() });
    return;
  }
  await issueReset(account, 'self');
}

export type ResetOutcome = { ok: true } | { ok: false; reason: 'invalid' | 'expired' | 'policy' | 'mismatch' };

/** Consume a reset token: new password, every session ended, lockout cleared. */
export async function resetPasswordWithToken(token: string, next: string, confirm: string): Promise<ResetOutcome> {
  if (!/^[a-f0-9]{64}$/.test(token)) return { ok: false, reason: 'invalid' };
  const db = getDb();
  const now = new Date();
  const [row] = await db
    .select()
    .from(emailTokens)
    .where(and(eq(emailTokens.tokenHash, await sha256Hex(token)), eq(emailTokens.purpose, 'reset_password')))
    .limit(1);
  if (!row || row.usedAt) return { ok: false, reason: 'invalid' };
  if (row.expiresAt < now) return { ok: false, reason: 'expired' };
  const [holder] = await db.select({ status: accounts.status }).from(accounts).where(eq(accounts.id, row.accountId)).limit(1);
  if (!holder || holder.status === 'suspended') return { ok: false, reason: 'invalid' };
  if (passwordPolicyError(next)) return { ok: false, reason: 'policy' };
  if (next !== confirm) return { ok: false, reason: 'mismatch' };
  const passwordHash = await hashPassword(next);
  const claimId = id('reset');
  const [used] = await db.batch([
    // Single use: the token row is claimed first and everything else applies only if that claim won.
    db.update(emailTokens).set({ usedAt: now }).where(and(
      eq(emailTokens.id, row.id), isNull(emailTokens.usedAt),
      sql`${emailTokens.expiresAt} > unixepoch()`,
      sql`EXISTS (SELECT 1 FROM ${accounts} WHERE ${accounts.id} = ${row.accountId} AND ${accounts.status} IN ('active', 'pending_email'))`,
    )).returning({ id: emailTokens.id }),
    db
      .update(accounts)
      .set({
        passwordHash,
        lastChangeId: claimId,
        failedAttempts: 0,
        lockedUntil: null,
        // A reset link proves control of the address at least as well as the verification link does.
        emailVerifiedAt: sql`COALESCE(${accounts.emailVerifiedAt}, ${Math.floor(now.getTime() / 1000)})`,
        status: sql`CASE WHEN ${accounts.status} = 'pending_email' THEN 'active' ELSE ${accounts.status} END`,
        updatedAt: now,
      })
      .where(and(eq(accounts.id, row.accountId), sql`changes() = 1`)),
    db
      .update(accountSessions)
      .set({ revokedAt: now })
      .where(and(eq(accountSessions.accountId, row.accountId), isNull(accountSessions.revokedAt), sql`EXISTS (SELECT 1 FROM ${accounts} WHERE ${accounts.id} = ${row.accountId} AND ${accounts.lastChangeId} = ${claimId})`)),
    db.insert(accountEvents).select(
      db
        .select({
          id: sql<string>`${id('aev')}`.as('id'),
          accountId: accounts.id,
          action: sql<string>`'password_reset'`.as('action'),
          detail: sql<string>`'password set from reset link; all sessions ended'`.as('detail'),
          actor: sql<string>`'self'`.as('actor'),
          createdAt: sql<number>`${Math.floor(now.getTime() / 1000)}`.as('created_at'),
        })
        .from(accounts)
        .where(and(eq(accounts.id, row.accountId), eq(accounts.lastChangeId, claimId))),
    ),
  ]);
  if (!used || used.length === 0) return { ok: false, reason: 'invalid' };
  return { ok: true };
}

/* ------------------------------------------------------------------------ */
/* Staff lookup                                                              */
/* ------------------------------------------------------------------------ */

export type AccountListRow = Account & { organizationName: string | null; orderCount: number };

export async function searchAccounts(query: string, limit = 100): Promise<AccountListRow[]> {
  const db = getDb();
  const q = query.trim().toLowerCase().slice(0, 80);
  const pattern = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  const base = db
    .select({
      account: accounts,
      organizationName: sql<string | null>`(SELECT legal_name FROM organizations o WHERE o.account_id = accounts.id ORDER BY o.created_at DESC LIMIT 1)`.as('organization_name'),
      orderCount: sql<number>`(SELECT count(*) FROM orders r WHERE r.account_id = accounts.id)`.mapWith(Number).as('order_count'),
    })
    .from(accounts);
  const rows = await (q
    ? base.where(
        or(
          sql`lower(${accounts.email}) LIKE ${pattern} ESCAPE '\\'`,
          sql`lower(${accounts.name}) LIKE ${pattern} ESCAPE '\\'`,
          sql`EXISTS (SELECT 1 FROM organizations o WHERE o.account_id = accounts.id AND lower(o.legal_name) LIKE ${pattern} ESCAPE '\\')`,
        ),
      )
    : base
  )
    .orderBy(desc(accounts.createdAt))
    .limit(limit);
  return rows.map((r) => ({ ...r.account, organizationName: r.organizationName, orderCount: r.orderCount }));
}

export type AccountDetail = {
  account: Account;
  organization: typeof organizations.$inferSelect | null;
  acknowledgements: (typeof accountAcknowledgements.$inferSelect)[];
  orders: (typeof orders.$inferSelect)[];
  sessions: (typeof accountSessions.$inferSelect)[];
  tokens: (typeof emailTokens.$inferSelect)[];
  events: AccountEvent[];
};

export async function getAccountDetail(accountId: string): Promise<AccountDetail | null> {
  const db = getDb();
  const [account] = await db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1);
  if (!account) return null;
  const [orgRows, acks, orderRows, sessions, tokens, events] = await Promise.all([
    db.select().from(organizations).where(eq(organizations.accountId, accountId)).orderBy(desc(organizations.createdAt)).limit(1),
    db.select().from(accountAcknowledgements).where(eq(accountAcknowledgements.accountId, accountId)).orderBy(desc(accountAcknowledgements.acceptedAt)).limit(50),
    db.select().from(orders).where(eq(orders.accountId, accountId)).orderBy(desc(orders.createdAt)).limit(100),
    db.select().from(accountSessions).where(eq(accountSessions.accountId, accountId)).orderBy(desc(accountSessions.createdAt)).limit(20),
    db.select().from(emailTokens).where(eq(emailTokens.accountId, accountId)).orderBy(desc(emailTokens.createdAt)).limit(20),
    db.select().from(accountEvents).where(eq(accountEvents.accountId, accountId)).orderBy(desc(accountEvents.createdAt)).limit(100),
  ]);
  return { account, organization: orgRows[0] ?? null, acknowledgements: acks, orders: orderRows, sessions, tokens, events };
}

/* ------------------------------------------------------------------------ */
/* Staff actions                                                             */
/* ------------------------------------------------------------------------ */

export type ServiceResult = { ok: true; detail?: string } | { ok: false; error: string };

export async function staffSendPasswordReset(account: Account, staff: StaffPrincipal): Promise<ServiceResult> {
  if (account.status === 'suspended') return { ok: false, error: 'Reinstate the account before sending a reset.' };
  if (account.status === 'pending_email') return { ok: false, error: 'The email address is not verified yet. Resend the verification instead.' };
  const sent = await issueReset(account, by(staff));
  return sent ? { ok: true, detail: 'Reset link emailed.' } : { ok: false, error: 'The reset link could not be emailed. Check the email configuration.' };
}

export async function staffResendVerification(account: Account, staff: StaffPrincipal): Promise<ServiceResult> {
  if (account.status !== 'pending_email') return { ok: false, error: 'This email address is already verified.' };
  const sent = await issueVerification(account.id, account.email, account.name);
  const db = getDb();
  await db.insert(accountEvents).values({ id: id('aev'), accountId: account.id, action: 'verification_resent', detail: sent ? 'emailed' : 'email failed', actor: by(staff), createdAt: new Date() });
  return sent ? { ok: true, detail: 'Verification email sent.' } : { ok: false, error: 'The verification email could not be sent. Check the email configuration.' };
}

/**
 * Confirm a customer's email address by hand. The check-email page tells a customer whose
 * confirmation email could not be sent to write to research@ and have the address confirmed
 * by hand; this is that step. It does what an opened confirmation link does (the account
 * becomes active and the address is marked verified), retires any confirmation link still
 * outstanding, and records who confirmed the address and how. A note is required: a
 * confirmation with no record of how it was made is not evidence.
 */
export async function confirmEmailByStaff(account: Account, note: string, staff: StaffPrincipal): Promise<ServiceResult> {
  if (account.status === 'suspended') return { ok: false, error: 'Reinstate the account before confirming its email address.' };
  if (account.status !== 'pending_email') return { ok: false, error: 'This email address is already confirmed.' };
  const how = note.trim().slice(0, 300);
  if (!how) return { ok: false, error: 'Say how the address was confirmed, for example the message the customer sent from it.' };
  const db = getDb();
  const now = new Date();
  const marker = id('chg');
  const [updated] = await db.batch([
    db
      .update(accounts)
      .set({ status: 'active', emailVerifiedAt: now, updatedAt: now, lastChangeId: marker })
      .where(and(eq(accounts.id, account.id), eq(accounts.status, 'pending_email')))
      .returning({ id: accounts.id }),
    // An emailed link that arrives later must not act on the account again.
    db
      .update(emailTokens)
      .set({ usedAt: now })
      .where(
        and(
          eq(emailTokens.accountId, account.id),
          eq(emailTokens.purpose, 'verify_email'),
          isNull(emailTokens.usedAt),
          sql`(SELECT last_change_id FROM accounts a WHERE a.id = ${account.id}) = ${marker}`,
        ),
      ),
    db.insert(accountEvents).select(
      db
        .select({
          id: sql<string>`${id('aev')}`.as('id'),
          accountId: accounts.id,
          action: sql<string>`'email_confirmed_by_staff'`.as('action'),
          detail: sql<string>`${how}`.as('detail'),
          actor: sql<string>`${by(staff)}`.as('actor'),
          createdAt: sql<number>`${Math.floor(now.getTime() / 1000)}`.as('created_at'),
        })
        .from(accounts)
        .where(and(eq(accounts.id, account.id), eq(accounts.lastChangeId, marker))),
    ),
  ]);
  if (!updated || updated.length === 0) return { ok: false, error: 'This account changed while you were editing. Reload and try again.' };
  return { ok: true, detail: 'Email address confirmed. The customer can now sign in.' };
}

/** Suspend: sign-in refused and every session ended. The organisation's verification is untouched. */
export async function suspendAccount(account: Account, reason: string, staff: StaffPrincipal): Promise<ServiceResult> {
  if (account.status === 'suspended') return { ok: false, error: 'This account is already suspended.' };
  if (!reason.trim()) return { ok: false, error: 'Give a reason for the suspension.' };
  const db = getDb();
  const now = new Date();
  const marker = id('chg');
  const [updated] = await db.batch([
    db
      .update(accounts)
      .set({ status: 'suspended', updatedAt: now, lastChangeId: marker })
      .where(and(eq(accounts.id, account.id), ne(accounts.status, 'suspended')))
      .returning({ id: accounts.id, status: accounts.status }),
    db
      .update(accountSessions)
      .set({ revokedAt: now })
      .where(and(eq(accountSessions.accountId, account.id), isNull(accountSessions.revokedAt), sql`(SELECT status FROM accounts a WHERE a.id = ${account.id}) = 'suspended'`)),
    // Live reset and verification links die with the suspension.
    db
      .update(emailTokens)
      .set({ usedAt: now })
      .where(and(eq(emailTokens.accountId, account.id), isNull(emailTokens.usedAt), sql`(SELECT status FROM accounts a WHERE a.id = ${account.id}) = 'suspended'`)),
    db.insert(accountEvents).select(
      db
        .select({
          id: sql<string>`${id('aev')}`.as('id'),
          accountId: accounts.id,
          action: sql<string>`'suspended'`.as('action'),
          detail: sql<string>`${`${reason.trim().slice(0, 300)}; was ${account.status}; all sessions and live email links ended`}`.as('detail'),
          actor: sql<string>`${by(staff)}`.as('actor'),
          createdAt: sql<number>`${Math.floor(now.getTime() / 1000)}`.as('created_at'),
        })
        .from(accounts)
        .where(and(eq(accounts.id, account.id), eq(accounts.lastChangeId, marker))),
    ),
  ]);
  if (!updated || updated.length === 0) return { ok: false, error: 'This account changed while you were editing. Reload and try again.' };
  return { ok: true, detail: 'Account suspended and its sessions ended.' };
}

/** Reinstate: back to active if the email was verified, otherwise back to pending verification. */
export async function reinstateAccount(account: Account, note: string | null, staff: StaffPrincipal): Promise<ServiceResult> {
  if (account.status !== 'suspended') return { ok: false, error: 'This account is not suspended.' };
  const target = account.emailVerifiedAt ? 'active' : 'pending_email';
  const db = getDb();
  const now = new Date();
  const marker = id('chg');
  const [updated] = await db.batch([
    db
      .update(accounts)
      .set({ status: target, failedAttempts: 0, lockedUntil: null, updatedAt: now, lastChangeId: marker })
      .where(and(eq(accounts.id, account.id), eq(accounts.status, 'suspended')))
      .returning({ id: accounts.id }),
    db.insert(accountEvents).select(
      db
        .select({
          id: sql<string>`${id('aev')}`.as('id'),
          accountId: accounts.id,
          action: sql<string>`'reinstated'`.as('action'),
          detail: sql<string>`${`now ${target}${note ? `; ${note.slice(0, 300)}` : ''}`}`.as('detail'),
          actor: sql<string>`${by(staff)}`.as('actor'),
          createdAt: sql<number>`${Math.floor(now.getTime() / 1000)}`.as('created_at'),
        })
        .from(accounts)
        .where(and(eq(accounts.id, account.id), eq(accounts.lastChangeId, marker))),
    ),
  ]);
  if (!updated || updated.length === 0) return { ok: false, error: 'This account changed while you were editing. Reload and try again.' };
  return { ok: true, detail: `Account reinstated (${target === 'active' ? 'active' : 'awaiting email verification'}).` };
}

export async function revokeAccountSessions(account: Account, staff: StaffPrincipal): Promise<ServiceResult> {
  const db = getDb();
  const now = new Date();
  const [revoked] = await db.batch([
    db
      .update(accountSessions)
      .set({ revokedAt: now })
      .where(and(eq(accountSessions.accountId, account.id), isNull(accountSessions.revokedAt), gt(accountSessions.expiresAt, now)))
      .returning({ id: accountSessions.id }),
    db.insert(accountEvents).values({
      id: id('aev'),
      accountId: account.id,
      action: 'sessions_revoked',
      detail: sql`(SELECT count(*) FROM account_sessions s WHERE s.account_id = ${account.id} AND s.revoked_at = ${Math.floor(now.getTime() / 1000)}) || ' session(s) ended'`,
      actor: by(staff),
      createdAt: now,
    }),
  ]);
  return { ok: true, detail: `${revoked.length} session${revoked.length === 1 ? '' : 's'} ended.` };
}

/** Recent tokens for the detail page: purpose, issued, used, expired — never the token itself (only a hash is stored). */
export function describeToken(t: typeof emailTokens.$inferSelect, now = new Date()): string {
  const state = t.usedAt ? `used ${t.usedAt.toISOString().slice(0, 16).replace('T', ' ')}` : t.expiresAt < now ? 'expired' : 'live';
  return `${t.purpose.replace('_', ' ')} · issued ${t.createdAt.toISOString().slice(0, 16).replace('T', ' ')} · ${state}`;
}
