import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { getDb } from '@/db';
import {
  accounts,
  affiliateCommissions,
  affiliatePayouts,
  affiliateReferrals,
  affiliates,
  orders,
  type AffiliateRow,
} from '@/db/schema';
import {
  AFFILIATE_COPY,
  DEFAULT_COMMISSION_BPS,
  DEFAULT_HOLD_DAYS,
  DEFAULT_PAYOUT_THRESHOLD_CENTS,
  commissionBasisCents,
  commissionCents,
  generateAffiliateCode,
  normaliseAffiliateCode,
  payoutReadiness,
  totalCommissions,
  validateApplication,
  vestingDate,
  type AffiliateApplication,
} from '@/lib/affiliate-rules';
import { AFFILIATE_AGREEMENT_VERSION } from '@/lib/policy';
import { AFFILIATE_SETTING_KEYS, readSettings, writeSettings } from '@/lib/settings';
import { affiliateProgramEnabled } from '@/lib/site-config';
import { safeAdd } from '@/lib/safe-integer';
import type { StaffPrincipal } from '@/lib/staff-auth';

/**
 * The affiliate programme (owner, 16 Sep 2026).
 *
 * Commission accrues when an order is written, vests only after delivery plus a hold, and is
 * reversed by a refund. It is calculated on the material subtotal after any promo code, so a
 * partner never earns on shipping or on sales tax. Payment is manual, like every other payment
 * here: staff send it and record the confirmation.
 */

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
}

/**
 * Whether a write failed on a unique index. The query wrapper puts its own sentence in
 * `message` and keeps the driver's text in `cause`, so only the whole chain can be trusted.
 */
function isUniqueViolation(error: unknown, index?: string): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;
  let text = '';
  while (current instanceof Error && !seen.has(current)) {
    seen.add(current);
    text += `${current.message}\n`;
    current = (current as { cause?: unknown }).cause;
  }
  if (!/UNIQUE constraint failed/i.test(text)) return false;
  return index ? text.includes(index) : true;
}

export type AffiliateSettings = { commissionBps: number; payoutThresholdCents: number; holdDays: number };

