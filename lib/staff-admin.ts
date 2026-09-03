import { and, desc, eq, gt, isNull, ne, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { staffEvents, staffSessions, staffUsers, type StaffEvent, type StaffUser } from '@/db/schema';
import { hashPassword, passwordPolicyError, randomToken, verifyPassword } from '@/lib/staff-auth-core';
import type { StaffPrincipal, StaffRole } from '@/lib/staff-auth';
import { oneTimePassword } from '@/lib/staff-rules';

/**
 * Staff administration. Admin only (checked by the callers). Every change is
 * an append-only staff_events row naming the actor. Nothing is deleted:
 * people are deactivated, sessions are revoked, passwords are replaced.
 *
 * Two guards protect the business from locking itself out: an admin cannot
 * change their own role or deactivate themselves, and the last active admin
 * cannot be demoted or deactivated.
 */

export type StaffListRow = StaffUser & { activeSessions: number };
export type StaffDetail = { user: StaffUser; sessions: (typeof staffSessions.$inferSelect)[]; events: StaffEvent[] };
export type StaffWriteResult = { ok: true; id: string; oneTimePassword?: string; count?: number } | { ok: false; error: string };

const userId = () => `stf_${randomToken().slice(0, 16)}`;
const eventId = () => `sev_${randomToken().slice(0, 24)}`;
const by = (staff: StaffPrincipal) => `${staff.name} (${staff.id})`;

export async function listStaff(): Promise<StaffListRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      user: staffUsers,
      activeSessions: sql<number>`(SELECT count(*) FROM staff_sessions s WHERE s.user_id = staff_users.id AND s.revoked_at IS NULL AND s.expires_at > unixepoch())`
        .mapWith(Number)
        .as('active_sessions'),
    })
    .from(staffUsers)
    .orderBy(desc(staffUsers.active), staffUsers.name);
  return rows.map((r) => ({ ...r.user, activeSessions: r.activeSessions }));
}

export async function getStaffDetail(id: string): Promise<StaffDetail | null> {
  const db = getDb();
  const [user] = await db.select().from(staffUsers).where(eq(staffUsers.id, id)).limit(1);
  if (!user) return null;
  const [sessions, events] = await Promise.all([
    db.select().from(staffSessions).where(eq(staffSessions.userId, id)).orderBy(desc(staffSessions.createdAt)).limit(20),
    db.select().from(staffEvents).where(eq(staffEvents.userId, id)).orderBy(desc(staffEvents.createdAt)).limit(100),
  ]);
  return { user, sessions, events };
}

async function activeAdminCountExcluding(id: string): Promise<number> {
  const db = getDb();
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(staffUsers)
    .where(and(eq(staffUsers.role, 'admin'), eq(staffUsers.active, true), ne(staffUsers.id, id)));
  return n;
}

export async function createStaffUser(v: { email: string; name: string; role: StaffRole }, actor: StaffPrincipal): Promise<StaffWriteResult> {
  const db = getDb();
  const now = new Date();
  const id = userId();
  const password = oneTimePassword();
  const passwordHash = await hashPassword(password);
  try {
    await db.batch([
      db.insert(staffUsers).values({ id, email: v.email, name: v.name, passwordHash, role: v.role, active: true, mustChangePassword: true, createdBy: actor.id, createdAt: now, updatedAt: now }),
      db.insert(staffEvents).values({ id: eventId(), userId: id, action: 'create', detail: `${v.email} as ${v.role}; one-time password issued`, actor: by(actor), createdAt: now }),
    ]);
  } catch (error) {
    if (/UNIQUE constraint failed/i.test(error instanceof Error ? error.message : String(error))) {
      return { ok: false, error: 'A staff account with that email address already exists.' };
    }
    throw error;
  }
  return { ok: true, id, oneTimePassword: password };
}

