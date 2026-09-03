import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getDb } from '@/db';
import { staffEvents, staffSessions, staffUsers, type StaffUser } from '@/db/schema';
import { hashPassword, randomToken, sha256Hex, verifyPassword } from '@/lib/staff-auth-core';

/**
 * Staff authentication.
 *
 *  - Passwords: PBKDF2-SHA256, 100 000 iterations, 16-byte salt, via WebCrypto
 *    (available in Workers without dependencies).
 *  - Sessions: a 32-byte random token in an HttpOnly, Secure, SameSite=Lax
 *    cookie. The database stores only the SHA-256 of the token, so a database
 *    read cannot be replayed as a session.
 *  - Lockout: 10 consecutive failures lock the account for 15 minutes.
 *  - Sign-in and sign-out are POST route handlers that check the Origin
 *    header against the request host, so a cross-site form cannot drive them.
 */

export const SESSION_COOKIE = 'nx_staff';
const SESSION_TTL_SECONDS = 12 * 60 * 60;
const MAX_FAILED_ATTEMPTS = 10;
const LOCKOUT_SECONDS = 15 * 60;

export { hashPassword, passwordPolicyError, sha256Hex, verifyPassword } from '@/lib/staff-auth-core';

export { STAFF_ROLES, type StaffRole } from '@/lib/staff-roles';
import type { StaffRole } from '@/lib/staff-roles';

export type StaffPrincipal = {
  id: string;
  email: string;
  name: string;
  role: StaffRole;
  sessionId: string;
  /** True until the person replaces a one-time password with their own. */
  mustChangePassword: boolean;
};

function eventId(): string {
  return `sev_${randomToken().slice(0, 24)}`;
}

/* ------------------------------------------------------------------------ */
/* Sign in / out                                                             */
/* ------------------------------------------------------------------------ */

export type SignInResult =
  | { ok: true; token: string; expiresAt: Date; user: StaffUser }
  | { ok: false; reason: 'invalid' | 'locked' };

/**
 * Unknown, inactive and wrong-password all answer 'invalid' after a real
 * PBKDF2 run, so nothing about an email address can be learned from the
 * response or its timing. Only 'locked' is distinguishable, and only after
 * ten genuine failures.
 */
export async function signIn(email: string, password: string, userAgent: string | null): Promise<SignInResult> {
  const db = getDb();
  const normalised = email.trim().toLowerCase();
  const [user] = await db.select().from(staffUsers).where(eq(staffUsers.email, normalised)).limit(1);
  const now = new Date();

  if (!user) {
    await hashPassword(password); // burn the same time as a real check
    return { ok: false, reason: 'invalid' };
  }
  const ua = userAgent?.slice(0, 200) ?? null;
  if (user.lockedUntil && user.lockedUntil > now) return { ok: false, reason: 'locked' };

  const valid = await verifyPassword(password, user.passwordHash);
  if (!user.active) {
    await db.insert(staffEvents).values({ id: eventId(), userId: user.id, action: 'sign_in_failed', detail: 'inactive account', actor: 'system', userAgent: ua, createdAt: now });
    return { ok: false, reason: 'invalid' };
  }

  if (!valid) {
    // Atomic increment: concurrent guesses cannot read the same count and
    // all stay below the threshold. When the threshold is reached the row is
    // locked and the counter reset in the same statement.
    const [after] = await db
      .update(staffUsers)
      .set({
        failedAttempts: sql`CASE WHEN ${staffUsers.failedAttempts} + 1 >= ${MAX_FAILED_ATTEMPTS} THEN 0 ELSE ${staffUsers.failedAttempts} + 1 END`,
        lockedUntil: sql`CASE WHEN ${staffUsers.failedAttempts} + 1 >= ${MAX_FAILED_ATTEMPTS} THEN unixepoch() + ${LOCKOUT_SECONDS} ELSE ${staffUsers.lockedUntil} END`,
        updatedAt: now,
      })
      .where(eq(staffUsers.id, user.id))
      .returning({ lockedUntil: staffUsers.lockedUntil });
    const locked = Boolean(after?.lockedUntil && after.lockedUntil > now);
    await db.insert(staffEvents).values({
      id: eventId(),
      userId: user.id,
      action: locked ? 'locked' : 'sign_in_failed',
      detail: locked ? `wrong password; locked for ${LOCKOUT_SECONDS / 60} minutes` : 'wrong password',
      actor: 'system',
      userAgent: ua,
      createdAt: now,
    });
    return { ok: false, reason: locked ? 'locked' : 'invalid' };
  }

  const token = randomToken();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000);
  const sessionId = `ses_${randomToken().slice(0, 24)}`;
  await db.batch([
    db.insert(staffSessions).values({ id: sessionId, tokenHash: await sha256Hex(token), userId: user.id, expiresAt, userAgent: ua }),
    db.update(staffUsers).set({ failedAttempts: 0, lockedUntil: null, lastLoginAt: now, updatedAt: now }).where(eq(staffUsers.id, user.id)),
    db.insert(staffEvents).values({ id: eventId(), userId: user.id, action: 'sign_in', detail: `session ${sessionId}`, actor: 'self', userAgent: ua, createdAt: now }),
  ]);

  return { ok: true, token, expiresAt, user };
}

