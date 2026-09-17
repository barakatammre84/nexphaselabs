import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

/**
 * The affiliate programme (owner, 16 Sep 2026).
 *
 * Partners are approved, never self-serve: this catalogue is governed by what may be said
 * about the material, and an affiliate is a third party saying it. Nothing is deleted here —
 * a partner who breaks the agreement is suspended, and their commission history stays, because
 * it is money owed or paid and has to be reportable at the end of the tax year.
 *
 * The W-9 itself is deliberately NOT stored. `taxFormReference` records where the form lives,
 * the way docs/operations/CREDENTIAL_LOCATIONS.md records where a secret lives. A taxpayer
 * identification number must never enter this database.
 */
export const affiliates = sqliteTable(
  'affiliates',
  {
    id: text('id').primaryKey(),
    /** Every affiliate is first a customer account; that account can never earn on its own orders. */
    accountId: text('account_id').notNull(),
    code: text('code').notNull(),
    /** applied | approved | declined | suspended */
    status: text('status').notNull().default('applied'),
    /** Basis points of the material subtotal after any promo code. 1000 = 10%. */
    commissionBps: integer('commission_bps').notNull().default(1000),
    audience: text('audience'),
    channels: text('channels'),
    appliedAt: integer('applied_at', { mode: 'timestamp' }).notNull(),
    decidedAt: integer('decided_at', { mode: 'timestamp' }),
    decidedBy: text('decided_by'),
    decisionNote: text('decision_note'),
    /** The agreement version the partner accepted; a new version has to be accepted again. */
    agreementVersion: text('agreement_version'),
    agreementAcceptedAt: integer('agreement_accepted_at', { mode: 'timestamp' }),
    /** none | on_file — whether a W-9 has been received. The form and the TIN live elsewhere. */
    taxFormStatus: text('tax_form_status').notNull().default('none'),
    taxFormReceivedAt: integer('tax_form_received_at', { mode: 'timestamp' }),
    taxFormReference: text('tax_form_reference'),
    payoutEmail: text('payout_email'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    uniqueIndex('affiliates_code_idx').on(table.code),
    uniqueIndex('affiliates_account_idx').on(table.accountId),
    index('affiliates_status_idx').on(table.status),
  ],
);

export type AffiliateRow = typeof affiliates.$inferSelect;

/**
 * Which partner introduced a customer. First touch wins and is permanent: the row is written
 * once, when the account is created, and is never moved to another partner. That makes the
 * attribution a fact about the account rather than a contest between cookies, and it means an
 * existing customer cannot be claimed after the fact.
 */
export const affiliateReferrals = sqliteTable(
  'affiliate_referrals',
  {
    id: text('id').primaryKey(),
    affiliateId: text('affiliate_id').notNull(),
    accountId: text('account_id').notNull(),
    code: text('code').notNull(),
    boundAt: integer('bound_at', { mode: 'timestamp' }).notNull(),
    clientAddress: text('client_address'),
    userAgent: text('user_agent'),
    /** Null until staff have established that the referred buyer is independent of the affiliate. */
    independentVerifiedAt: integer('independent_verified_at', { mode: 'timestamp' }),
    independentVerifiedBy: text('independent_verified_by'),
  },
  (table) => [
    uniqueIndex('affiliate_referrals_account_idx').on(table.accountId),
    index('affiliate_referrals_affiliate_idx').on(table.affiliateId),
  ],
);

/**
 * One commission per order, ever. It accrues when the order is written and is a liability from
 * that moment; it vests only after the material has been delivered and the return window has
 * run, and a refund reverses it. The basis is the material subtotal after any promo code:
 * never shipping, never sales tax, because neither is ours to share.
 */
export const affiliateCommissions = sqliteTable(
  'affiliate_commissions',
  {
    id: text('id').primaryKey(),
    affiliateId: text('affiliate_id').notNull(),
    orderId: text('order_id').notNull(),
    orderNumber: text('order_number').notNull(),
    accountId: text('account_id').notNull(),
    basisCents: integer('basis_cents').notNull(),
    rateBps: integer('rate_bps').notNull(),
    amountCents: integer('amount_cents').notNull(),
    /** pending | vested | paid | reversed */
    status: text('status').notNull().default('pending'),
    vestsAt: integer('vests_at', { mode: 'timestamp' }),
    vestedAt: integer('vested_at', { mode: 'timestamp' }),
    reversedAt: integer('reversed_at', { mode: 'timestamp' }),
    reversedReason: text('reversed_reason'),
    payoutId: text('payout_id'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    uniqueIndex('affiliate_commissions_order_idx').on(table.orderId),
    index('affiliate_commissions_affiliate_status_idx').on(table.affiliateId, table.status),
    index('affiliate_commissions_payout_idx').on(table.payoutId),
    check('affiliate_commissions_amount_check', sql`${table.amountCents} >= 0 AND ${table.basisCents} >= 0`),
  ],
);

export type AffiliateCommissionRow = typeof affiliateCommissions.$inferSelect;

/**
 * A batch payment of vested commissions. Payment itself is manual, like every other payment
 * this business makes: staff send the money and record the confirmation here. `sentAt` is what
 * makes a payout count towards a partner's calendar-year total for contractor reporting.
 */
export const affiliatePayouts = sqliteTable(
  'affiliate_payouts',
  {
    id: text('id').primaryKey(),
    affiliateId: text('affiliate_id').notNull(),
    amountCents: integer('amount_cents').notNull(),
    commissionCount: integer('commission_count').notNull(),
    /** pending | sent | cancelled */
    status: text('status').notNull().default('pending'),
    method: text('method').notNull().default('zelle'),
    reference: text('reference'),
    note: text('note'),
    createdBy: text('created_by').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    sentAt: integer('sent_at', { mode: 'timestamp' }),
    sentBy: text('sent_by'),
  },
  (table) => [
    index('affiliate_payouts_affiliate_idx').on(table.affiliateId),
    index('affiliate_payouts_sent_idx').on(table.sentAt),
  ],
);

export type AffiliatePayoutRow = typeof affiliatePayouts.$inferSelect;