function positiveInt(raw: string | undefined, fallback: number): number {
  const text = (raw ?? '').trim();
  // An unset setting must fall back, and Number('') is 0, which would silently mean a zero
  // commission rate and a zero-day hold.
  if (!text) return fallback;
  const value = Number(text);
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

export async function affiliateSettings(): Promise<AffiliateSettings> {
  const map = await readSettings();
  return {
    commissionBps: positiveInt(map[AFFILIATE_SETTING_KEYS.commissionBps], DEFAULT_COMMISSION_BPS),
    payoutThresholdCents: positiveInt(map[AFFILIATE_SETTING_KEYS.payoutThresholdCents], DEFAULT_PAYOUT_THRESHOLD_CENTS),
    holdDays: positiveInt(map[AFFILIATE_SETTING_KEYS.holdDays], DEFAULT_HOLD_DAYS),
  };
}

export type AffiliateSettingsInput = { commissionBps: number; payoutThresholdCents: number; holdDays: number };

/**
 * The programme-wide numbers, set by an administrator on /manage/affiliates. Changing the
 * default rate deliberately does NOT reprice existing partners: each partner's rate is stored
 * on their own record when they are taken on, and is changed one at a time with setCommissionRate.
 */
export async function saveAffiliateSettings(
  input: AffiliateSettingsInput,
  staff: StaffPrincipal,
): Promise<StaffOutcome> {
  const { commissionBps, payoutThresholdCents, holdDays } = input;
  if (!Number.isInteger(commissionBps) || commissionBps < 0 || commissionBps > 5000)
    return { ok: false, error: 'Enter a default commission between 0% and 50%.' };
  if (!Number.isInteger(payoutThresholdCents) || payoutThresholdCents < 0 || payoutThresholdCents > 1_000_000)
    return { ok: false, error: 'Enter a payout minimum between $0 and $10,000.' };
  if (!Number.isInteger(holdDays) || holdDays < 0 || holdDays > 365)
    return { ok: false, error: 'Enter a hold between 0 and 365 days.' };
  await writeSettings(
    {
      [AFFILIATE_SETTING_KEYS.commissionBps]: String(commissionBps),
      [AFFILIATE_SETTING_KEYS.payoutThresholdCents]: String(payoutThresholdCents),
      [AFFILIATE_SETTING_KEYS.holdDays]: String(holdDays),
    },
    staff,
  );
  return { ok: true };
}

export async function affiliateForAccount(accountId: string): Promise<AffiliateRow | null> {
  const [row] = await getDb().select().from(affiliates).where(eq(affiliates.accountId, accountId)).limit(1);
  return row ?? null;
}

/** A code only resolves while the partner is approved and has accepted the current agreement. */
export async function approvedAffiliateByCode(codeRaw: string): Promise<AffiliateRow | null> {
  const code = normaliseAffiliateCode(codeRaw);
  if (!code) return null;
  const [row] = await getDb()
    .select()
    .from(affiliates)
    .where(and(eq(affiliates.code, code), eq(affiliates.status, 'approved')))
    .limit(1);
  return row && row.agreementVersion === AFFILIATE_AGREEMENT_VERSION ? row : null;
}

export type ApplyResult = { ok: true; affiliate: AffiliateRow } | { ok: false; errors: string[] };

/** A customer applies. Nothing goes live until a person approves it. */
export async function applyForAffiliate(
  account: { id: string; name: string },
  raw: AffiliateApplication,
  now = new Date(),
): Promise<ApplyResult> {
  if (!affiliateProgramEnabled()) return { ok: false, errors: [AFFILIATE_COPY.closed] };
  const validated = validateApplication(raw);
  if (!validated.ok) return validated;
  const db = getDb();
  const existing = await affiliateForAccount(account.id);
  if (existing) {
    // Re-applying after a decline is allowed; an open or approved application is not replaced.
    if (existing.status !== 'declined') return { ok: false, errors: [AFFILIATE_COPY.duplicate] };
    await db
      .update(affiliates)
      .set({
        status: 'applied',
        audience: validated.value.audience,
        channels: validated.value.channels,
        payoutEmail: validated.value.payoutEmail,
        agreementVersion: AFFILIATE_AGREEMENT_VERSION,
        agreementAcceptedAt: now,
        appliedAt: now,
        decidedAt: null,
        decidedBy: null,
        decisionNote: null,
        updatedAt: now,
      })
      .where(eq(affiliates.id, existing.id));
    return { ok: true, affiliate: (await affiliateForAccount(account.id))! };
  }

  const settings = await affiliateSettings();
  // A code collision is vanishingly unlikely but is retried rather than surfaced.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateAffiliateCode(account.name);
    try {
      await db.insert(affiliates).values({
        id: newId('aff'),
        accountId: account.id,
        code,
        status: 'applied',
        commissionBps: settings.commissionBps,
        audience: validated.value.audience,
        channels: validated.value.channels,
        payoutEmail: validated.value.payoutEmail,
        appliedAt: now,
        agreementVersion: AFFILIATE_AGREEMENT_VERSION,
        agreementAcceptedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      return { ok: true, affiliate: (await affiliateForAccount(account.id))! };
    } catch (error) {
      if (!isUniqueViolation(error, 'affiliates.code')) throw error;
    }
  }
  return { ok: false, errors: [AFFILIATE_COPY.unavailable] };
}

/**
 * Binds a new account to the partner whose link brought them, once and permanently. Called at
 * account creation only: an account that already exists was not introduced by anyone, and a
 * partner cannot claim their own account.
 */
export async function bindReferral(
  codeRaw: string,
  accountId: string,
  meta: { clientAddress?: string | null; userAgent?: string | null } = {},
  now = new Date(),
): Promise<boolean> {
  if (!affiliateProgramEnabled()) return false;
  const affiliate = await approvedAffiliateByCode(codeRaw);
  if (!affiliate || affiliate.accountId === accountId) return false;
  try {
    await getDb().insert(affiliateReferrals).values({
      id: newId('afr'),
      affiliateId: affiliate.id,
      accountId,
      code: affiliate.code,
      boundAt: now,
      clientAddress: meta.clientAddress ?? null,
      userAgent: meta.userAgent ? meta.userAgent.slice(0, 300) : null,
    });
    return true;
  } catch (error) {
    // The unique index on account_id is what makes first touch permanent.
    if (isUniqueViolation(error)) return false;
    throw error;
  }
}

/**
 * Accrues the commission for an order that has just been written. Returns the amount, or 0 when
 * the buyer came from nobody. Called inside a try/catch by the order path: a partner's
 * commission must never be the reason a customer's order fails.
 */
export async function accrueCommission(
  order: { id: string; orderNumber: string; accountId: string; subtotalCents: number; discountCents?: number | null },
  now = new Date(),
): Promise<number> {
  if (!affiliateProgramEnabled()) return 0;
  const db = getDb();
  const [referral] = await db
    .select({
      affiliateId: affiliateReferrals.affiliateId,
      independentVerifiedAt: affiliateReferrals.independentVerifiedAt,
      independentVerifiedBy: affiliateReferrals.independentVerifiedBy,
    })
    .from(affiliateReferrals)
    .where(eq(affiliateReferrals.accountId, order.accountId))
    .limit(1);
  // A public referral cookie proves attribution, not that the buyer is independent. Commissions
  // fail closed until staff have verified independence using payment/shipping identity or another
  // documented signal. This prevents affiliates from earning through secondary accounts they own.
  if (!referral?.independentVerifiedAt || !referral.independentVerifiedBy) return 0;
  const [affiliate] = await db.select().from(affiliates).where(eq(affiliates.id, referral.affiliateId)).limit(1);
  if (!affiliate || affiliate.status !== 'approved' || affiliate.accountId === order.accountId) return 0;

  const basisCents = commissionBasisCents(order);
  const amountCents = commissionCents(basisCents, affiliate.commissionBps);
  if (amountCents <= 0) return 0;
  try {
    await db.insert(affiliateCommissions).values({
      id: newId('afc'),
      affiliateId: affiliate.id,
      orderId: order.id,
      orderNumber: order.orderNumber,
      accountId: order.accountId,
      basisCents,
      rateBps: affiliate.commissionBps,
      amountCents,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    });
    return amountCents;
  } catch (error) {
    // One commission per order, ever; a retry of the same order is not a second earning.
    if (isUniqueViolation(error)) return 0;
    throw error;
  }
}

/** A refund or a cancellation takes the commission back, whether or not it had vested. */
export async function reverseCommissionForOrder(orderId: string, reason: string, now = new Date()): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .update(affiliateCommissions)
    .set({ status: 'reversed', reversedAt: now, reversedReason: reason.slice(0, 120), updatedAt: now })
    .where(and(eq(affiliateCommissions.orderId, orderId), inArray(affiliateCommissions.status, ['pending', 'vested'])))
    .returning({ id: affiliateCommissions.id, payoutId: affiliateCommissions.payoutId });
  if (rows.length === 0) return false;

  // A commission can already be sitting in a payout batch that has been prepared but not sent.
  // Reversing it without touching the batch leaves staff a total to send that includes money the
  // partner is no longer owed, and the batch would still be counted in their tax-year total. So the
  // batch is rebuilt from what actually remains, and cancelled if nothing does.
  for (const payoutId of new Set(rows.map((row) => row.payoutId).filter((id): id is string => Boolean(id)))) {
    const [payout] = await db.select().from(affiliatePayouts).where(eq(affiliatePayouts.id, payoutId)).limit(1);
    if (!payout || payout.status !== 'pending') continue;
    const remaining = await db
      .select({ amountCents: affiliateCommissions.amountCents })
      .from(affiliateCommissions)
      .where(and(eq(affiliateCommissions.payoutId, payoutId), eq(affiliateCommissions.status, 'vested')));
    let amountCents: number;
    try {
      amountCents = remaining.reduce((sum, row) => safeAdd(sum, row.amountCents, 'Payout total'), 0);
    } catch {
      await db
        .update(affiliatePayouts)
        .set({ status: 'cancelled', note: 'Commission total exceeded the safe accounting range.' })
        .where(and(eq(affiliatePayouts.id, payoutId), eq(affiliatePayouts.status, 'pending')));
      continue;
    }
    if (remaining.length === 0) {
      await db
        .update(affiliatePayouts)
        .set({ status: 'cancelled', note: 'Every commission in this batch was reversed before it was sent.' })
        .where(and(eq(affiliatePayouts.id, payoutId), eq(affiliatePayouts.status, 'pending')));
      continue;
    }
    await db
      .update(affiliatePayouts)
      .set({
        amountCents,
        commissionCount: remaining.length,
        note: 'Reduced: a commission in this batch was reversed before it was sent.',
      })
      .where(and(eq(affiliatePayouts.id, payoutId), eq(affiliatePayouts.status, 'pending')));
  }
  return true;
}

export type AffiliateSweep = { ok: true; skipped?: true; dated: number; vested: number; reversed: number };

/**
 * The cron pass. Three steps, each idempotent: date a delivered order's commission, vest it once
 * the hold has run, and reverse anything whose order was cancelled or refunded in the meantime.
 */
export async function sweepAffiliateCommissions(now = new Date()): Promise<AffiliateSweep> {
  if (!affiliateProgramEnabled()) return { ok: true, skipped: true, dated: 0, vested: 0, reversed: 0 };
  const db = getDb();
  const { holdDays } = await affiliateSettings();

  const reversedRows = await db
    .update(affiliateCommissions)
    .set({ status: 'reversed', reversedAt: now, reversedReason: 'order cancelled or refunded', updatedAt: now })
    .where(
      and(
        inArray(affiliateCommissions.status, ['pending', 'vested']),
        isNull(affiliateCommissions.payoutId),
        sql`EXISTS (SELECT 1 FROM ${orders} o WHERE o.id = ${affiliateCommissions.orderId}
             AND (o.status = 'cancelled' OR COALESCE(o.refund_cents, 0) > 0))`,
      ),
    )
    .returning({ id: affiliateCommissions.id });

  const pending = await db
    .select({ id: affiliateCommissions.id, deliveredAt: orders.deliveredAt })
    .from(affiliateCommissions)
    .innerJoin(orders, eq(orders.id, affiliateCommissions.orderId))
    .where(and(eq(affiliateCommissions.status, 'pending'), isNull(affiliateCommissions.vestsAt)))
    .limit(500);
  let dated = 0;
  for (const row of pending) {
    if (!row.deliveredAt) continue;
    await db
      .update(affiliateCommissions)
      .set({ vestsAt: vestingDate(row.deliveredAt, holdDays), updatedAt: now })
      .where(and(eq(affiliateCommissions.id, row.id), isNull(affiliateCommissions.vestsAt)));
    dated += 1;
  }

  const vestedRows = await db
    .update(affiliateCommissions)
    .set({ status: 'vested', vestedAt: now, updatedAt: now })
    .where(
      and(
        eq(affiliateCommissions.status, 'pending'),
        sql`${affiliateCommissions.vestsAt} IS NOT NULL AND ${affiliateCommissions.vestsAt} <= ${Math.floor(now.getTime() / 1000)}`,
      ),
    )
    .returning({ id: affiliateCommissions.id });

  return { ok: true, dated, vested: vestedRows.length, reversed: reversedRows.length };
}

export type CommissionEntry = {
  id: string;
  orderNumber: string;
  basisCents: number;
  rateBps: number;
  amountCents: number;
  status: string;
  vestsAt: Date | null;
  createdAt: Date;
};

export async function commissionsForAffiliate(affiliateId: string, limit = 200): Promise<CommissionEntry[]> {
  return getDb()
    .select({
      id: affiliateCommissions.id,
      orderNumber: affiliateCommissions.orderNumber,
      basisCents: affiliateCommissions.basisCents,
      rateBps: affiliateCommissions.rateBps,
      amountCents: affiliateCommissions.amountCents,
      status: affiliateCommissions.status,
      vestsAt: affiliateCommissions.vestsAt,
      createdAt: affiliateCommissions.createdAt,
    })
    .from(affiliateCommissions)
    .where(eq(affiliateCommissions.affiliateId, affiliateId))
    .orderBy(desc(affiliateCommissions.createdAt))
    .limit(limit);
}

export type AffiliateDashboard = {
  affiliate: AffiliateRow;
  totals: ReturnType<typeof totalCommissions>;
  referredAccounts: number;
  commissions: CommissionEntry[];
  payouts: { id: string; amountCents: number; status: string; sentAt: Date | null; reference: string | null }[];
  settings: AffiliateSettings;
};

export async function affiliateDashboard(affiliate: AffiliateRow): Promise<AffiliateDashboard> {
  const db = getDb();
  const [commissions, referred, payouts, settings] = await Promise.all([
    commissionsForAffiliate(affiliate.id),
    db
      .select({ n: sql<number>`count(*)` })
      .from(affiliateReferrals)
      .where(eq(affiliateReferrals.affiliateId, affiliate.id)),
    db
      .select({
        id: affiliatePayouts.id,
        amountCents: affiliatePayouts.amountCents,
        status: affiliatePayouts.status,
        sentAt: affiliatePayouts.sentAt,
        reference: affiliatePayouts.reference,
      })
      .from(affiliatePayouts)
      .where(eq(affiliatePayouts.affiliateId, affiliate.id))
      .orderBy(desc(affiliatePayouts.createdAt))
      .limit(50),
    affiliateSettings(),
  ]);
  return {
    affiliate,
    totals: totalCommissions(commissions),
    referredAccounts: Number(referred[0]?.n ?? 0),
    commissions,
    payouts,
    settings,
  };
}

export type AffiliateSummaryRow = {
  id: string;
  code: string;
  status: string;
  name: string;
  email: string;
  commissionBps: number;
  taxFormStatus: string;
  appliedAt: Date;
  referredAccounts: number;
  pendingCents: number;
  vestedCents: number;
  paidCents: number;
};

export type PendingReferralReview = {
  id: string;
  affiliateId: string;
  affiliateName: string;
  affiliateEmail: string;
  buyerName: string;
  buyerEmail: string;
  boundAt: Date;
  clientAddress: string | null;
  userAgent: string | null;
  orderCount: number;
  latestShippingIdentity: string | null;
};

/** Unverified referral attributions with enough context for an administrator to investigate. */
export async function listPendingReferralReviews(): Promise<PendingReferralReview[]> {
  const affiliateAccount = alias(accounts, 'affiliate_account');
  const buyerAccount = alias(accounts, 'buyer_account');
  return getDb()
    .select({
      id: affiliateReferrals.id,
      affiliateId: affiliates.id,
      affiliateName: affiliateAccount.name,
      affiliateEmail: affiliateAccount.email,
      buyerName: buyerAccount.name,
      buyerEmail: buyerAccount.email,
      boundAt: affiliateReferrals.boundAt,
      clientAddress: affiliateReferrals.clientAddress,
      userAgent: affiliateReferrals.userAgent,
      orderCount: sql<number>`(SELECT count(*) FROM ${orders} review_order WHERE review_order.account_id = ${affiliateReferrals.accountId})`,
      latestShippingIdentity: sql<string | null>`(
        SELECT trim(
          COALESCE(review_order.consignee_name, '') || ' · ' ||
          COALESCE(review_order.ship_to_line1, '') || ' · ' ||
          COALESCE(review_order.ship_to_city, '') || ', ' ||
          COALESCE(review_order.ship_to_region, '') || ' ' ||
          COALESCE(review_order.ship_to_postal_code, '') || ' · ' ||
          COALESCE(review_order.contact_email, '')
        )
        FROM ${orders} review_order
        WHERE review_order.account_id = ${affiliateReferrals.accountId}
        ORDER BY review_order.created_at DESC
        LIMIT 1
      )`,
    })
    .from(affiliateReferrals)
    .innerJoin(affiliates, eq(affiliates.id, affiliateReferrals.affiliateId))
    .innerJoin(affiliateAccount, eq(affiliateAccount.id, affiliates.accountId))
    .innerJoin(buyerAccount, eq(buyerAccount.id, affiliateReferrals.accountId))
    .where(isNull(affiliateReferrals.independentVerifiedAt))
    .orderBy(desc(affiliateReferrals.boundAt));
}

/** The staff desk: every partner with what they are owed. */
export async function listAffiliates(): Promise<AffiliateSummaryRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: affiliates.id,
      code: affiliates.code,
      status: affiliates.status,
      commissionBps: affiliates.commissionBps,
      taxFormStatus: affiliates.taxFormStatus,
      appliedAt: affiliates.appliedAt,
      name: accounts.name,
      email: accounts.email,
    })
    .from(affiliates)
    .innerJoin(accounts, eq(accounts.id, affiliates.accountId))
    .orderBy(desc(affiliates.appliedAt));
  if (rows.length === 0) return [];

  const [money, referred] = await Promise.all([
    db
      .select({
        affiliateId: affiliateCommissions.affiliateId,
        status: affiliateCommissions.status,
        total: sql<number>`sum(${affiliateCommissions.amountCents})`,
      })
      .from(affiliateCommissions)
      .groupBy(affiliateCommissions.affiliateId, affiliateCommissions.status),
    db
      .select({ affiliateId: affiliateReferrals.affiliateId, n: sql<number>`count(*)` })
      .from(affiliateReferrals)
      .groupBy(affiliateReferrals.affiliateId),
  ]);
  const counts = new Map(referred.map((r) => [r.affiliateId, Number(r.n)]));
  return rows.map((row) => {
    const mine = money.filter((m) => m.affiliateId === row.id);
    const of = (status: string) => Number(mine.find((m) => m.status === status)?.total ?? 0);
    return {
      ...row,
      referredAccounts: counts.get(row.id) ?? 0,
      pendingCents: of('pending'),
      vestedCents: of('vested'),
      paidCents: of('paid'),
    };
  });
}

