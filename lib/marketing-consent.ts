import { and, eq, or } from 'drizzle-orm';
import { getDb } from '@/db';
import { marketingConsents, type MarketingConsentRow } from '@/db/schema';
import { normaliseEmail } from '@/lib/account-rules';
import { brevoConfigured, brevoRemoveContact, brevoUpsertContact } from '@/lib/brevo';
import { sendEmail } from '@/lib/email';
import { ENTITY_FOOTER } from '@/lib/entity';
import { publicOrigin } from '@/lib/site-config';
import { sha256Hex } from '@/lib/staff-auth-core';

/**
 * Product-news opt-in (owner, 16 Sep 2026). Double opt-in from every source; this table is
 * the truth and Brevo the synced copy (db/marketing-schema.ts). The confirmation email is a
 * transactional notice about the request itself and goes through lib/email.ts; marketing
 * content only ever leaves through lib/brevo.ts against a confirmed row.
 */
export type ConsentSource = 'sign_up' | 'account' | 'footer';
export type ConsentStatus = 'pending' | 'confirmed' | 'revoked';

export const NEWSLETTER_COPY = {
  requested: 'If that address can receive product news, a confirmation link is on its way. Nothing is sent until it is opened.',
  confirmed: 'Product news confirmed. Every email we send this way carries an unsubscribe link.',
  already: 'Product news was already confirmed for this address.',
  unsubscribed: 'Done. You will not receive product news from us again unless you ask for it.',
  invalid: 'That link is not valid or has already been used.',
  scope: 'Product news only: new materials and released lots, a few times a year. Nothing about effects or use, ever.',
} as const;

const CONFIRM_WINDOW_MS = 30 * 86_400_000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOKEN = /^[a-f0-9]{64}$/;

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
}

export function unsubscribeUrl(token: string): string {
  return `${publicOrigin()}/newsletter/unsubscribe?token=${encodeURIComponent(token)}`;
}

const SOURCE_LABEL: Record<ConsentSource, string> = {
  sign_up: 'when you created your account',
  account: 'from your account page',
  footer: 'from the website',
};

export function consentSourceLabel(source: string): string {
  return SOURCE_LABEL[source as ConsentSource] ?? 'from the website';
}

async function syncToBrevo(row: Pick<MarketingConsentRow, 'id' | 'email' | 'source'>, now: Date): Promise<void> {
  if (!brevoConfigured()) return;
  const result = await brevoUpsertContact(row.email, { NX_SOURCE: row.source, NX_CONSENT: now.toISOString() });
  if (result.ok) await getDb().update(marketingConsents).set({ brevoSyncedAt: now }).where(eq(marketingConsents.id, row.id));
  else console.error('[newsletter] brevo sync failed', result.error);
}

export type ConsentRequest = {
  email: string;
  accountId?: string | null;
  source: ConsentSource;
  clientAddress?: string | null;
  userAgent?: string | null;
  /** The sign-up checkbox relies on the account's own verification email instead of a second message. */
  sendConfirmation?: boolean;
};

/**
 * Records a request and sends the confirmation link. The answer is the same whether the
 * address was unknown, pending or already confirmed, so the form cannot be used to test
 * who is subscribed.
 */
export async function requestConsent(
  input: ConsentRequest,
  now = new Date(),
): Promise<{ ok: true; status: ConsentStatus; confirmToken: string | null }> {
  const email = normaliseEmail(input.email);
  if (!EMAIL.test(email) || email.length > 254) return { ok: true, status: 'pending', confirmToken: null };
  const db = getDb();
  const [existing] = await db.select().from(marketingConsents).where(eq(marketingConsents.email, email)).limit(1);
  if (existing?.status === 'confirmed') return { ok: true, status: 'confirmed', confirmToken: null };
  // A revoked address is a suppression list, and only its owner may come off it. Anyone can type
  // any address into the footer form, so without this an unsubscribed person could be sent a fresh
  // "confirm product news" email by a stranger, repeatedly. Signed in as that address, from the
  // account page, they can still resubscribe themselves.
  if (existing?.status === 'revoked') {
    const ownerAsking =
      input.source === 'account' && Boolean(input.accountId) && input.accountId === existing.accountId;
    if (!ownerAsking) return { ok: true, status: 'revoked', confirmToken: null };
  }

  const confirmToken = randomToken();
  const confirmTokenHash = await sha256Hex(confirmToken);
  const fields = {
    status: 'pending' as const,
    source: input.source,
    requestedAt: now,
    confirmTokenHash,
    accountId: input.accountId ?? existing?.accountId ?? null,
    clientAddress: input.clientAddress ?? null,
    userAgent: input.userAgent ? input.userAgent.slice(0, 300) : null,
    revokedAt: null,
    revokeReason: null,
    updatedAt: now,
  };
  if (existing) await db.update(marketingConsents).set(fields).where(eq(marketingConsents.id, existing.id));
  else
    await db.insert(marketingConsents).values({
      id: newId('mc'),
      email,
      unsubscribeToken: randomToken(),
      consentedAt: null,
      brevoSyncedAt: null,
      createdAt: now,
      ...fields,
    });

  if (input.sendConfirmation !== false) {
    const result = await sendEmail({
      to: email,
      subject: 'Confirm product news from NexPhase Labs',
      text: [
        'Someone asked for product news from NexPhase Labs at this address.',
        '',
        `Confirm: ${publicOrigin()}/newsletter/confirm?token=${confirmToken}`,
        '',
        'If that was not you, ignore this message — nothing is sent unless the link is opened. The link works for 30 days.',
        NEWSLETTER_COPY.scope,
        '',
        'Materials are for laboratory research use only; not for human or veterinary use.',
        '',
        ENTITY_FOOTER,
      ].join('\n'),
      purpose: 'accounts',
    });
    if (!result.ok) console.error('[newsletter] confirmation email failed', result.error);
  }
  return { ok: true, status: 'pending', confirmToken };
}