export async function revokeSessionByToken(token: string): Promise<void> {
  const db = getDb();
  await db
    .update(staffSessions)
    .set({ revokedAt: new Date() })
    .where(eq(staffSessions.tokenHash, await sha256Hex(token)));
}

export function sessionCookie(token: string, expiresAt: Date, secure: boolean): string {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Expires=${expiresAt.toUTCString()}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function clearedSessionCookie(secure: boolean): string {
  const parts = [`${SESSION_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

/* ------------------------------------------------------------------------ */
/* Reading the current principal                                             */
/* ------------------------------------------------------------------------ */

async function principalForToken(token: string | undefined): Promise<StaffPrincipal | null> {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const db = getDb();
  const tokenHash = await sha256Hex(token);
  const [row] = await db
    .select({ session: staffSessions, user: staffUsers })
    .from(staffSessions)
    .innerJoin(staffUsers, eq(staffSessions.userId, staffUsers.id))
    .where(
      and(
        eq(staffSessions.tokenHash, tokenHash),
        isNull(staffSessions.revokedAt),
        gt(staffSessions.expiresAt, new Date()),
        eq(staffUsers.active, true),
      ),
    )
    .limit(1);
  if (!row) return null;
  return {
    id: row.user.id,
    email: row.user.email,
    name: row.user.name,
    role: row.user.role as StaffRole,
    sessionId: row.session.id,
    mustChangePassword: row.user.mustChangePassword,
  };
}

/**
 * The session holder regardless of password state. Only the password page,
 * the password route and sign-out use this; everything else goes through
 * getStaff / getStaffFromRequest, which treat a one-time password as no
 * session at all so no data can be read or written with a password an admin
 * has seen.
 */
export async function getStaffIncludingPasswordChange(): Promise<StaffPrincipal | null> {
  const jar = await cookies();
  return principalForToken(jar.get(SESSION_COOKIE)?.value);
}

export async function getStaffFromRequestIncludingPasswordChange(request: Request): Promise<StaffPrincipal | null> {
  const cookie = request.headers.get('cookie') ?? '';
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([a-f0-9]{64})`));
  return principalForToken(match?.[1]);
}

/** For server components and server actions. Null while a one-time password is in force. */
export async function getStaff(): Promise<StaffPrincipal | null> {
  const staff = await getStaffIncludingPasswordChange();
  return staff && !staff.mustChangePassword ? staff : null;
}

/** For route handlers, which receive the Request directly. Null while a one-time password is in force. */
export async function getStaffFromRequest(request: Request): Promise<StaffPrincipal | null> {
  const staff = await getStaffFromRequestIncludingPasswordChange(request);
  return staff && !staff.mustChangePassword ? staff : null;
}

/**
 * Redirects to sign-in when there is no valid staff session, and to the
 * password page while a one-time password is still in force — a person
 * signed in with a password an admin has seen can look at nothing else first.
 */
export async function requireStaff(returnTo = '/manage'): Promise<StaffPrincipal> {
  const staff = await getStaffIncludingPasswordChange();
  if (!staff) redirect(`/staff/sign-in?return_to=${encodeURIComponent(safeReturnPath(returnTo))}`);
  if (staff.mustChangePassword) redirect(`/staff/password?return_to=${encodeURIComponent(safeReturnPath(returnTo))}&required=1`);
  return staff;
}

/** Only admins manage staff accounts. */
export function canManageStaff(staff: StaffPrincipal): boolean {
  return staff.role === 'admin';
}

/** Roles allowed to create and edit catalog products. */
export function canEditCatalog(staff: StaffPrincipal): boolean {
  return staff.role === 'admin' || staff.role === 'qc';
}

/** Roles allowed to pick, pack and ship: warehouse and admin, not QC. */
export function canFulfil(staff: StaffPrincipal): boolean {
  return staff.role === 'admin' || staff.role === 'ops';
}

/** Roles allowed to verify customer organisations. */
export function canVerifyAccounts(staff: StaffPrincipal): boolean {
  return staff.role === 'admin';
}

/** Roles allowed to record analytical results and decide lot disposition. */
export function canRecordResults(staff: StaffPrincipal): boolean {
  return staff.role === 'admin' || staff.role === 'qc';
}

export function requireRole(staff: StaffPrincipal, ...roles: StaffRole[]): void {
  if (!roles.includes(staff.role)) {
    throw new Error(`This action requires role ${roles.join(' or ')}.`);
  }
}

/** Only same-origin relative paths under /manage are honoured as return targets. */
export function safeReturnPath(value: string | null | undefined): string {
  if (!value || !value.startsWith('/manage') || value.startsWith('//')) return '/manage';
  if (/[\s<>"'\\]/.test(value)) return '/manage';
  return value;
}

/**
 * CSRF guard for the auth POST handlers: the Origin (or Referer) must match
 * the host the request arrived on.
 */
export function sameOrigin(request: Request): boolean {
  const host = request.headers.get('host');
  const origin = request.headers.get('origin') ?? request.headers.get('referer');
  if (!host || !origin) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function requestIsSecure(): Promise<boolean> {
  const h = await headers();
  return (h.get('x-forwarded-proto') ?? '').includes('https');
}

export function urlIsSecure(request: Request): boolean {
  return new URL(request.url).protocol === 'https:' || (request.headers.get('x-forwarded-proto') ?? '').includes('https');
}
