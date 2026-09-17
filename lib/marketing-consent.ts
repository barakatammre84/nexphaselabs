import { and, asc, eq, isNotNull, isNull, lte, ne, or } from 'drizzle-orm';
import { getDb } from '@/db';
import { marketingConsents, type MarketingConsentRow } from '@/db/schema';
import { normaliseEmail } from '@/lib/account-rules';
import { brevoConfigured, brevoRemoveContact, brevoUpsertContact } from '@/lib/brevo';
import { sendEmail } from '@/lib/email';
import { ENTITY_FOOTER } from '@/lib/entity';
import { publicOrigin } from '@/lib/site-config';
import { sha256Hex } from '@/lib/staff-auth-core';
import { recordCommerceEvent } from '@/lib/commerce-events';

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

/**
 * `brevoSyncedAt` is the moment the Brevo copy was last made to agree with this row: a
 * confirmed row present on the list, or a revoked row removed from it.
 *
 * It is read against the moment the status itself changed (`consentedAt`, `revokedAt`)
 * rather than as a null check, because a marker older than the change it is supposed to
 * cover means the provider is still holding the previous state. That also covers rows
 * written before this sweep existed, where an unsubscribe failed at Brevo and left the
 * confirmation-era marker in place.
 *
 * The web request never depends on Brevo answering. A subscriber whose confirmation
 * landed while Brevo was down is still confirmed here, and an unsubscribe is honoured
 * here whatever the provider does; the sweep is what stops either from being silently
 * stranded, because the confirmation token is spent and the person cannot retry it.
 */
const consentSnapshot = (row: MarketingConsentRow) => and(
  eq(marketingConsents.id, row.id),
  eq(marketingConsents.status, row.status),
  eq(marketingConsents.requestedAt, row.requestedAt),
  eq(marketingConsents.source, row.source),
  row.consentedAt ? eq(marketingConsents.consentedAt, row.consentedAt) : isNull(marketingConsents.consentedAt),
  row.revokedAt ? eq(marketingConsents.revokedAt, row.revokedAt) : isNull(marketingConsents.revokedAt),
  row.confirmTokenHash ? eq(marketingConsents.confirmTokenHash, row.confirmTokenHash) : isNull(marketingConsents.confirmTokenHash),
);

/**
 * Only acknowledge the exact consent state sent to Brevo. If it changed in flight,
 * invalidate even a newer marker (our stale provider call may have finished last),
 * then reconcile the current state once. Further contention stays queued for cron.
 * Pending re-subscriptions must remain OFF the list until confirmed again.
 */
async function syncToBrevo(
  row: MarketingConsentRow,
  now: Date,
  reconcile = true,
): Promise<'synced' | 'failed' | 'deferred'> {
  if (!brevoConfigured()) return 'deferred';
  const db = getDb();
  const result = row.status === 'confirmed'
    ? await brevoUpsertContact(row.email, { NX_SOURCE: row.source, NX_CONSENT: (row.consentedAt ?? now).toISOString() })
    : await brevoRemoveContact(row.email);
  // D1 timestamps have second precision. Strictly newer also repairs legacy
  // revocations whose confirmation and revocation happened in the same second.
  const transition = row.status === 'confirmed' ? row.consentedAt : row.status === 'revoked' ? row.revokedAt : row.requestedAt;
  const syncedAt = new Date(Math.max(now.getTime(), (transition?.getTime() ?? 0) + 1000));
  const changed = await db.update(marketingConsents)
    .set(result.ok ? { brevoSyncedAt: syncedAt } : { brevoSyncedAt: null, updatedAt: now })
    .where(consentSnapshot(row)).returning({ id: marketingConsents.id });
  if (!changed.length) {
    const [current] = await db.update(marketingConsents)
      .set({ brevoSyncedAt: null }).where(eq(marketingConsents.id, row.id)).returning();
    if (current && reconcile) await syncToBrevo(current, now, false);
    return 'deferred';
  }
  if (!result.ok) {
    // Provider bodies can echo an email address; never put those bodies in cron logs.
    console.error('[newsletter] provider sync failed; queued for retry');
    return 'failed';
  }
  return 'synced';
}

/** Retries per tick. Small: this only ever catches a provider outage, not normal traffic. */
const SYNC_RETRIES_PER_SWEEP = 10;

export type MarketingSyncSweep = { ok: true; attempted: number; synced: number; failed: number; deferred: number };