export type StaffOutcome = { ok: true } | { ok: false; error: string };

/**
 * Records an administrator's independence decision and safely catches up eligible orders that
 * arrived while the referral was waiting. Repeating the action is safe: commission order IDs are
 * unique and accrueCommission returns zero for an already-recorded order.
 */
export async function verifyIndependentReferral(
  id: string,
  staff: StaffPrincipal,
  now = new Date(),
): Promise<StaffOutcome & { accruedOrders?: number }> {
  const db = getDb();
  const [referral] = await db
    .update(affiliateReferrals)
    .set({
      independentVerifiedAt: now,
      independentVerifiedBy: `${staff.name} (${staff.id})`,
    })
    .where(and(eq(affiliateReferrals.id, id), isNull(affiliateReferrals.independentVerifiedAt)))
    .returning({ accountId: affiliateReferrals.accountId });
  if (!referral) {
    const [existing] = await db
      .select({ verifiedAt: affiliateReferrals.independentVerifiedAt })
      .from(affiliateReferrals)
      .where(eq(affiliateReferrals.id, id))
      .limit(1);
    return existing?.verifiedAt
      ? { ok: false, error: 'That referral was already reviewed.' }
      : { ok: false, error: 'That referral was not found.' };
  }

  const eligibleOrders = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      accountId: orders.accountId,
      subtotalCents: orders.subtotalCents,
      discountCents: orders.discountCents,
    })
    .from(orders)
    .where(and(
      eq(orders.accountId, referral.accountId),
      inArray(orders.status, ['submitted', 'awaiting_payment', 'paid', 'fulfilling', 'shipped', 'delivered']),
    ));
  let accruedOrders = 0;
  for (const order of eligibleOrders)
    if ((await accrueCommission(order, now)) > 0) accruedOrders++;
  return { ok: true, accruedOrders };
}