/** The confirmation link: pending → confirmed, then the Brevo copy. */
export async function confirmConsent(rawToken: string, now = new Date()): Promise<'confirmed' | 'already' | 'invalid'> {
  if (!TOKEN.test(rawToken)) return 'invalid';
  const db = getDb();
  const [row] = await db
    .select()
    .from(marketingConsents)
    .where(eq(marketingConsents.confirmTokenHash, await sha256Hex(rawToken)))
    .limit(1);
  if (!row) return 'invalid';
  if (row.status === 'confirmed') return 'already';
  if (row.requestedAt.getTime() + CONFIRM_WINDOW_MS < now.getTime()) return 'invalid';
  await db
    .update(marketingConsents)
    .set({ status: 'confirmed', consentedAt: now, confirmTokenHash: null, revokedAt: null, revokeReason: null, updatedAt: now })
    .where(and(eq(marketingConsents.id, row.id), eq(marketingConsents.status, 'pending')));
  await syncToBrevo(row, now);
  return 'confirmed';
}

/**
 * The sign-up checkbox: the account's verification link proves the address, so its pending
 * request is confirmed then, without a second email. Returns whether anything changed.
 */
export async function confirmConsentForAccount(accountId: string, now = new Date()): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(marketingConsents)
    .where(and(eq(marketingConsents.accountId, accountId), eq(marketingConsents.status, 'pending'), eq(marketingConsents.source, 'sign_up')))
    .limit(1);
  if (!row) return false;
  await db
    .update(marketingConsents)
    .set({ status: 'confirmed', consentedAt: now, confirmTokenHash: null, updatedAt: now })
    .where(eq(marketingConsents.id, row.id));
  await syncToBrevo(row, now);
  return true;
}

export type ConsentSelector = { unsubscribeToken?: string; email?: string; accountId?: string };

/** Unsubscribe from any path (link, one-click header, account page, Brevo webhook). Idempotent. */
export async function revokeConsent(selector: ConsentSelector, reason: string, now = new Date()): Promise<boolean> {
  const db = getDb();
  const conditions = [];
  if (selector.unsubscribeToken && TOKEN.test(selector.unsubscribeToken)) conditions.push(eq(marketingConsents.unsubscribeToken, selector.unsubscribeToken));
  if (selector.email) conditions.push(eq(marketingConsents.email, normaliseEmail(selector.email)));
  if (selector.accountId) conditions.push(eq(marketingConsents.accountId, selector.accountId));
  if (conditions.length === 0) return false;
  const rows = await db.select().from(marketingConsents).where(or(...conditions));
  if (rows.length === 0) return false;
  for (const row of rows) {
    if (row.status === 'revoked') continue;
    await db
      .update(marketingConsents)
      .set({ status: 'revoked', revokedAt: now, revokeReason: reason.slice(0, 80), confirmTokenHash: null, updatedAt: now })
      .where(eq(marketingConsents.id, row.id));
    if (brevoConfigured()) {
      const result = await brevoRemoveContact(row.email);
      if (!result.ok) console.error('[newsletter] brevo remove failed', result.error);
    }
  }
  return true;
}

/** The row an account is entitled to see: its own, or the one for its address. */
export async function consentForAccount(accountId: string, email: string): Promise<MarketingConsentRow | null> {
  const [row] = await getDb()
    .select()
    .from(marketingConsents)
    .where(or(eq(marketingConsents.accountId, accountId), eq(marketingConsents.email, normaliseEmail(email))))
    .limit(1);
  return row ?? null;
}