/** Pending re-subscriptions also need removal if an older upsert raced them. */
const awaitingProvider = () =>
  or(
    and(
      eq(marketingConsents.status, 'confirmed'),
      or(isNull(marketingConsents.brevoSyncedAt), lte(marketingConsents.brevoSyncedAt, marketingConsents.consentedAt)),
    ),
    and(
      eq(marketingConsents.status, 'revoked'),
      or(isNull(marketingConsents.brevoSyncedAt), lte(marketingConsents.brevoSyncedAt, marketingConsents.revokedAt)),
    ),
    and(
      eq(marketingConsents.status, 'pending'),
      isNotNull(marketingConsents.consentedAt),
      isNull(marketingConsents.brevoSyncedAt),
    ),
  );

/**
 * The cron pass that finishes what a Brevo outage interrupted: confirmed subscribers who
 * never reached the list, and unsubscribes that never reached it either. Bounded per tick,
 * oldest first; a row that fails again is touched so it rotates behind the others instead
 * of holding the front of the queue forever.
 *
 * Re-read each row just before sending; completion is guarded against consent changes
 * during the call. No contact data is included in the returned cron summary.
 */
export async function sweepMarketingSync(now = new Date()): Promise<MarketingSyncSweep> {
  if (!brevoConfigured()) return { ok: true, attempted: 0, synced: 0, failed: 0, deferred: 0 };
  const db = getDb();
  const rows = await db
    .select()
    .from(marketingConsents)
    .where(awaitingProvider())
    .orderBy(asc(marketingConsents.updatedAt))
    .limit(SYNC_RETRIES_PER_SWEEP);
  let synced = 0;
  let failed = 0;
  let deferred = 0;
  for (const row of rows) {
    const [current] = await db
      .select()
      .from(marketingConsents)
      .where(and(eq(marketingConsents.id, row.id), awaitingProvider()))
      .limit(1);
    if (!current) {
      deferred += 1;
      continue;
    }
    const result = await syncToBrevo(current, now);
    if (result === 'synced') synced++;
    else if (result === 'failed') failed++;
    else deferred++;
  }
  return { ok: true, attempted: rows.length, synced, failed, deferred };
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
    brevoSyncedAt: null,
    updatedAt: now,
  };
  if (existing) {
    const changed = await db.update(marketingConsents).set(fields)
      .where(consentSnapshot(existing)).returning({ id: marketingConsents.id });
    if (!changed.length) {
      // Do not undo an unsubscribe that arrived while the token was being hashed,
      // or send a confirmation token that was never stored.
      const [current] = await db.select({ status: marketingConsents.status })
        .from(marketingConsents).where(eq(marketingConsents.id, existing.id)).limit(1);
      return { ok: true, status: (current?.status ?? 'pending') as ConsentStatus, confirmToken: null };
    }
  } else
    await db.insert(marketingConsents).values({
      id: newId('mc'),
      email,
      unsubscribeToken: randomToken(),
      consentedAt: null,
      createdAt: now,
      ...fields,
    });

  recordCommerceEvent('newsletter_request_accepted', { source: input.source });
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
  const [confirmed] = await db
    .update(marketingConsents)
    .set({ status: 'confirmed', consentedAt: now, confirmTokenHash: null, revokedAt: null, revokeReason: null, brevoSyncedAt: null, updatedAt: now })
    .where(and(consentSnapshot(row), eq(marketingConsents.status, 'pending'))).returning();
  if (!confirmed) return 'invalid';
  recordCommerceEvent('newsletter_confirmed', { source: confirmed.source as ConsentSource });
  await syncToBrevo(confirmed, now);
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
  const [confirmed] = await db
    .update(marketingConsents)
    .set({ status: 'confirmed', consentedAt: now, confirmTokenHash: null, brevoSyncedAt: null, updatedAt: now })
    .where(consentSnapshot(row)).returning();
  if (!confirmed) return false;
  recordCommerceEvent('newsletter_confirmed', { source: 'sign_up' });
  await syncToBrevo(confirmed, now);
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
    // brevoSyncedAt is cleared here because the provider copy no longer agrees with this
    // row: the address is off the list locally and still on it at Brevo. The sweep retries
    // the removal until it lands, so a provider outage cannot strand an unsubscribe.
    const [revoked] = await db
      .update(marketingConsents)
      .set({ status: 'revoked', revokedAt: now, revokeReason: reason.slice(0, 80), confirmTokenHash: null, brevoSyncedAt: null, updatedAt: now })
      .where(and(eq(marketingConsents.id, row.id), ne(marketingConsents.status, 'revoked'))).returning();
    if (revoked) {
      recordCommerceEvent('newsletter_unsubscribed', { source: revoked.source as ConsentSource });
      await syncToBrevo(revoked, now);
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