/** Approve, decline, suspend or reinstate. Every decision records who made it. */
export async function decideAffiliate(
  id: string,
  decision: 'approved' | 'declined' | 'suspended',
  staff: StaffPrincipal,
  note: string | null,
  now = new Date(),
): Promise<StaffOutcome> {
  const rows = await getDb()
    .update(affiliates)
    .set({
      status: decision,
      decidedAt: now,
      decidedBy: `${staff.name} (${staff.id})`,
      decisionNote: note?.slice(0, 500) ?? null,
      updatedAt: now,
    })
    .where(eq(affiliates.id, id))
    .returning({ id: affiliates.id });
  return rows.length ? { ok: true } : { ok: false, error: 'That partner was not found.' };
}

export async function setCommissionRate(id: string, rateBps: number, now = new Date()): Promise<StaffOutcome> {
  if (!Number.isInteger(rateBps) || rateBps < 0 || rateBps > 5000)
    return { ok: false, error: 'Enter a commission between 0 and 5000 basis points (0 to 50%).' };
  const rows = await getDb()
    .update(affiliates)
    .set({ commissionBps: rateBps, updatedAt: now })
    .where(eq(affiliates.id, id))
    .returning({ id: affiliates.id });
  return rows.length ? { ok: true } : { ok: false, error: 'That partner was not found.' };
}