export async function setStaffRole(target: StaffUser, role: StaffRole, actor: StaffPrincipal, note: string | null): Promise<StaffWriteResult> {
  if (target.id === actor.id) return { ok: false, error: 'You cannot change your own role. Ask another admin.' };
  if (target.role === role) return { ok: false, error: `${target.name} is already ${role}.` };
  if (target.role === 'admin' && target.active && (await activeAdminCountExcluding(target.id)) === 0) {
    return { ok: false, error: 'This is the last active admin. Promote someone else first.' };
  }
  const db = getDb();
  const now = new Date();
  // The last-admin invariant is re-checked inside the statement so two admins demoting each other
  // at the same moment cannot both succeed; the pre-check above only exists for the friendlier message.
  const keepsAnAdmin =
    target.role === 'admin' && target.active
      ? sql`(SELECT count(*) FROM staff_users a WHERE a.role = 'admin' AND a.active = 1 AND a.id <> ${target.id}) > 0`
      : sql`1 = 1`;
  const changeId = `chg_${randomToken().slice(0, 24)}`;
  const [updated] = await db.batch([
    db
      .update(staffUsers)
      .set({ role, updatedAt: now, lastChangeId: changeId })
      .where(and(eq(staffUsers.id, target.id), eq(staffUsers.role, target.role), keepsAnAdmin))
      .returning({ id: staffUsers.id }),
    db.insert(staffEvents).select(
      db
        .select({
          id: sql<string>`${eventId()}`.as('id'),
          userId: staffUsers.id,
          action: sql<string>`'role'`.as('action'),
          detail: sql<string>`${`${target.role} → ${role}${note ? `; ${note}` : ''}`}`.as('detail'),
          actor: sql<string>`${by(actor)}`.as('actor'),
          userAgent: sql<string | null>`NULL`.as('user_agent'),
          createdAt: sql<number>`${Math.floor(now.getTime() / 1000)}`.as('created_at'),
        })
        .from(staffUsers)
        // Only where this batch's own marker landed — a concurrent identical change cannot reproduce it.
        .where(and(eq(staffUsers.id, target.id), eq(staffUsers.lastChangeId, changeId))),
    ),
  ]);
  if (!updated || updated.length === 0) return { ok: false, error: 'This account changed while you were editing, or it is now the last active admin. Reload and try again.' };
  return { ok: true, id: target.id };
}

export async function setStaffActive(target: StaffUser, active: boolean, actor: StaffPrincipal, reason: string | null): Promise<StaffWriteResult> {
  if (target.id === actor.id) return { ok: false, error: 'You cannot deactivate your own account. Ask another admin.' };
  if (target.active === active) return { ok: false, error: `${target.name} is already ${active ? 'active' : 'inactive'}.` };
  if (!active && target.role === 'admin' && (await activeAdminCountExcluding(target.id)) === 0) {
    return { ok: false, error: 'This is the last active admin. Promote someone else first.' };
  }
  if (!active && !reason) return { ok: false, error: 'Give a reason for deactivating the account.' };
  const db = getDb();
  const now = new Date();
  const keepsAnAdmin =
    !active && target.role === 'admin'
      ? sql`(SELECT count(*) FROM staff_users a WHERE a.role = 'admin' AND a.active = 1 AND a.id <> ${target.id}) > 0`
      : sql`1 = 1`;
  const changeId = `chg_${randomToken().slice(0, 24)}`;
  const statements = [
    db
      .update(staffUsers)
      .set({ active, updatedAt: now, lastChangeId: changeId })
      .where(and(eq(staffUsers.id, target.id), eq(staffUsers.active, !active), keepsAnAdmin))
      .returning({ id: staffUsers.id }),
  ] as unknown[];
  if (!active) {
    // Deactivation ends every live session at the same moment — but only if the deactivation itself landed.
    statements.push(
      db
        .update(staffSessions)
        .set({ revokedAt: now })
        .where(
          and(
            eq(staffSessions.userId, target.id),
            isNull(staffSessions.revokedAt),
            sql`(SELECT u.last_change_id FROM staff_users u WHERE u.id = ${target.id}) = ${changeId}`,
          ),
        ),
    );
  }
  statements.push(
    db.insert(staffEvents).select(
      db
        .select({
          id: sql<string>`${eventId()}`.as('id'),
          userId: staffUsers.id,
          action: sql<string>`${active ? 'reactivate' : 'deactivate'}`.as('action'),
          detail: sql<string | null>`${reason}`.as('detail'),
          actor: sql<string>`${by(actor)}`.as('actor'),
          userAgent: sql<string | null>`NULL`.as('user_agent'),
          createdAt: sql<number>`${Math.floor(now.getTime() / 1000)}`.as('created_at'),
        })
        .from(staffUsers)
        .where(and(eq(staffUsers.id, target.id), eq(staffUsers.lastChangeId, changeId))),
    ),
  );
  const [updated] = await db.batch(statements as unknown as Parameters<typeof db.batch>[0]);
  if (!updated || (updated as unknown[]).length === 0) return { ok: false, error: 'This account changed while you were editing, or it is now the last active admin. Reload and try again.' };
  return { ok: true, id: target.id };
}

