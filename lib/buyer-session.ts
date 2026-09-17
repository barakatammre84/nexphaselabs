import { and, eq, gt, isNull } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getDb } from '@/db';
import { accounts, accountSessions } from '@/db/schema';
import {
  getAccount,
  getAccountFromRequest,
  type AccountPrincipal,
} from '@/lib/account-auth';
import { randomToken, sha256Hex } from '@/lib/staff-auth-core';
import { accountRequired, openCheckoutEnabled } from '@/lib/site-config';

export const GUEST_COOKIE = 'nx_guest';
const TTL = 30 * 24 * 60 * 60;
const id = (prefix: string) =>
  `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;

/** Guest tokens never grant a normal account or staff session. */
export async function guestForToken(
  token?: string,
): Promise<AccountPrincipal | null> {
  if (
    !openCheckoutEnabled() ||
    accountRequired() ||
    !token ||
    !/^[a-f0-9]{64}$/.test(token)
  )
    return null;
  const [row] = await getDb()
    .select({ account: accounts, session: accountSessions })
    .from(accountSessions)
    .innerJoin(accounts, eq(accounts.id, accountSessions.accountId))
    .where(
      and(
        eq(accountSessions.tokenHash, await sha256Hex(token)),
        isNull(accountSessions.revokedAt),
        gt(accountSessions.expiresAt, new Date()),
        eq(accounts.status, 'guest'),
      ),
    )
    .limit(1);
  return row
    ? {
        id: row.account.id,
        email: row.account.email,
        name: row.account.name,
        status: row.account.status,
        verificationStatus: row.account.verificationStatus,
        termsVersion: row.account.termsVersion,
        ruoVersion: row.account.ruoVersion,
        tier: 'researcher',
        sessionId: row.session.id,
      }
    : null;
}

export async function getBuyer(): Promise<AccountPrincipal | null> {
  const account = await getAccount();
  if (account) return account;
  const jar = await cookies();
  return guestForToken(jar.get(GUEST_COOKIE)?.value);
}
export async function getBuyerFromRequest(
  request: Request,
): Promise<AccountPrincipal | null> {
  const account = await getAccountFromRequest(request);
  if (account) return account;
  const token = (request.headers.get('cookie') ?? '').match(
    /(?:^|;\s*)nx_guest=([a-f0-9]{64})(?:;|$)/,
  )?.[1];
  return guestForToken(token);
}
export async function requireBuyer(
  returnTo = '/account/orders',
): Promise<AccountPrincipal> {
  const buyer = await getBuyer();
  if (buyer) return buyer;
  // Open checkout has no sign-in wall, so a visitor without a live session goes where an
  // order can be reopened (a recovery code, or signing in) instead of back to the catalog.
  // With an account required there are no guest orders to recover: sign in.
  if (openCheckoutEnabled() && !accountRequired()) redirect('/account/orders/recover');
  redirect(`/account/sign-in?return_to=${encodeURIComponent(returnTo)}`);
}

/** Call only from a same-origin, rate-limited cart POST after validating input. */
export async function createGuestBuyer(secure: boolean) {
  if (!openCheckoutEnabled() || accountRequired())
    throw new Error('Guest checkout disabled');
  const token = randomToken();
  const accountId = id('gst');
  const sessionId = id('gss');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TTL * 1000);
  await getDb().batch([
    getDb()
      .insert(accounts)
      .values({
        id: accountId,
        email: `${accountId}@guest.invalid`,
        name: 'Guest checkout',
        passwordHash: '!guest-no-password-login',
        tier: 'researcher',
        status: 'guest',
        verificationStatus: 'none',
      }),
    getDb()
      .insert(accountSessions)
      .values({
        id: sessionId,
        accountId,
        tokenHash: await sha256Hex(token),
        expiresAt,
      }),
  ]);
  const buyer = await guestForToken(token);
  if (!buyer) throw new Error('Guest session could not be created');
  return {
    buyer,
    cookie: `${GUEST_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${TTL}${secure ? '; Secure' : ''}`,
  };
}