/**
 * Records that a W-9 has been received and where it is filed. The form itself and the taxpayer
 * identification number are never stored here; `reference` is a locator, nothing more.
 */
export async function recordTaxForm(id: string, reference: string, now = new Date()): Promise<StaffOutcome> {
  const locator = reference.trim().slice(0, 120);
  if (locator.length < 3) return { ok: false, error: 'Say where the completed form is filed.' };
  if (/\b\d{3}-?\d{2}-?\d{4}\b/.test(locator) || /\b\d{2}-?\d{7}\b/.test(locator))
    return { ok: false, error: 'That looks like a taxpayer identification number. Record where the form is filed, never the number.' };
  const rows = await getDb()
    .update(affiliates)
    .set({ taxFormStatus: 'on_file', taxFormReceivedAt: now, taxFormReference: locator, updatedAt: now })
    .where(eq(affiliates.id, id))
    .returning({ id: affiliates.id });
  return rows.length ? { ok: true } : { ok: false, error: 'That partner was not found.' };
}

export type PayoutResult = { ok: true; payoutId: string; amountCents: number } | { ok: false; error: string };

/** Batches every vested, unpaid commission for a partner, once the minimum and the form allow it. */
export async function createPayout(affiliateId: string, staff: StaffPrincipal, now = new Date()): Promise<PayoutResult> {
  const db = getDb();
  const [affiliate] = await db.select().from(affiliates).where(eq(affiliates.id, affiliateId)).limit(1);
  if (!affiliate) return { ok: false, error: 'That partner was not found.' };

  // Claim the commissions first, then build the batch from what was actually claimed.
  //
  // Selecting them and stamping them afterwards is not safe here: two admins pressing the button,
  // or one pressing it twice, would both select the same rows, both insert a payout, and the second
  // unguarded stamp would overwrite the first. That leaves two batches to send for one lot of
  // earnings, and the partner is paid twice. Claiming with `payout_id IS NULL` in the WHERE means
  // only one of them gets the rows, and it also excludes anything a refund reversed in between.
  const payoutId = newId('afp');
  const claimed = await db
    .update(affiliateCommissions)
    .set({ payoutId, updatedAt: now })
    .where(
      and(
        eq(affiliateCommissions.affiliateId, affiliateId),
        eq(affiliateCommissions.status, 'vested'),
        isNull(affiliateCommissions.payoutId),
      ),
    )
    .returning({ id: affiliateCommissions.id, amountCents: affiliateCommissions.amountCents });

  const release = async () => {
    await db
      .update(affiliateCommissions)
      .set({ payoutId: null, updatedAt: now })
      .where(eq(affiliateCommissions.payoutId, payoutId));
  };

  let amountCents: number;
  try {
    amountCents = claimed.reduce((sum, row) => safeAdd(sum, row.amountCents, 'Payout total'), 0);
  } catch {
    await release();
    return { ok: false, error: 'Commission total exceeded the safe accounting range.' };
  }
  const { payoutThresholdCents } = await affiliateSettings();
  const readiness = payoutReadiness(amountCents, payoutThresholdCents, affiliate.taxFormStatus);
  if (!readiness.ready) {
    await release();
    return { ok: false, error: readiness.reason ?? 'Nothing to pay.' };
  }

  try {
    await db.insert(affiliatePayouts).values({
      id: payoutId,
      affiliateId,
      amountCents,
      commissionCount: claimed.length,
      status: 'pending',
      method: 'zelle',
      createdBy: `${staff.name} (${staff.id})`,
      createdAt: now,
    });
  } catch (error) {
    // Without the payout row the claim would strand the commissions, so give them back.
    await release();
    throw error;
  }
  return { ok: true, payoutId, amountCents };
}

