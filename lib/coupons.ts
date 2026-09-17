import { and, count, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { couponRedemptions, coupons, type Coupon } from '@/db/schema';

/**
 * Promo codes (owner, 16 September 2026).
 *
 * A code is priced into the checkout quote — tax is worked out on the reduced
 * subtotal — and re-checked at the moment the order is written, when a
 * redemption is recorded against it. The customer-facing answers say why a code
 * does not apply; nothing here reveals which codes exist.
 */
export const COUPON_CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{1,30}[A-Z0-9]$/;

export type CouponCheck =
  | { ok: true; coupon: Coupon; discountCents: number }
  | { ok: false; error: string };

export const COUPON_COPY = {
  unknown: 'That promo code is not recognised.',
  inactive: 'That promo code is no longer active.',
  notYet: 'That promo code is not valid yet.',
  expired: 'That promo code has expired.',
  exhausted: 'That promo code has been fully redeemed.',
  used: 'That promo code has already been used on this account.',
  minimum: (cents: number) =>
    `That promo code needs a materials subtotal of at least $${(cents / 100).toFixed(2)}.`,
} as const;

/** Uppercase, trimmed; `null` for an empty field, `'invalid'` never — a malformed code is simply unknown. */
export function normaliseCouponCode(raw: unknown): string | null {
  const code = String(raw ?? '').trim().toUpperCase();
  return code ? code : null;
}

export function discountFor(coupon: Pick<Coupon, 'kind' | 'value'>, subtotalCents: number): number {
  if (subtotalCents <= 0) return 0;
  if (coupon.kind === 'percent') return Math.min(subtotalCents, Math.round((subtotalCents * coupon.value) / 100));
  return Math.min(subtotalCents, coupon.value);
}

export async function evaluateCoupon(
  codeRaw: string,
  accountId: string,
  subtotalCents: number,
  now = new Date(),
): Promise<CouponCheck> {
  const code = normaliseCouponCode(codeRaw);
  if (!code || !COUPON_CODE_PATTERN.test(code)) return { ok: false, error: COUPON_COPY.unknown };
  const db = getDb();
  const [coupon] = await db.select().from(coupons).where(eq(coupons.code, code)).limit(1);
  if (!coupon) return { ok: false, error: COUPON_COPY.unknown };
  if (!coupon.active) return { ok: false, error: COUPON_COPY.inactive };
  if (coupon.startsAt && coupon.startsAt > now) return { ok: false, error: COUPON_COPY.notYet };
  if (coupon.endsAt && coupon.endsAt < now) return { ok: false, error: COUPON_COPY.expired };
  if (coupon.maxRedemptions !== null && coupon.redemptionCount >= coupon.maxRedemptions)
    return { ok: false, error: COUPON_COPY.exhausted };
  if (coupon.minSubtotalCents !== null && subtotalCents < coupon.minSubtotalCents)
    return { ok: false, error: COUPON_COPY.minimum(coupon.minSubtotalCents) };
  if (coupon.perAccountLimit !== null) {
    const [used] = await db
      .select({ n: count() })
      .from(couponRedemptions)
      .where(and(eq(couponRedemptions.couponId, coupon.id), eq(couponRedemptions.accountId, accountId)));
    if ((used?.n ?? 0) >= coupon.perAccountLimit) return { ok: false, error: COUPON_COPY.used };
  }
  const discountCents = discountFor(coupon, subtotalCents);
  if (discountCents <= 0) return { ok: false, error: COUPON_COPY.unknown };
  return { ok: true, coupon, discountCents };
}

/* ---------------------------- staff management ---------------------------- */

export type CouponInput = {
  code: string;
  kind: 'percent' | 'fixed';
  value: number;
  minSubtotalCents: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  maxRedemptions: number | null;
  perAccountLimit: number | null;
  note: string | null;
};

export function couponIssues(input: CouponInput): string[] {
  const issues: string[] = [];
  if (!COUPON_CODE_PATTERN.test(input.code)) issues.push('A code is 3–32 letters, digits or dashes.');
  if (input.kind !== 'percent' && input.kind !== 'fixed') issues.push('Choose percent or fixed amount.');
  if (!Number.isInteger(input.value) || input.value <= 0) issues.push('Enter the discount.');
  if (input.kind === 'percent' && input.value > 100) issues.push('A percent discount cannot exceed 100.');
  if (input.minSubtotalCents !== null && (!Number.isInteger(input.minSubtotalCents) || input.minSubtotalCents < 0))
    issues.push('The minimum subtotal must be a whole number of cents, or empty.');
  if (input.startsAt && input.endsAt && input.endsAt < input.startsAt) issues.push('The end date is before the start date.');
  if (input.maxRedemptions !== null && (!Number.isInteger(input.maxRedemptions) || input.maxRedemptions < 1))
    issues.push('Total uses must be a whole number of at least 1, or empty.');
  if (input.perAccountLimit !== null && (!Number.isInteger(input.perAccountLimit) || input.perAccountLimit < 1))
    issues.push('Uses per account must be a whole number of at least 1, or empty.');
  return issues;
}

export async function listCoupons(): Promise<Coupon[]> {
  return getDb().select().from(coupons).orderBy(coupons.createdAt);
}

export async function createCoupon(
  input: CouponInput,
  createdBy: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const issues = couponIssues(input);
  if (issues.length) return { ok: false, error: issues.join(' ') };
  const db = getDb();
  const [existing] = await db.select({ id: coupons.id }).from(coupons).where(eq(coupons.code, input.code)).limit(1);
  if (existing) return { ok: false, error: 'That code already exists.' };
  const id = `cpn_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
  const now = new Date();
  await db.insert(coupons).values({ ...input, id, createdBy, createdAt: now, updatedAt: now });
  return { ok: true, id };
}

export async function setCouponActive(id: string, active: boolean): Promise<boolean> {
  const rows = await getDb()
    .update(coupons)
    .set({ active, updatedAt: new Date() })
    .where(eq(coupons.id, id))
    .returning({ id: coupons.id });
  return rows.length > 0;
}
