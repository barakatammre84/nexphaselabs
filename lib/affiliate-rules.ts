/**
 * Affiliate arithmetic and wording, with no database and no environment (owner, 16 Sep 2026).
 * Kept pure so the numbers can be tested on their own and rendered in a client component.
 */
import { roundedRatio, safeAdd } from '@/lib/safe-integer';

/** 10%. The owner's default; staff can set a different rate per partner. */
export const DEFAULT_COMMISSION_BPS = 1000;
/** Nothing is paid out below this; it rolls to the next batch. */
export const DEFAULT_PAYOUT_THRESHOLD_CENTS = 5000;
/** Days after delivery before a commission vests, so a return can still reverse it. */
export const DEFAULT_HOLD_DAYS = 30;
/** A partner cannot be paid more than this in a calendar year without a tax form on file. */
export const TAX_FORM_REQUIRED_BEFORE_PAYOUT = true;

export const AFFILIATE_CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{2,22}[A-Z0-9]$/;

export const AFFILIATE_COPY = {
  closed: 'The partner programme is not open at the moment.',
  needsAccount: 'Sign in to your account to apply to the partner programme.',
  applied: 'Your application is with us. A person reads every one, usually within two business days.',
  approved: 'Your application was approved.',
  declined: 'We are not able to approve this application.',
  suspended: 'This partner account is suspended. Contact us before promoting anything further.',
  duplicate: 'You have already applied.',
  agreement: 'Accept the partner agreement before your link goes live.',
  selfReferral: 'A partner does not earn commission on their own orders.',
  taxForm: 'We need a completed W-9 on file before the first payout can be sent.',
  belowThreshold: 'Balances below the payout minimum roll over to the next batch.',
  unavailable: 'The partner programme is temporarily unavailable. Try again shortly.',
} as const;

/** Uppercases and trims a code from a link or a form. Null when it could never be one of ours. */
export function normaliseAffiliateCode(raw: string): string | null {
  const code = raw.trim().toUpperCase();
  return AFFILIATE_CODE_PATTERN.test(code) ? code : null;
}

/**
 * A readable code from the partner's name plus four random characters, so two partners with
 * the same name never collide. Ambiguous characters are left out of the random part.
 */
export function generateAffiliateCode(name: string, random: () => number = Math.random): string {
  const stem = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
    .slice(0, 10);
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 4; i += 1) suffix += alphabet[Math.floor(random() * alphabet.length)];
  return `${stem || 'PARTNER'}-${suffix}`;
}

/**
 * What a commission is calculated on: the material subtotal after any promo code. Shipping is
 * a carrier's money and sales tax is the state's, so neither can be shared with a partner.
 */
export function commissionBasisCents(order: { subtotalCents: number; discountCents?: number | null }): number {
  const discount = order.discountCents ?? 0;
  if (!Number.isSafeInteger(order.subtotalCents) || order.subtotalCents < 0 ||
      !Number.isSafeInteger(discount) || discount < 0) return 0;
  return Math.max(0, order.subtotalCents - discount);
}

/** Commission in whole cents, rounded to nearest, never negative and never above the basis. */
export function commissionCents(basisCents: number, rateBps: number): number {
  if (!Number.isSafeInteger(basisCents) || basisCents < 0 ||
      !Number.isSafeInteger(rateBps) || rateBps < 0) return 0;
  const rate = Math.min(10_000, rateBps);
  return Math.min(basisCents, roundedRatio(basisCents, rate, 10_000));
}

/** When a delivered order's commission may be paid. */
export function vestingDate(deliveredAt: Date, holdDays = DEFAULT_HOLD_DAYS): Date {
  return new Date(deliveredAt.getTime() + Math.max(0, Math.round(holdDays)) * 86_400_000);
}

export function formatRate(bps: number): string {
  const percent = bps / 100;
  return `${Number.isInteger(percent) ? percent : percent.toFixed(2)}%`;
}

export type AffiliateApplication = { audience: string; channels: string; payoutEmail: string; acceptAgreement: boolean };

export type ApplicationValidation =
  | { ok: true; value: { audience: string; channels: string; payoutEmail: string } }
  | { ok: false; errors: string[] };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * An application is read by a person, so this only checks that there is something to read.
 * The substance of the decision, whether this partner can be trusted with the claims rules,
 * is not something code can judge.
 */
export function validateApplication(raw: AffiliateApplication): ApplicationValidation {
  const errors: string[] = [];
  const audience = raw.audience.trim().replace(/\s+/g, ' ');
  const channels = raw.channels.trim().replace(/\s+/g, ' ');
  const payoutEmail = raw.payoutEmail.trim().toLowerCase();
  if (audience.length < 20 || audience.length > 1000) errors.push('Describe who your audience is, in a sentence or two.');
  if (channels.length < 10 || channels.length > 1000) errors.push('Tell us where you would post, for example a site or a channel name.');
  if (!EMAIL.test(payoutEmail) || payoutEmail.length > 254) errors.push('Enter the email address your Zelle payments should go to.');
  if (!raw.acceptAgreement) errors.push('You must accept the partner agreement.');
  return errors.length ? { ok: false, errors } : { ok: true, value: { audience, channels, payoutEmail } };
}

export type CommissionTotals = { pendingCents: number; vestedCents: number; paidCents: number; reversedCents: number };

export function totalCommissions(
  rows: { status: string; amountCents: number }[],
): CommissionTotals {
  const totals: CommissionTotals = { pendingCents: 0, vestedCents: 0, paidCents: 0, reversedCents: 0 };
  for (const row of rows) {
    if (row.status === 'pending') totals.pendingCents = safeAdd(totals.pendingCents, row.amountCents, 'Pending commissions');
    else if (row.status === 'vested') totals.vestedCents = safeAdd(totals.vestedCents, row.amountCents, 'Vested commissions');
    else if (row.status === 'paid') totals.paidCents = safeAdd(totals.paidCents, row.amountCents, 'Paid commissions');
    else if (row.status === 'reversed') totals.reversedCents = safeAdd(totals.reversedCents, row.amountCents, 'Reversed commissions');
  }
  return totals;
}

/** Whether a batch may be created: something vested, above the minimum, and a tax form on file. */
export function payoutReadiness(
  vestedCents: number,
  thresholdCents: number,
  taxFormStatus: string,
): { ready: boolean; reason: string | null } {
  if (!Number.isSafeInteger(vestedCents) || vestedCents < 0 ||
      !Number.isSafeInteger(thresholdCents) || thresholdCents < 0)
    return { ready: false, reason: 'Commission totals could not be represented safely.' };
  if (vestedCents <= 0) return { ready: false, reason: 'Nothing has vested yet.' };
  if (TAX_FORM_REQUIRED_BEFORE_PAYOUT && taxFormStatus !== 'on_file')
    return { ready: false, reason: AFFILIATE_COPY.taxForm };
  if (vestedCents < thresholdCents) return { ready: false, reason: AFFILIATE_COPY.belowThreshold };
  return { ready: true, reason: null };
}