/** Staff send the money by hand and record the confirmation; that is what makes it paid. */
export async function markPayoutSent(
  payoutId: string,
  reference: string,
  staff: StaffPrincipal,
  now = new Date(),
): Promise<StaffOutcome> {
  const ref = reference.trim().slice(0, 120);
  if (ref.length < 3) return { ok: false, error: 'Record the payment confirmation reference.' };
  const db = getDb();
  const [rows] = await db.batch([
    db
      .update(affiliatePayouts)
      .set({ status: 'sent', reference: ref, sentAt: now, sentBy: `${staff.name} (${staff.id})` })
      .where(and(eq(affiliatePayouts.id, payoutId), eq(affiliatePayouts.status, 'pending')))
      .returning({ id: affiliatePayouts.id }),
    // Conditioned on the payout id, so this only ever moves the commissions that batch claimed.
    db
      .update(affiliateCommissions)
      .set({ status: 'paid', updatedAt: now })
      .where(
        and(
          eq(affiliateCommissions.payoutId, payoutId),
          eq(affiliateCommissions.status, 'vested'),
          sql`EXISTS (SELECT 1 FROM ${affiliatePayouts} WHERE id = ${payoutId} AND status = 'sent')`,
        ),
      ),
  ]);
  if (rows.length === 0) return { ok: false, error: 'That payout was not found, or it has already been sent.' };
  return { ok: true };
}

