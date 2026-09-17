import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localD1 } from './helpers/local-d1';
import { seedCommerceFixture, syntheticOrder } from './helpers/commerce-fixture';

const { env } = vi.hoisted(() => ({ env: {} as Record<string, unknown> }));
vi.mock('cloudflare:workers', () => ({ env }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

import { getDb } from '@/db';
import { accounts } from '@/db/schema';
import {
  AFFILIATE_COPY,
  commissionBasisCents,
  commissionCents,
  generateAffiliateCode,
  normaliseAffiliateCode,
  payoutReadiness,
  vestingDate,
} from '@/lib/affiliate-rules';
import {
  accrueCommission,
  affiliateSettings,
  saveAffiliateSettings,
  affiliateForAccount,
  applyForAffiliate,
  approvedAffiliateByCode,
  bindReferral,
  commissionLedger,
  createPayout,
  decideAffiliate,
  listAffiliates,
  markPayoutSent,
  payoutYearTotals,
  recordTaxForm,
  reverseCommissionForOrder,
  sweepAffiliateCommissions,
} from '@/lib/affiliates';
import { AFFILIATE_AGREEMENT_VERSION } from '@/lib/policy';
import { readReferralCookie } from '@/lib/referral-cookie';
import type { StaffPrincipal } from '@/lib/staff-auth';
import { GET as referralLink } from '@/app/r/[code]/route';
import { POST as applyRoute } from '@/app/api/account/affiliate/route';
import { POST as staffRoute } from '@/app/api/manage/affiliates/route';

let local: ReturnType<typeof localD1>;
const staff = { id: 'staff_1', name: 'Sam', role: 'admin' } as StaffPrincipal;
const good = { audience: 'Independent bench researchers who follow my chemistry newsletter.', channels: 'my newsletter and a lab-methods blog', payoutEmail: 'partner@example.org', acceptAgreement: true };
const row = (sql: string, ...args: (string | number)[]) => local.sqlite.prepare(sql).get(...args) as Record<string, unknown> | undefined;
const all = (sql: string) => local.sqlite.prepare(sql).all() as Record<string, unknown>[];

beforeEach(async () => {
  local = localD1();
  Object.assign(env, {
    DB: local.binding,
    APP_ENV: 'staging',
    PUBLIC_ORIGIN: 'https://staging.example.invalid',
    OPEN_CHECKOUT_ENABLED: 'true',
    AFFILIATE_PROGRAM_ENABLED: 'true',
  });
  await seedCommerceFixture();
  await getDb().insert(accounts).values([
    { id: 'acct_partner', email: 'partner@example.org', name: 'Ada Partner', passwordHash: 'unused', tier: 'researcher', status: 'active' },
    { id: 'acct_other', email: 'other@example.org', name: 'Other Person', passwordHash: 'unused', tier: 'researcher', status: 'active' },
  ]);
});
afterEach(() => {
  local.sqlite.close();
  for (const key of Object.keys(env)) delete env[key];
});

async function approvedPartner() {
  const applied = await applyForAffiliate({ id: 'acct_partner', name: 'Ada Partner' }, good);
  if (!applied.ok) throw new Error(applied.errors.join(' '));
  await decideAffiliate(applied.affiliate.id, 'approved', staff, null);
  return (await affiliateForAccount('acct_partner'))!;
}

describe('commission arithmetic', () => {
  it('is calculated on materials after any promo code, never on shipping or tax', () => {
    expect(commissionBasisCents({ subtotalCents: 10_000, discountCents: 1_500 })).toBe(8_500);
    expect(commissionBasisCents({ subtotalCents: 10_000 })).toBe(10_000);
    expect(commissionBasisCents({ subtotalCents: 500, discountCents: 900 })).toBe(0);
    expect(commissionCents(8_500, 1000)).toBe(850);
    expect(commissionCents(333, 1000)).toBe(33);
    expect(commissionCents(335, 1000)).toBe(34);
  });

  it('never returns more than the basis, and clamps a nonsense rate', () => {
    expect(commissionCents(1_000, 20_000)).toBe(1_000);
    expect(commissionCents(1_000, -5)).toBe(0);
    expect(commissionCents(-100, 1000)).toBe(0);
    expect(commissionCents(Number.NaN, 1000)).toBe(0);
  });

  it('normalises and generates codes, and dates vesting from delivery', () => {
    expect(normaliseAffiliateCode(' ada-x1 ')).toBe('ADA-X1');
    expect(normaliseAffiliateCode('a')).toBeNull();
    expect(normaliseAffiliateCode('../etc')).toBeNull();
    expect(generateAffiliateCode('Ada Partner', () => 0)).toBe('ADAPARTNER-AAAA');
    expect(generateAffiliateCode('!!!', () => 0)).toBe('PARTNER-AAAA');
    expect(vestingDate(new Date('2026-09-01T00:00:00Z'), 30).toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  it('will not release a payout below the minimum or without a tax form', () => {
    expect(payoutReadiness(0, 5_000, 'on_file')).toMatchObject({ ready: false });
    expect(payoutReadiness(9_000, 5_000, 'none')).toEqual({ ready: false, reason: AFFILIATE_COPY.taxForm });
    expect(payoutReadiness(1_000, 5_000, 'on_file')).toEqual({ ready: false, reason: AFFILIATE_COPY.belowThreshold });
    expect(payoutReadiness(9_000, 5_000, 'on_file')).toEqual({ ready: true, reason: null });
  });
});

describe('applications', () => {
  it('records an application that a person still has to approve', async () => {
    const result = await applyForAffiliate({ id: 'acct_partner', name: 'Ada Partner' }, good);
    expect(result.ok).toBe(true);
    const stored = (await affiliateForAccount('acct_partner'))!;
    expect(stored).toMatchObject({ status: 'applied', commissionBps: 1000, agreementVersion: AFFILIATE_AGREEMENT_VERSION, payoutEmail: 'partner@example.org' });
    // An unapproved code resolves to nothing, so a link cannot work before approval.
    expect(await approvedAffiliateByCode(stored.code)).toBeNull();
    expect(await applyForAffiliate({ id: 'acct_partner', name: 'Ada Partner' }, good)).toEqual({ ok: false, errors: [AFFILIATE_COPY.duplicate] });
  });

  it('refuses an application that says nothing, or that does not accept the agreement', async () => {
    const thin = await applyForAffiliate({ id: 'acct_partner', name: 'Ada' }, { ...good, audience: 'people' });
    expect(thin.ok).toBe(false);
    const unsigned = await applyForAffiliate({ id: 'acct_partner', name: 'Ada' }, { ...good, acceptAgreement: false });
    expect(!unsigned.ok && unsigned.errors).toContain('You must accept the partner agreement.');
    expect(await affiliateForAccount('acct_partner')).toBeNull();
  });

  it('lets a declined applicant try again, and closes when the programme is off', async () => {
    const first = await applyForAffiliate({ id: 'acct_partner', name: 'Ada' }, good);
    if (!first.ok) throw new Error('setup');
    await decideAffiliate(first.affiliate.id, 'declined', staff, 'Not enough detail.');
    const again = await applyForAffiliate({ id: 'acct_partner', name: 'Ada' }, good);
    expect(again.ok).toBe(true);
    expect((await affiliateForAccount('acct_partner'))!.status).toBe('applied');

    env.AFFILIATE_PROGRAM_ENABLED = 'false';
    expect(await applyForAffiliate({ id: 'acct_other', name: 'Other' }, good)).toEqual({ ok: false, errors: [AFFILIATE_COPY.closed] });
  });
});

describe('referral binding', () => {
  it('binds once, permanently, and never to the partner themselves', async () => {
    const partner = await approvedPartner();
    expect((await approvedAffiliateByCode(partner.code))?.id).toBe(partner.id);

    expect(await bindReferral(partner.code, 'acct_partner')).toBe(false); // their own account
    expect(await bindReferral('NOBODY-XXXX', 'acct_other')).toBe(false);
    expect(await bindReferral(partner.code, 'acct_other')).toBe(true);
    expect(await bindReferral(partner.code, 'acct_other')).toBe(false); // first touch is permanent
    expect(all('SELECT id FROM affiliate_referrals')).toHaveLength(1);

    // A suspended partner's code stops resolving.
    await decideAffiliate(partner.id, 'suspended', staff, 'broke the claims rules');
    expect(await approvedAffiliateByCode(partner.code)).toBeNull();
  });

  it('carries the code from the link through the cookie', async () => {
    const response = await referralLink(
      new Request('https://staging.example.invalid/r/ada-x1?to=/catalog/synthetic'),
      { params: Promise.resolve({ code: 'ada-x1' }) },
    );
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('https://staging.example.invalid/catalog/synthetic');
    const cookie = response.headers.get('Set-Cookie')!;
    expect(cookie).toContain('nx_ref=ADA-X1');
    expect(cookie).toContain('HttpOnly');
    expect(readReferralCookie(cookie.split(';')[0])).toBe('ADA-X1');

    // An off-site destination is ignored, and a code that could never be ours sets nothing.
    const offsite = await referralLink(
      new Request('https://staging.example.invalid/r/ada-x1?to=https://elsewhere.example'),
      { params: Promise.resolve({ code: 'ada-x1' }) },
    );
    expect(offsite.headers.get('Location')).toBe('https://staging.example.invalid/catalog');
    const junk = await referralLink(
      new Request('https://staging.example.invalid/r/..'),
      { params: Promise.resolve({ code: '..' }) },
    );
    expect(junk.headers.get('Set-Cookie')).toBeNull();
    expect(readReferralCookie(null)).toBeNull();
    expect(readReferralCookie('other=1')).toBeNull();
  });
});

describe('commission lifecycle', () => {
  async function referredOrder(packs = 2) {
    const partner = await approvedPartner();
    const order = await syntheticOrder(packs);
    await bindReferral(partner.code, order.buyer.id);
    const accrued = await accrueCommission({
      id: order.detail.order.id,
      orderNumber: order.detail.order.orderNumber,
      accountId: order.buyer.id,
      subtotalCents: order.detail.order.subtotalCents,
      discountCents: order.detail.order.discountCents,
    });
    return { partner, order, accrued };
  }

  it('accrues once per order at the partner rate, and not at all without a referral', async () => {
    const { partner, order, accrued } = await referredOrder(2);
    expect(order.detail.order.subtotalCents).toBe(200);
    expect(accrued).toBe(20);
    const commission = row('SELECT affiliate_id, basis_cents, rate_bps, amount_cents, status FROM affiliate_commissions')!;
    expect(commission).toEqual({ affiliate_id: partner.id, basis_cents: 200, rate_bps: 1000, amount_cents: 20, status: 'pending' });

    // The same order again earns nothing more.
    expect(
      await accrueCommission({ id: order.detail.order.id, orderNumber: order.detail.order.orderNumber, accountId: order.buyer.id, subtotalCents: 200 }),
    ).toBe(0);
    expect(all('SELECT id FROM affiliate_commissions')).toHaveLength(1);

    // An order from a customer nobody introduced earns nothing.
    const stranger = await syntheticOrder(1);
    expect(
      await accrueCommission({ id: stranger.detail.order.id, orderNumber: stranger.detail.order.orderNumber, accountId: stranger.buyer.id, subtotalCents: 100 }),
    ).toBe(0);
    expect(all('SELECT id FROM affiliate_commissions')).toHaveLength(1);
  });

  it('earns nothing while the partner is suspended or the programme is closed', async () => {
    const partner = await approvedPartner();
    const order = await syntheticOrder(2);
    await bindReferral(partner.code, order.buyer.id);
    await decideAffiliate(partner.id, 'suspended', staff, null);
    expect(
      await accrueCommission({ id: order.detail.order.id, orderNumber: 'X', accountId: order.buyer.id, subtotalCents: 200 }),
    ).toBe(0);

    await decideAffiliate(partner.id, 'approved', staff, null);
    env.AFFILIATE_PROGRAM_ENABLED = 'false';
    expect(
      await accrueCommission({ id: order.detail.order.id, orderNumber: 'X', accountId: order.buyer.id, subtotalCents: 200 }),
    ).toBe(0);
    expect(all('SELECT id FROM affiliate_commissions')).toHaveLength(0);
  });

  it('vests only after delivery plus the hold, and a refund takes it back', async () => {
    const { order } = await referredOrder(2);
    const orderId = order.detail.order.id;
    const day = 86_400_000;
    const delivered = new Date('2026-09-16T00:00:00Z');

    // Undelivered: the sweep does nothing at all.
    expect(await sweepAffiliateCommissions(delivered)).toMatchObject({ dated: 0, vested: 0, reversed: 0 });
    expect(row('SELECT status FROM affiliate_commissions')?.status).toBe('pending');

    local.sqlite.prepare('UPDATE orders SET delivered_at = ? WHERE id = ?').run(Math.floor(delivered.getTime() / 1000), orderId);
    expect(await sweepAffiliateCommissions(delivered)).toMatchObject({ dated: 1, vested: 0 });
    expect(row('SELECT vests_at FROM affiliate_commissions')?.vests_at).toBe(Math.floor((delivered.getTime() + 30 * day) / 1000));

    // Still inside the hold.
    expect(await sweepAffiliateCommissions(new Date(delivered.getTime() + 29 * day))).toMatchObject({ vested: 0 });
    expect(row('SELECT status FROM affiliate_commissions')?.status).toBe('pending');

    expect(await sweepAffiliateCommissions(new Date(delivered.getTime() + 31 * day))).toMatchObject({ vested: 1 });
    expect(row('SELECT status FROM affiliate_commissions')?.status).toBe('vested');

    // A refund reverses it even after vesting, and the sweep never revives it.
    expect(await reverseCommissionForOrder(orderId, 'order refunded')).toBe(true);
    expect(row('SELECT status, reversed_reason FROM affiliate_commissions')).toMatchObject({ status: 'reversed', reversed_reason: 'order refunded' });
    expect(await sweepAffiliateCommissions(new Date(delivered.getTime() + 60 * day))).toMatchObject({ vested: 0, reversed: 0 });
    expect(row('SELECT status FROM affiliate_commissions')?.status).toBe('reversed');
  });

  it('reverses through the sweep when an order is cancelled or refunded elsewhere', async () => {
    const { order } = await referredOrder(2);
    local.sqlite.prepare("UPDATE orders SET status = 'cancelled' WHERE id = ?").run(order.detail.order.id);
    expect(await sweepAffiliateCommissions(new Date())).toMatchObject({ reversed: 1 });
    expect(row('SELECT status FROM affiliate_commissions')?.status).toBe('reversed');
  });
});

describe('payouts and tax-year totals', () => {
  // The fixture lot supplies five 2 mg packs, so a vested balance is small; the payout minimum
  // is lowered here to exercise the gate rather than the fixture's stock.
  async function vestedPartner(packs = 4) {
    const partner = await approvedPartner();
    const order = await syntheticOrder(packs);
    await bindReferral(partner.code, order.buyer.id);
    await accrueCommission({
      id: order.detail.order.id,
      orderNumber: order.detail.order.orderNumber,
      accountId: order.buyer.id,
      subtotalCents: order.detail.order.subtotalCents,
    });
    local.sqlite.prepare("UPDATE affiliate_commissions SET status = 'vested'").run();
    local.sqlite
      .prepare("INSERT INTO settings (key, value, updated_by, updated_at) VALUES ('affiliate.payout_threshold_cents', '40', 'test', 0)")
      .run();
    return partner;
  }

  it('will not pay without a tax form, refuses a taxpayer number as the locator, then pays and marks it paid', async () => {
    const partner = await vestedPartner();
    expect(await createPayout(partner.id, staff)).toEqual({ ok: false, error: AFFILIATE_COPY.taxForm });

    expect(await recordTaxForm(partner.id, '123-45-6789')).toMatchObject({ ok: false });
    expect(await recordTaxForm(partner.id, '12-3456789')).toMatchObject({ ok: false });
    expect(await recordTaxForm(partner.id, 'vault: partner-w9-2026-001')).toEqual({ ok: true });
    expect(row('SELECT tax_form_status, tax_form_reference FROM affiliates')).toMatchObject({ tax_form_status: 'on_file', tax_form_reference: 'vault: partner-w9-2026-001' });

    const payout = await createPayout(partner.id, staff);
    if (!payout.ok) throw new Error(payout.error);
    expect(payout.amountCents).toBe(40);
    expect(row('SELECT status, payout_id FROM affiliate_commissions')).toMatchObject({ status: 'vested', payout_id: payout.payoutId });
    // Nothing is left to batch twice.
    expect(await createPayout(partner.id, staff)).toMatchObject({ ok: false });

    expect(await markPayoutSent(payout.payoutId, 'ab', staff)).toMatchObject({ ok: false });
    expect(await markPayoutSent(payout.payoutId, 'Zelle 998877', staff)).toEqual({ ok: true });
    expect(row('SELECT status FROM affiliate_commissions')?.status).toBe('paid');
    expect(await markPayoutSent(payout.payoutId, 'Zelle 998877', staff)).toMatchObject({ ok: false });

    const totals = await payoutYearTotals(new Date().getUTCFullYear());
    expect(totals).toHaveLength(1);
    expect(totals[0]).toMatchObject({ code: partner.code, name: 'Ada Partner', paidCents: 40, payouts: 1, taxFormStatus: 'on_file' });
    expect(await payoutYearTotals(2001)).toEqual([]);
  });

  it('takes a refunded commission out of a batch that has not been sent', async () => {
    const partner = await vestedPartner();
    await recordTaxForm(partner.id, 'vault: partner-w9');
    const payout = await createPayout(partner.id, staff);
    if (!payout.ok) throw new Error(payout.error);
    expect(payout.amountCents).toBe(40);

    // The order is refunded after the batch was prepared but before the money was sent.
    const orderId = String(row('SELECT order_id FROM affiliate_commissions')?.order_id);
    expect(await reverseCommissionForOrder(orderId, 'order refunded')).toBe(true);

    // The batch must not still be asking staff to send money the partner is no longer owed.
    expect(row('SELECT status, amount_cents, commission_count FROM affiliate_payouts')).toMatchObject({
      status: 'cancelled',
      amount_cents: 40,
    });
    expect(row('SELECT status FROM affiliate_commissions')?.status).toBe('reversed');
    // And nothing reaches the contractor total, because the batch was never sent.
    expect(await payoutYearTotals(new Date().getUTCFullYear())).toEqual([]);
  });

  it('holds a balance below the minimum back for the next batch', async () => {
    const partner = await approvedPartner();
    const order = await syntheticOrder(2);
    await bindReferral(partner.code, order.buyer.id);
    await accrueCommission({ id: order.detail.order.id, orderNumber: 'X', accountId: order.buyer.id, subtotalCents: 200 });
    local.sqlite.prepare("UPDATE affiliate_commissions SET status = 'vested'").run();
    await recordTaxForm(partner.id, 'vault: partner-w9');
    expect(await createPayout(partner.id, staff)).toEqual({ ok: false, error: AFFILIATE_COPY.belowThreshold });
  });

  it('summarises partners and exports a ledger for the books', async () => {
    const partner = await vestedPartner();
    const summary = await listAffiliates();
    expect(summary).toHaveLength(1);
    expect(summary[0]).toMatchObject({ code: partner.code, status: 'approved', name: 'Ada Partner', referredAccounts: 1, vestedCents: 40, pendingCents: 0 });
    const ledger = await commissionLedger();
    expect(ledger[0]).toMatchObject({ partner: 'Ada Partner', code: partner.code, amountCents: 40, status: 'vested', payoutSentAt: null });
  });
});

describe('routes', () => {
  const post = (path: string, body: Record<string, string>, headers: Record<string, string> = {}) =>
    new Request(`https://staging.example.invalid${path}`, {
      method: 'POST',
      headers: { Origin: 'https://staging.example.invalid', Host: 'staging.example.invalid', ...headers },
      body: new URLSearchParams(body),
    });

  it('sends an anonymous applicant to sign in and refuses a cross-site post', async () => {
    const anonymous = await applyRoute(post('/api/account/affiliate', { audience: 'x' }));
    expect(anonymous.status).toBe(303);
    expect(anonymous.headers.get('Location')).toContain('/account/sign-in');
    const cross = await applyRoute(post('/api/account/affiliate', {}, { Origin: 'https://elsewhere.example' }));
    expect(cross.status).toBe(403);
  });

  it('keeps the staff desk to signed-in administrators', async () => {
    const anonymous = await staffRoute(post('/api/manage/affiliates', { intent: 'approve', id: 'x' }));
    expect(anonymous.status).toBe(401);
    const cross = await staffRoute(post('/api/manage/affiliates', {}, { Origin: 'https://elsewhere.example' }));
    expect(cross.status).toBe(403);
  });
});

describe('programme settings', () => {
  it('falls back to the built-in defaults until an administrator sets them', async () => {
    expect(await affiliateSettings()).toEqual({ commissionBps: 1000, payoutThresholdCents: 5000, holdDays: 30 });
  });

  it('saves the three numbers and refuses values outside their range', async () => {
    expect(await saveAffiliateSettings({ commissionBps: 6000, payoutThresholdCents: 5000, holdDays: 30 }, staff)).toMatchObject({ ok: false });
    expect(await saveAffiliateSettings({ commissionBps: -1, payoutThresholdCents: 5000, holdDays: 30 }, staff)).toMatchObject({ ok: false });
    expect(await saveAffiliateSettings({ commissionBps: 1000, payoutThresholdCents: 2_000_000, holdDays: 30 }, staff)).toMatchObject({ ok: false });
    expect(await saveAffiliateSettings({ commissionBps: 1000, payoutThresholdCents: 5000, holdDays: 400 }, staff)).toMatchObject({ ok: false });
    expect(await saveAffiliateSettings({ commissionBps: 1000, payoutThresholdCents: 5000, holdDays: 1.5 }, staff)).toMatchObject({ ok: false });
    expect(all('SELECT key FROM settings')).toHaveLength(0);

    expect(await saveAffiliateSettings({ commissionBps: 1750, payoutThresholdCents: 12_500, holdDays: 14 }, staff)).toEqual({ ok: true });
    expect(await affiliateSettings()).toEqual({ commissionBps: 1750, payoutThresholdCents: 12_500, holdDays: 14 });
    // Zero is a real answer: no minimum, and vesting on delivery.
    expect(await saveAffiliateSettings({ commissionBps: 0, payoutThresholdCents: 0, holdDays: 0 }, staff)).toEqual({ ok: true });
    expect(await affiliateSettings()).toEqual({ commissionBps: 0, payoutThresholdCents: 0, holdDays: 0 });
  });

  it('gives a new partner the current default without repricing anyone already approved', async () => {
    const first = await approvedPartner();
    expect(first.commissionBps).toBe(1000);

    await saveAffiliateSettings({ commissionBps: 1500, payoutThresholdCents: 5000, holdDays: 30 }, staff);
    const second = await applyForAffiliate({ id: 'acct_other', name: 'Other Person' }, good);
    if (!second.ok) throw new Error(second.errors.join(' '));
    expect(second.affiliate.commissionBps).toBe(1500);
    expect((await affiliateForAccount('acct_partner'))!.commissionBps).toBe(1000);
  });

  it('uses the changed hold when dating a delivered order, and the changed rate when accruing', async () => {
    await saveAffiliateSettings({ commissionBps: 2000, payoutThresholdCents: 100, holdDays: 7 }, staff);
    const applied = await applyForAffiliate({ id: 'acct_partner', name: 'Ada Partner' }, good);
    if (!applied.ok) throw new Error('setup');
    await decideAffiliate(applied.affiliate.id, 'approved', staff, null);
    const partner = (await affiliateForAccount('acct_partner'))!;

    const order = await syntheticOrder(2);
    await bindReferral(partner.code, order.buyer.id);
    expect(
      await accrueCommission({ id: order.detail.order.id, orderNumber: 'NX-1', accountId: order.buyer.id, subtotalCents: 200 }),
    ).toBe(40); // 20% of $2.00

    const delivered = new Date('2026-09-16T00:00:00Z');
    local.sqlite.prepare('UPDATE orders SET delivered_at = ? WHERE id = ?').run(Math.floor(delivered.getTime() / 1000), order.detail.order.id);
    await sweepAffiliateCommissions(delivered);
    expect(row('SELECT vests_at FROM affiliate_commissions')?.vests_at).toBe(Math.floor((delivered.getTime() + 7 * 86_400_000) / 1000));
  });
});
