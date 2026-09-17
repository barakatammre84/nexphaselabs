import { env } from 'cloudflare:workers';
import { and, eq, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { accounts, cartItems, cartReminders, marketingConsents, products, productVariants } from '@/db/schema';
import { brevoConfigured, brevoSendMarketing } from '@/lib/brevo';
import { consentSourceLabel, unsubscribeUrl } from '@/lib/marketing-consent';
import { publicOrigin } from '@/lib/site-config';
import { sha256Hex } from '@/lib/staff-auth-core';

/**
 * One reminder for a cart left idle for a day (owner, 16 Sep 2026). Marketing, so it goes
 * only to an active account with a confirmed product-news consent, through lib/brevo.ts,
 * once per cart contents. Names pack sizes and nothing else: the cart reserves no material,
 * and the email says so. Off unless ABANDONED_CART_REMINDERS=true and Brevo is configured.
 */
const IDLE_MIN_HOURS = 24;
const IDLE_MAX_HOURS = 72;
const PER_TICK = 20;

export function cartRemindersEnabled(): boolean {
  return (env.ABANDONED_CART_REMINDERS ?? '').trim() === 'true' && brevoConfigured();
}

export type CartReminderRun = { ok: true; skipped?: true; considered: number; sent: number };

export async function cartContentsFingerprint(lines: { variantId: string; quantity: number }[]): Promise<string> {
  const canonical = lines
    .map((line) => `${line.variantId}:${line.quantity}`)
    .sort()
    .join('|');
  return sha256Hex(canonical);
}

export async function sendCartReminders(now = new Date(), fetchImpl: typeof fetch = fetch): Promise<CartReminderRun> {
  if (!cartRemindersEnabled()) return { ok: true, skipped: true, considered: 0, sent: 0 };
  const db = getDb();
  const newest = Math.floor((now.getTime() - IDLE_MIN_HOURS * 3_600_000) / 1000);
  const oldest = Math.floor((now.getTime() - IDLE_MAX_HOURS * 3_600_000) / 1000);
  const idle = await db
    .select({ accountId: cartItems.accountId })
    .from(cartItems)
    .groupBy(cartItems.accountId)
    .having(and(sql`max(${cartItems.updatedAt}) <= ${newest}`, sql`max(${cartItems.updatedAt}) >= ${oldest}`))
    .limit(PER_TICK * 5);

  let sent = 0;
  for (const { accountId } of idle) {
    if (sent >= PER_TICK) break;
    const [account] = await db
      .select({ id: accounts.id, email: accounts.email, name: accounts.name, status: accounts.status })
      .from(accounts)
      .where(eq(accounts.id, accountId))
      .limit(1);
    if (!account || account.status !== 'active') continue;
    const [consent] = await db
      .select()
      .from(marketingConsents)
      .where(and(eq(marketingConsents.status, 'confirmed'), sql`(${marketingConsents.accountId} = ${account.id} OR ${marketingConsents.email} = ${account.email})`))
      .limit(1);
    if (!consent) continue;

    const lines = await db
      .select({
        variantId: cartItems.variantId,
        quantity: cartItems.quantity,
        productName: products.name,
        pack: productVariants.quantity,
      })
      .from(cartItems)
      .innerJoin(productVariants, eq(productVariants.id, cartItems.variantId))
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(eq(cartItems.accountId, account.id));
    if (lines.length === 0) continue;
    const fingerprint = await cartContentsFingerprint(lines);
    const [already] = await db
      .select({ id: cartReminders.id })
      .from(cartReminders)
      .where(and(eq(cartReminders.accountId, account.id), eq(cartReminders.cartFingerprint, fingerprint)))
      .limit(1);
    if (already) continue;

    const consentedOn = consent.consentedAt
      ? new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'America/Los_Angeles' }).format(consent.consentedAt)
      : 'earlier';
    const text = [
      `Hello ${account.name},`,
      '',
      'These are still in your NexPhase Labs cart:',
      ...lines.map((line) => `- ${line.productName}, ${line.pack} × ${line.quantity}`),
      '',
      'The cart does not reserve material; released lots are supplied first come, first served.',
      `Your cart: ${publicOrigin()}/account/cart`,
      '',
      `You receive product news because you confirmed it on ${consentedOn} ${consentSourceLabel(consent.source)}.`,
      'Materials are for laboratory research use only; not for human or veterinary use.',
    ].join('\n');
    const result = await brevoSendMarketing(
      { to: consent.email, subject: 'Still in your cart — NexPhase Labs', text, unsubscribeUrl: unsubscribeUrl(consent.unsubscribeToken) },
      consent.status,
      fetchImpl,
    );
    if (!result.ok) {
      console.error('[cart-reminder] send failed', result.error);
      continue;
    }
    await db.insert(cartReminders).values({
      id: `cr_${crypto.randomUUID().replace(/-/g, '')}`,
      accountId: account.id,
      cartFingerprint: fingerprint,
      recipient: consent.email,
      sentAt: now,
      providerId: result.id,
    });
    sent += 1;
  }
  return { ok: true, considered: idle.length, sent };
}
