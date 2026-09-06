import { and, eq, gt, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { guestOrderKeys, guestOrderSessions } from '@/db/commerce-schema';
import { accounts, orders } from '@/db/schema';
import { getOrderByNumber, getOrderForAccount } from '@/lib/orders';
import type { AccountPrincipal } from '@/lib/account-auth';
import { randomToken, sha256Hex } from '@/lib/staff-auth-core';
import { openCheckoutEnabled } from '@/lib/site-config';

export const RECOVERY_COOKIE = 'nx_order_view';
const CODE_SECONDS = 90 * 24 * 3600;
const VIEW_SECONDS = 24 * 3600;

/** Only the original buyer session may issue/rotate a code. Contact email is NEVER an ownership proof. */
export async function issueOrderRecoveryCode(buyer: AccountPrincipal, number: string) {
  if (!openCheckoutEnabled() || buyer.status !== 'guest') return null;
  const detail = await getOrderForAccount(buyer.id, number);
  if (!detail) return null;
  const token = randomToken(); const now = new Date();
  const expiresAt = new Date(now.getTime() + CODE_SECONDS * 1000);
  const hash = await sha256Hex(token);
  const db = getDb();
  await db.batch([
    db.update(guestOrderKeys).set({ tokenHash: hash, expiresAt, createdAt: now }).where(and(
      eq(guestOrderKeys.orderId, detail.order.id),
      sql`EXISTS (SELECT 1 FROM ${orders} INNER JOIN ${accounts} ON ${accounts.id} = ${orders.accountId}
        WHERE ${orders.id} = ${detail.order.id} AND ${orders.accountId} = ${buyer.id} AND ${accounts.status} = 'guest')`,
    )),
    db.insert(guestOrderKeys).select(db.select({
      orderId: orders.id, tokenHash: sql<string>`${hash}`.as('token_hash'),
      expiresAt: sql<number>`${Math.floor(expiresAt.getTime() / 1000)}`.as('expires_at'),
      createdAt: sql<number>`${Math.floor(now.getTime() / 1000)}`.as('created_at'),
    }).from(orders).innerJoin(accounts, eq(accounts.id, orders.accountId)).where(and(
      eq(orders.id, detail.order.id), eq(orders.accountId, buyer.id), eq(accounts.status, 'guest'),
    ))).onConflictDoNothing(),
    db.delete(guestOrderSessions).where(and(eq(guestOrderSessions.orderId, detail.order.id),
      sql`EXISTS (SELECT 1 FROM ${guestOrderKeys} WHERE ${guestOrderKeys.orderId} = ${detail.order.id} AND ${guestOrderKeys.tokenHash} = ${hash})`)),
  ]);
  const [issued] = await db.select({ id: guestOrderKeys.orderId }).from(guestOrderKeys).where(and(eq(guestOrderKeys.orderId, detail.order.id), eq(guestOrderKeys.tokenHash, hash))).limit(1);
  if (!issued) return null;
  return { code: token, expiresAt: expiresAt.toISOString(), orderNumber: number };
}

/** Exchanges a saved secret for a read-only, ONE-ORDER session. No account session is created. */
export async function recoverOrder(number: string, code: string, secure: boolean) {
  if (!openCheckoutEnabled() || !/^[a-f0-9]{64}$/.test(code)) return null;
  const db = getDb(); const now = new Date();
  const [row] = await db.select({ key: guestOrderKeys, order: orders }).from(guestOrderKeys)
    .innerJoin(orders, eq(orders.id, guestOrderKeys.orderId)).innerJoin(accounts, eq(accounts.id, orders.accountId))
    .where(and(eq(orders.orderNumber, number), eq(guestOrderKeys.tokenHash, await sha256Hex(code)), gt(guestOrderKeys.expiresAt, now), eq(accounts.status, 'guest'))).limit(1);
  if (!row) return null;
  const token = randomToken(); const expiresAt = new Date(Math.min(now.getTime() + VIEW_SECONDS * 1000, row.key.expiresAt.getTime()));
  const tokenHash = await sha256Hex(token);
  const [created] = await db.batch([
    db.insert(guestOrderSessions).select(db.select({ tokenHash: sql<string>`${tokenHash}`.as('token_hash'),
      orderId: guestOrderKeys.orderId, expiresAt: sql<number>`${Math.floor(expiresAt.getTime() / 1000)}`.as('expires_at'),
      createdAt: sql<number>`${Math.floor(now.getTime() / 1000)}`.as('created_at'),
    }).from(guestOrderKeys).where(and(eq(guestOrderKeys.orderId, row.order.id), eq(guestOrderKeys.tokenHash, row.key.tokenHash), gt(guestOrderKeys.expiresAt, now)))).returning(),
  ]);
  if (!created.length) return null;
  return { cookie: `${RECOVERY_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor((expiresAt.getTime() - now.getTime()) / 1000)}${secure ? '; Secure' : ''}` };
}

export async function recoveredOrder(token: string | undefined, number: string) {
  if (!openCheckoutEnabled() || !token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const [grant] = await getDb().select({ number: orders.orderNumber }).from(guestOrderSessions)
    .innerJoin(orders, eq(orders.id, guestOrderSessions.orderId)).innerJoin(accounts, eq(accounts.id, orders.accountId))
    .where(and(eq(guestOrderSessions.tokenHash, await sha256Hex(token)), gt(guestOrderSessions.expiresAt, new Date()), eq(orders.orderNumber, number), eq(accounts.status, 'guest'))).limit(1);
  return grant ? getOrderByNumber(grant.number) : null;
}

export function recoveryTokenFromRequest(request: Request) {
  return (request.headers.get('cookie') ?? '').match(/(?:^|;\s*)nx_order_view=([a-f0-9]{64})(?:;|$)/)?.[1];
}
