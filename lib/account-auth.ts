import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getDb } from '@/db';
import { accountAcknowledgements, accountSessions, accounts, emailTokens, type Account } from '@/db/schema';
import { sendEmail } from '@/lib/email';
import { hashPassword, randomToken, sha256Hex, verifyPassword } from '@/lib/staff-auth-core';
import type { AccountTier } from '@/lib/account-rules';
import { RUO_VERSION, TERMS_VERSION } from '@/lib/policy';
import { publicOrigin } from '@/lib/site-config';
import { ENTITY_FOOTER } from '@/lib/entity';

/**
 * Customer account authentication. Same primitives and the same posture as
 * staff auth (lib/staff-auth.ts): PBKDF2 hashes, hashed session tokens,
 * HttpOnly cookies, atomic lockout, generic failure responses.
 *
 * Verification email tokens are single-use, hashed at rest, and expire in
 * 24 hours. An unverified account cannot sign in.
 */

export const ACCOUNT_COOKIE = 'nx_account';
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const VERIFY_TTL_SECONDS = 24 * 60 * 60;
const MAX_FAILED_ATTEMPTS = 10;
const LOCKOUT_SECONDS = 15 * 60;

export type AccountPrincipal = {
  id: string;
  email: string;
  name: string;
  tier: AccountTier;
  status: string;
  verificationStatus: string;
  termsVersion: string | null;
  ruoVersion: string | null;
  sessionId: string;
};

/** Append-only acceptance rows for both documents at their current versions. */
function acknowledgementRows(accountId: string, at: Date, userAgent: string | null) {
  return (['terms', 'ruo'] as const).map((document) => ({
    id: id('ack'),
    accountId,
    document,
    version: document === 'terms' ? TERMS_VERSION : RUO_VERSION,
    acceptedAt: at,
    userAgent: userAgent?.slice(0, 200) ?? null,
    createdAt: at,
  }));
}

/**
 * Record acceptance of the current terms and research-use acknowledgement:
 * two history rows plus the cached versions on the account, in one batch.
 */
export async function recordAcknowledgements(accountId: string, userAgent: string | null): Promise<void> {
  const db = getDb();
  const now = new Date();
  await db.batch([
    db.insert(accountAcknowledgements).values(acknowledgementRows(accountId, now, userAgent)),
    db
      .update(accounts)
      .set({ termsAcceptedAt: now, termsVersion: TERMS_VERSION, ruoAcceptedAt: now, ruoVersion: RUO_VERSION, ageConfirmedAt: now, updatedAt: now })
      .where(eq(accounts.id, accountId)),
  ]);
}

function id(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
}

/* ------------------------------------------------------------------------ */
/* Sign-up and verification                                                  */
/* ------------------------------------------------------------------------ */

export type SignUpResult = { ok: true; accountId: string; emailSent: boolean } | { ok: false; reason: 'exists' | 'email' };

export async function signUp(
  input: { name: string; email: string; password: string; tier: AccountTier; researchSetting?: string | null; ageConfirmed?: boolean; dateOfBirth?: string | null },
  userAgent: string | null,
): Promise<SignUpResult> {
  const db = getDb();
  const now = new Date();

  // Both branches below do the same work — a PBKDF2 hash and one email —
  // so the response time does not reveal whether the address has an account.
  const passwordHash = await hashPassword(input.password);
  const [existing] = await db.select({ id: accounts.id, name: accounts.name }).from(accounts).where(eq(accounts.email, input.email)).limit(1);
  if (existing) {
    await sendEmail({
      to: input.email,
      subject: 'Your NexPhase Labs account — sign-up attempt',
      text: [
        `Hello ${existing.name},`,
        '',
        'Someone tried to create a NexPhase Labs account with this email address, but an account already exists.',
        `If this was you, sign in at ${publicOrigin()}/account/sign-in. If it was not, no action is needed.`,
        '',
        ENTITY_FOOTER,
      ].join('\n'),
    });
    return { ok: false, reason: 'exists' };
  }

  const accountId = id('acc');
  try {
    await db.batch([
      db.insert(accounts).values({
        id: accountId,
        email: input.email,
        name: input.name,
        passwordHash,
        tier: input.tier,
        researchSetting: input.researchSetting ?? null,
        ageConfirmedAt: input.ageConfirmed ? now : null,
        dateOfBirth: input.dateOfBirth ?? null,
        status: 'pending_email',
        termsAcceptedAt: now,
        termsVersion: TERMS_VERSION,
        ruoAcceptedAt: now,
        ruoVersion: RUO_VERSION,
        createdAt: now,
        updatedAt: now,
      }),
      db.insert(accountAcknowledgements).values(acknowledgementRows(accountId, now, userAgent)),
    ]);
  } catch (error) {
    if (/UNIQUE constraint failed/i.test(error instanceof Error ? error.message : String(error))) {
      return { ok: false, reason: 'exists' };
    }
    throw error;
  }

  const sent = await issueVerification(accountId, input.email, input.name);
  return { ok: true, accountId, emailSent: sent };
}