/** Releases a batch that was never sent, so its commissions can be batched again. */
export async function cancelPayout(payoutId: string, now = new Date()): Promise<StaffOutcome> {
  const db = getDb();
  const rows = await db
    .update(affiliatePayouts)
    .set({ status: 'cancelled' })
    .where(and(eq(affiliatePayouts.id, payoutId), eq(affiliatePayouts.status, 'pending')))
    .returning({ id: affiliatePayouts.id });
  if (rows.length === 0) return { ok: false, error: 'That payout was not found, or it has already been sent.' };
  await db
    .update(affiliateCommissions)
    .set({ payoutId: null, updatedAt: now })
    .where(eq(affiliateCommissions.payoutId, payoutId));
  return { ok: true };
}

export type PayoutYearRow = {
  affiliateId: string;
  code: string;
  name: string;
  email: string;
  payoutEmail: string | null;
  taxFormStatus: string;
  taxFormReference: string | null;
  paidCents: number;
  payouts: number;
};

/**
 * What each partner was actually paid in a calendar year, which is the figure a contractor
 * information return is prepared from. Only money that left the business counts, so a batch
 * that was created but never sent is not in here.
 */
export async function payoutYearTotals(year: number): Promise<PayoutYearRow[]> {
  const from = Math.floor(Date.UTC(year, 0, 1) / 1000);
  const to = Math.floor(Date.UTC(year + 1, 0, 1) / 1000);
  const rows = await getDb()
    .select({
      affiliateId: affiliates.id,
      code: affiliates.code,
      name: accounts.name,
      email: accounts.email,
      payoutEmail: affiliates.payoutEmail,
      taxFormStatus: affiliates.taxFormStatus,
      taxFormReference: affiliates.taxFormReference,
      paidCents: sql<number>`sum(${affiliatePayouts.amountCents})`,
      payouts: sql<number>`count(*)`,
    })
    .from(affiliatePayouts)
    .innerJoin(affiliates, eq(affiliates.id, affiliatePayouts.affiliateId))
    .innerJoin(accounts, eq(accounts.id, affiliates.accountId))
    .where(
      and(
        eq(affiliatePayouts.status, 'sent'),
        sql`${affiliatePayouts.sentAt} >= ${from} AND ${affiliatePayouts.sentAt} < ${to}`,
      ),
    )
    .groupBy(affiliates.id, affiliates.code, accounts.name, accounts.email, affiliates.payoutEmail, affiliates.taxFormStatus, affiliates.taxFormReference);
  return rows
    .map((row) => ({ ...row, paidCents: Number(row.paidCents), payouts: Number(row.payouts) }))
    .sort((a, b) => b.paidCents - a.paidCents);
}

