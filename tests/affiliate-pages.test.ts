import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({ APP_ENV: 'test', PUBLIC_ORIGIN: 'https://nexphaselabs.net', POLICIES_COUNSEL_REVIEWED: 'true' }) as Record<string, unknown>);
vi.mock('cloudflare:workers', () => ({ env }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock('next/navigation', () => ({ redirect: vi.fn(), notFound: vi.fn() }));

const account = { id: 'acct_a', email: 'a@example.invalid', name: 'Ada', status: 'active', verificationStatus: 'none', tier: 'researcher' as const, termsVersion: null, ruoVersion: null, sessionId: 's' };
vi.mock('@/lib/account-auth', () => ({ requireAccount: async () => account }));

const affiliate = vi.hoisted(() => ({
  current: null as Record<string, unknown> | null,
  settings: { commissionBps: 1000, payoutThresholdCents: 5000, holdDays: 30 },
}));
vi.mock('@/lib/affiliates', () => ({
  affiliateSettings: async () => affiliate.settings,
  affiliateForAccount: async () => affiliate.current,
  affiliateDashboard: async () => ({
    affiliate: affiliate.current,
    totals: { pendingCents: 1500, vestedCents: 900, paidCents: 4200, reversedCents: 300 },
    referredAccounts: 7,
    commissions: [{ id: 'c1', orderNumber: 'NX-260916-0001', basisCents: 15_000, rateBps: 1000, amountCents: 1500, status: 'pending', vestsAt: new Date('2026-10-20T00:00:00Z'), createdAt: new Date('2026-09-16T00:00:00Z') }],
    payouts: [{ id: 'p1', amountCents: 4200, status: 'sent', sentAt: new Date('2026-09-10T00:00:00Z'), reference: 'Zelle 1234' }],
    settings: affiliate.settings,
  }),
}));

import AffiliateTermsPage from '@/app/legal/affiliate-terms/page';
import AccountAffiliatePage from '@/app/account/affiliate/page';

const render = async () => renderToStaticMarkup(await AccountAffiliatePage({ searchParams: Promise.resolve({}) }));

describe('partner agreement', () => {
  it('states the claim limits, the disclosure duty and the payment terms', async () => {
    affiliate.settings = { commissionBps: 1000, payoutThresholdCents: 5000, holdDays: 30 };
    const html = renderToStaticMarkup(await AffiliateTermsPage());
    for (const phrase of [
      'laboratory research use only',
      'Name a disease or condition',
      'human dose',
      'reconstitute',
      'before and after imagery',
      'Federal Trade Commission',
      'independent contractor',
      'Form W-9',
    ])
      expect(html).toContain(phrase);
    // The agreement must never itself carry the thing it forbids.
    expect(html).not.toMatch(/\b(Ozempic|Wegovy|Mounjaro)\b/);
    expect(html).toContain('10% of the materials subtotal');
    expect(html).toContain('vests 30 days');
    expect(html).toContain('reaches $50.00');
  });

  it('prints whatever rate, hold and minimum an administrator has set, so it cannot drift', async () => {
    affiliate.settings = { commissionBps: 1750, payoutThresholdCents: 12_500, holdDays: 14 };
    const html = renderToStaticMarkup(await AffiliateTermsPage());
    expect(html).toContain('17.50% of the materials subtotal');
    expect(html).toContain('vests 14 days');
    expect(html).toContain('reaches $125.00');
    expect(html).not.toContain('10% of the materials subtotal');
    // A partner on their own negotiated rate is told which one governs.
    expect(html).toContain('shown on your partner page');
  });
});

describe('partner page', () => {
  it('says the programme is closed, and offers no application, while the switch is off', async () => {
    affiliate.current = null;
    delete env.AFFILIATE_PROGRAM_ENABLED;
    const html = await render();
    expect(html).toContain('not open at the moment');
    expect(html).not.toContain('action="/api/account/affiliate"');
  });

  it('offers the application with the agreement checkbox once the programme is open', async () => {
    affiliate.current = null;
    env.AFFILIATE_PROGRAM_ENABLED = 'true';
    const html = await render();
    expect(html).toContain('action="/api/account/affiliate"');
    expect(html).toContain('name="accept_agreement"');
    expect(html).toContain('href="/legal/affiliate-terms"');
    expect(html).toContain('name="payout_email"');
  });

  it('heads the panel with the state the partner is actually in', async () => {
    env.AFFILIATE_PROGRAM_ENABLED = 'true';
    const states: [string | null, string][] = [
      [null, 'Apply to the programme'],
      ['applied', 'Your application'],
      ['approved', 'Your link'],
      ['suspended', 'Your partner account'],
    ];
    for (const [status, heading] of states) {
      affiliate.current = status
        ? { id: 'aff_1', status, code: 'ADA-1234', commissionBps: 1000, appliedAt: new Date(), taxFormStatus: 'none' }
        : null;
      expect(renderToStaticMarkup(await AccountAffiliatePage({ searchParams: Promise.resolve({}) }))).toContain(heading);
    }
  });

  it('shows a pending application rather than a link', async () => {
    affiliate.current = { id: 'aff_1', status: 'applied', code: 'ADA-1234', commissionBps: 1000, appliedAt: new Date('2026-09-16T00:00:00Z'), taxFormStatus: 'none' };
    env.AFFILIATE_PROGRAM_ENABLED = 'true';
    const html = await render();
    expect(html).toContain('with us');
    expect(html).not.toContain('/r/ADA-1234');
    expect(html).not.toContain('action="/api/account/affiliate"');
  });

  it('shows the link, the balances and the tax-form warning once approved', async () => {
    affiliate.current = { id: 'aff_1', status: 'approved', code: 'ADA-1234', commissionBps: 1000, appliedAt: new Date('2026-09-16T00:00:00Z'), taxFormStatus: 'none' };
    env.AFFILIATE_PROGRAM_ENABLED = 'true';
    const html = await render();
    expect(html).toContain('https://nexphaselabs.net/r/ADA-1234');
    expect(html).toContain('$15.00'); // accruing
    expect(html).toContain('$42.00'); // paid
    expect(html).toContain('7 accounts created through your link');
    expect(html).toContain('We do not have one yet.');
    expect(html).toContain('never on');
  });

  it('tells a suspended partner to stop', async () => {
    affiliate.current = { id: 'aff_1', status: 'suspended', code: 'ADA-1234', commissionBps: 1000, appliedAt: new Date(), taxFormStatus: 'none' };
    env.AFFILIATE_PROGRAM_ENABLED = 'true';
    const html = await render();
    expect(html).toContain('suspended');
    expect(html).not.toContain('/r/ADA-1234');
  });
});