/** Create a fresh verification token (retiring earlier ones) and email the link. */
export async function issueVerification(accountId: string, email: string, name: string): Promise<boolean> {
  const db = getDb();
  const now = new Date();
  const token = randomToken();
  await db.batch([
    db
      .update(emailTokens)
      .set({ usedAt: now })
      .where(and(eq(emailTokens.accountId, accountId), eq(emailTokens.purpose, 'verify_email'), isNull(emailTokens.usedAt))),
    db.insert(emailTokens).values({
      id: id('tok'),
      accountId,
      purpose: 'verify_email',
      tokenHash: await sha256Hex(token),
      expiresAt: new Date(now.getTime() + VERIFY_TTL_SECONDS * 1000),
      createdAt: now,
    }),
  ]);

  const link = `${publicOrigin()}/account/verify?token=${token}`;
  const result = await sendEmail({
    to: email,
    subject: 'Confirm your email address — NexPhase Labs',
    text: [
      `Hello ${name},`,
      '',
      'Confirm the email address for your NexPhase Labs research account by opening this link within 24 hours:',
      link,
      '',
      'If you did not create an account, ignore this message.',
      '',
      ENTITY_FOOTER,
    ].join('\n'),
  });
  return result.ok;
}

/**
 * Sends a fresh confirmation link to an account still waiting for one. Says nothing
 * about whether the address has an account; the caller answers the same way either way.
 */
export async function resendVerification(email: string): Promise<void> {
  const [account] = await getDb()
    .select({ id: accounts.id, email: accounts.email, name: accounts.name, status: accounts.status })
    .from(accounts)
    .where(eq(accounts.email, email.trim().toLowerCase()))
    .limit(1);
  if (!account || account.status !== 'pending_email') return;
  await issueVerification(account.id, account.email, account.name);
}

export type VerifyResult = 'verified' | 'already' | 'invalid' | 'expired';

export async function verifyEmailToken(token: string): Promise<VerifyResult> {
  if (!/^[a-f0-9]{64}$/.test(token)) return 'invalid';
  const db = getDb();
  const now = new Date();
  const [row] = await db
    .select()
    .from(emailTokens)
    .where(and(eq(emailTokens.tokenHash, await sha256Hex(token)), eq(emailTokens.purpose, 'verify_email')))
    .limit(1);
  if (!row) return 'invalid';
  if (row.usedAt) return 'already';
  if (row.expiresAt < now) return 'expired';

  let claimed: { id: string }[];
  try {
    [claimed] = await db.batch([
    db.update(emailTokens).set({ usedAt: now }).where(and(
      eq(emailTokens.id, row.id), isNull(emailTokens.usedAt), sql`${emailTokens.expiresAt} > unixepoch()`,
      sql`EXISTS (SELECT 1 FROM ${accounts} WHERE ${accounts.id} = ${row.accountId} AND ${accounts.status} IN ('active', 'pending_email'))`,
    )).returning({ id: emailTokens.id }),
    db
      .update(accounts)
      .set({
        emailVerifiedAt: now,
        // A dashboard email change waits here until this link is opened (migration 0061).
        email: sql`COALESCE(${accounts.pendingEmail}, ${accounts.email})`,
        pendingEmail: null,
        status: sql`CASE WHEN ${accounts.status} = 'pending_email' THEN 'active' ELSE ${accounts.status} END`,
        updatedAt: now,
      })
      .where(and(eq(accounts.id, row.accountId), sql`changes() = 1`)),
  ]);
  } catch (error) {
    // The pending address was taken by another account meanwhile; the token stays unused.
    console.error('[account] verify failed', error instanceof Error ? error.message : error);
    return 'invalid';
  }
  return claimed.length ? 'verified' : 'invalid';
}

/* ------------------------------------------------------------------------ */
/* Sign-in / out                                                             */
/* ------------------------------------------------------------------------ */

export type AccountSignInResult =
  | { ok: true; token: string; expiresAt: Date; account: Account }
  | { ok: false; reason: 'invalid' | 'locked' | 'unverified' | 'suspended' };