export type PendingPayoutRow = {
  id: string;
  affiliateId: string;
  code: string;
  name: string;
  payoutEmail: string | null;
  amountCents: number;
  commissionCount: number;
  createdAt: Date;
};

/** Batches prepared but not yet sent: the staff to-do list for actually moving the money. */
export async function listPendingPayouts(): Promise<PendingPayoutRow[]> {
  return getDb()
    .select({
      id: affiliatePayouts.id,
      affiliateId: affiliatePayouts.affiliateId,
      code: affiliates.code,
      name: accounts.name,
      payoutEmail: affiliates.payoutEmail,
      amountCents: affiliatePayouts.amountCents,
      commissionCount: affiliatePayouts.commissionCount,
      createdAt: affiliatePayouts.createdAt,
    })
    .from(affiliatePayouts)
    .innerJoin(affiliates, eq(affiliates.id, affiliatePayouts.affiliateId))
    .innerJoin(accounts, eq(accounts.id, affiliates.accountId))
    .where(eq(affiliatePayouts.status, 'pending'))
    .orderBy(desc(affiliatePayouts.createdAt));
}

export type CommissionLedgerRow = {
  orderNumber: string;
  code: string;
  partner: string;
  basisCents: number;
  rateBps: number;
  amountCents: number;
  status: string;
  createdAt: Date;
  vestedAt: Date | null;
  payoutSentAt: Date | null;
  payoutReference: string | null;
};

/**
 * Every commission with the payout that settled it, for the ledger. This is the export the
 * bookkeeping entry is built from: accrued commission is a liability, and a sent payout
 * discharges it.
 */
export async function commissionLedger(): Promise<CommissionLedgerRow[]> {
  return getDb()
    .select({
      orderNumber: affiliateCommissions.orderNumber,
      code: affiliates.code,
      partner: accounts.name,
      basisCents: affiliateCommissions.basisCents,
      rateBps: affiliateCommissions.rateBps,
      amountCents: affiliateCommissions.amountCents,
      status: affiliateCommissions.status,
      createdAt: affiliateCommissions.createdAt,
      vestedAt: affiliateCommissions.vestedAt,
      payoutSentAt: affiliatePayouts.sentAt,
      payoutReference: affiliatePayouts.reference,
    })
    .from(affiliateCommissions)
    .innerJoin(affiliates, eq(affiliates.id, affiliateCommissions.affiliateId))
    .innerJoin(accounts, eq(accounts.id, affiliates.accountId))
    .leftJoin(affiliatePayouts, eq(affiliatePayouts.id, affiliateCommissions.payoutId))
    .orderBy(desc(affiliateCommissions.createdAt))
    .limit(5000);
}