/** Issue a new one-time password and end every session. The person must set their own password at next sign-in. */
export async function resetStaffPassword(target: StaffUser, actor: StaffPrincipal): Promise<StaffWriteResult> {
  if (target.id === actor.id) return { ok: false, error: 'Change your own password from the Password page; a reset here would sign you out with a password only this screen has seen.' };
  if (!target.active) return { ok: false, error: 'Reactivate the account before resetting its password.' };
  const db = getDb();
  const now = new Date();
  const password = oneTimePassword();
  const passwordHash = await hashPassword(password);
  await db.batch([
    db.update(staffUsers).set({ passwordHash, mustChangePassword: true, failedAttempts: 0, lockedUntil: null, updatedAt: now }).where(eq(staffUsers.id, target.id)),
    db.update(staffSessions).set({ revokedAt: now }).where(and(eq(staffSessions.userId, target.id), isNull(staffSessions.revokedAt))),
    db.insert(staffEvents).values({ id: eventId(), userId: target.id, action: 'password_reset', detail: 'one-time password issued; all sessions ended', actor: by(actor), createdAt: now }),
  ]);
  return { ok: true, id: target.id, oneTimePassword: password };
}

/** End every live session of the account. On your own account the current session is kept. */
export async function revokeStaffSessions(target: StaffUser, actor: StaffPrincipal): Promise<StaffWriteResult> {
  const db = getDb();
  const now = new Date();
  const self = target.id === actor.id;
  const [revoked] = await db.batch([
    db
      .update(staffSessions)
      .set({ revokedAt: now })
      .where(
        and(
          eq(staffSessions.userId, target.id),
          isNull(staffSessions.revokedAt),
          gt(staffSessions.expiresAt, now),
          ...(self ? [ne(staffSessions.id, actor.sessionId)] : []),
        ),
      )
      .returning({ id: staffSessions.id }),
    db.insert(staffEvents).values({
      id: eventId(),
      userId: target.id,
      action: 'sessions_revoked',
      // The count is filled in by SQL so the row is true even if the revoke matched nothing.
      detail: sql`(SELECT count(*) FROM staff_sessions s WHERE s.user_id = ${target.id} AND s.revoked_at = ${Math.floor(now.getTime() / 1000)}) || ${self ? ' other session(s) ended by the account holder' : ' session(s) ended'}`,
      actor: self ? 'self' : by(actor),
      createdAt: now,
    }),
  ]);
  return { ok: true, id: target.id, count: revoked.length };
}

export type PasswordChangeResult = { ok: true } | { ok: false; error: string };

/** A person sets their own password. Other sessions end; the current one continues. */
export async function changeOwnPassword(staff: StaffPrincipal, current: string, next: string, confirm: string): Promise<PasswordChangeResult> {
  const db = getDb();
  const [user] = await db.select().from(staffUsers).where(eq(staffUsers.id, staff.id)).limit(1);
  if (!user || !user.active) return { ok: false, error: 'Account not found.' };
  const valid = await verifyPassword(current, user.passwordHash);
  if (!valid) return { ok: false, error: 'The current password is not correct.' };
  const policy = passwordPolicyError(next);
  if (policy) return { ok: false, error: policy };
  if (next !== confirm) return { ok: false, error: 'The new password and its confirmation do not match.' };
  if (next === current) return { ok: false, error: 'Choose a password you have not used here before.' };
  const now = new Date();
  const passwordHash = await hashPassword(next);
  await db.batch([
    db.update(staffUsers).set({ passwordHash, mustChangePassword: false, passwordChangedAt: now, failedAttempts: 0, lockedUntil: null, updatedAt: now }).where(eq(staffUsers.id, staff.id)),
    db.update(staffSessions).set({ revokedAt: now }).where(and(eq(staffSessions.userId, staff.id), isNull(staffSessions.revokedAt), ne(staffSessions.id, staff.sessionId))),
    db.insert(staffEvents).values({ id: eventId(), userId: staff.id, action: 'password_changed', detail: 'other sessions ended', actor: 'self', createdAt: now }),
  ]);
  return { ok: true };
}