export async function accountSignIn(email: string, password: string, userAgent: string | null): Promise<AccountSignInResult> {
  const db = getDb();
  const now = new Date();
  const [account] = await db.select().from(accounts).where(eq(accounts.email, email)).limit(1);

  if (!account) {
    await hashPassword(password);
    return { ok: false, reason: 'invalid' };
  }
  if (account.lockedUntil && account.lockedUntil > now) return { ok: false, reason: 'locked' };

  const valid = await verifyPassword(password, account.passwordHash);
  if (!valid) {
    const [after] = await db
      .update(accounts)
      .set({
        failedAttempts: sql`CASE WHEN ${accounts.failedAttempts} + 1 >= ${MAX_FAILED_ATTEMPTS} THEN 0 ELSE ${accounts.failedAttempts} + 1 END`,
        lockedUntil: sql`CASE WHEN ${accounts.failedAttempts} + 1 >= ${MAX_FAILED_ATTEMPTS} THEN unixepoch() + ${LOCKOUT_SECONDS} ELSE ${accounts.lockedUntil} END`,
        updatedAt: now,
      })
      .where(eq(accounts.id, account.id))
      .returning({ lockedUntil: accounts.lockedUntil });
    return { ok: false, reason: after?.lockedUntil && after.lockedUntil > now ? 'locked' : 'invalid' };
  }
  // Only after a correct password: an unverified or suspended account is told
  // it cannot sign in yet, which reveals nothing to someone without the password.
  if (account.status === 'pending_email') return { ok: false, reason: 'unverified' };
  if (account.status === 'suspended') return { ok: false, reason: 'suspended' };
  if (account.status !== 'active') return { ok: false, reason: 'invalid' };

  const token = randomToken();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000);
  const tokenHash = await sha256Hex(token);
  const [inserted] = await db.batch([
    db.insert(accountSessions).select(db.select({
      id: sql<string>`${id('ses')}`.as('id'),
      tokenHash: sql<string>`${tokenHash}`.as('token_hash'),
      accountId: accounts.id,
      expiresAt: sql<number>`${Math.floor(expiresAt.getTime() / 1000)}`.as('expires_at'),
      revokedAt: sql<null>`NULL`.as('revoked_at'),
      userAgent: sql<string | null>`${userAgent?.slice(0, 200) ?? null}`.as('user_agent'),
      createdAt: sql<number>`${Math.floor(now.getTime() / 1000)}`.as('created_at'),
    }).from(accounts).where(and(
      eq(accounts.id, account.id), eq(accounts.status, 'active'),
      eq(accounts.passwordHash, account.passwordHash),
      sql`${accounts.lastChangeId} IS ${account.lastChangeId}`,
      sql`(${accounts.lockedUntil} IS NULL OR ${accounts.lockedUntil} <= unixepoch())`,
    ))).returning({ id: accountSessions.id }),
    db
      .update(accounts)
      .set({ failedAttempts: 0, lockedUntil: null, lastLoginAt: now, updatedAt: now })
      .where(and(eq(accounts.id, account.id), sql`changes() = 1`)),
  ]);
  if (!inserted.length) return { ok: false, reason: 'invalid' };
  return { ok: true, token, expiresAt, account };
}

export async function revokeAccountSession(token: string): Promise<void> {
  const db = getDb();
  await db
    .update(accountSessions)
    .set({ revokedAt: new Date() })
    .where(eq(accountSessions.tokenHash, await sha256Hex(token)));
}

export function accountCookie(token: string, expiresAt: Date, secure: boolean): string {
  const parts = [`${ACCOUNT_COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Expires=${expiresAt.toUTCString()}`];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function clearedAccountCookie(secure: boolean): string {
  const parts = [`${ACCOUNT_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

/* ------------------------------------------------------------------------ */
/* Reading the current account                                               */
/* ------------------------------------------------------------------------ */

async function principalForToken(token: string | undefined): Promise<AccountPrincipal | null> {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const db = getDb();
  const [row] = await db
    .select({ session: accountSessions, account: accounts })
    .from(accountSessions)
    .innerJoin(accounts, eq(accountSessions.accountId, accounts.id))
    .where(
      and(
        eq(accountSessions.tokenHash, await sha256Hex(token)),
        isNull(accountSessions.revokedAt),
        gt(accountSessions.expiresAt, new Date()),
        eq(accounts.status, 'active'),
      ),
    )
    .limit(1);
  if (!row) return null;
  return {
    id: row.account.id,
    email: row.account.email,
    name: row.account.name,
    tier: row.account.tier as AccountTier,
    status: row.account.status,
    verificationStatus: row.account.verificationStatus,
    termsVersion: row.account.termsVersion,
    ruoVersion: row.account.ruoVersion,
    sessionId: row.session.id,
  };
}

export async function getAccount(): Promise<AccountPrincipal | null> {
  const jar = await cookies();
  return principalForToken(jar.get(ACCOUNT_COOKIE)?.value);
}

export async function getAccountFromRequest(request: Request): Promise<AccountPrincipal | null> {
  const cookie = request.headers.get('cookie') ?? '';
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${ACCOUNT_COOKIE}=([a-f0-9]{64})`));
  return principalForToken(match?.[1]);
}

export function accountTokenFromRequest(request: Request): string | null {
  const cookie = request.headers.get('cookie') ?? '';
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${ACCOUNT_COOKIE}=([a-f0-9]{64})`));
  return match?.[1] ?? null;
}

export async function requireAccount(returnTo = '/account'): Promise<AccountPrincipal> {
  const account = await getAccount();
  if (account) return account;
  redirect(`/account/sign-in?return_to=${encodeURIComponent(safeAccountReturnPath(returnTo))}`);
}

/** Only relative paths on this site are honoured as return targets. */
export function safeAccountReturnPath(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/account';
  if (/[\s<>"'\\]/.test(value)) return '/account';
  if (value.startsWith('/manage') || value.startsWith('/staff') || value.startsWith('/api')) return '/account';
  return value;
}
