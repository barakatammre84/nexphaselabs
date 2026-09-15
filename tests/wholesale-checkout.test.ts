import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localD1 } from './helpers/local-d1';
import { noticeFrom } from './helpers/notice';

const { env, account } = vi.hoisted(() => ({
  env: {} as Record<string, unknown>,
  account: {
    id: 'customer',
    email: 'synthetic@example.invalid',
    name: 'Synthetic customer',
    tier: 'institutional' as const,
    status: 'active' as const,
    verificationStatus: 'approved' as const,
    sessionId: 'session1',
    ruoVersion: '',
    termsVersion: '',
  },
}));
vi.mock('cloudflare:workers', () => ({ env }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@/lib/buyer-session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/buyer-session')>()),
  getBuyerFromRequest: async () => account,
}));

import { getDb } from '@/db';
import { accounts, accountSessions, cartItems, lots, organizations, products, productVariants } from '@/db/schema';
import { RESEARCH_SETTINGS } from '@/lib/account-rules';
import { RUO_VERSION, TERMS_VERSION } from '@/lib/policy';
import { POST as quote } from '@/app/api/checkout/quotes/route';
import { POST as submit } from '@/app/api/orders/route';

/**
 * Wholesale checkout (open checkout off, the production posture). Orders used to
 * be created with no shipping or tax, and with the buyer's age confirmation and
 * research setting recorded as absent even though the form required them.
 */

const ORIGIN = 'https://wholesale.example.invalid';
let local: ReturnType<typeof localD1>;

const post = (path: string, values: Record<string, string>) => {
  const body = new FormData();
  for (const [key, value] of Object.entries(values)) body.set(key, value);
  return new Request(`${ORIGIN}${path}`, {
    method: 'POST',
    headers: { Origin: ORIGIN, Host: new URL(ORIGIN).host, 'CF-Connecting-IP': '203.0.113.7' },
    body,
  });
};
const count = (table: string) =>
  (local.sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;

beforeEach(async () => {
  local = localD1();
  account.ruoVersion = RUO_VERSION;
  account.termsVersion = TERMS_VERSION;
  Object.assign(env, {
    DB: local.binding,
    APP_ENV: 'staging',
    PUBLIC_ORIGIN: ORIGIN,
    OPEN_CHECKOUT_ENABLED: 'false',
    CHECKOUT_QUOTES_REQUIRED: 'true',
    SHIPPING_PROVIDER: 'simulated',
    SHIPPING_SIMULATION_ENABLED: 'true',
    SHIPPING_FROM_JSON: JSON.stringify({
      name: 'Test origin',
      street1: '1 Origin Way',
      city: 'Oakland',
      state: 'CA',
      zip: '94612',
      country: 'US',
      is_residential: false,
    }),
    SHIPPING_DEFAULT_PARCEL_JSON: JSON.stringify({ length: 8, width: 6, height: 4, baseWeight: 0.4, perPackWeight: 0.1 }),
    TAX_PROVIDER: 'simulated',
    TAX_SIMULATED_RATE_BPS: '825',
  });
  vi.stubGlobal('fetch', vi.fn());
  const db = getDb();
  await db.insert(accounts).values({ ...account, passwordHash: 'disabled' });
  await db.insert(accountSessions).values({
    id: 'session1',
    accountId: account.id,
    tokenHash: 'unused',
    expiresAt: new Date(Date.now() + 3_600_000),
  });
  await db.insert(organizations).values({
    id: 'org1',
    accountId: account.id,
    legalName: 'Synthetic institution',
    website: 'https://example.invalid',
    emailDomain: 'example.invalid',
    organizationType: 'analytical_lab',
    addressLine1: '1 Receiving Dock',
    city: 'Test City',
    region: 'CA',
    postalCode: '00000',
    country: 'US',
    researchContext: 'Synthetic test only',
    receivingParty: 'Synthetic receiver',
    verificationStatus: 'approved',
    submittedAt: new Date(),
  });
  await db.insert(products).values({
    id: 'product1',
    code: 'TEST-001',
    slug: 'synthetic-product',
    name: 'Synthetic product',
    formalName: 'Test',
    chemicalClass: 'Test',
    casNumber: '50-00-0',
    molecularFormula: 'Test',
    molecularWeight: 'Test',
    purity: 'Test',
    form: 'Test',
    saltForm: 'Test',
    storageSolid: 'Test',
    storageStock: 'Test',
    stability: 'Test',
    shipping: 'Test',
    description: 'Synthetic fixture, never published externally',
    visibility: 'published',
  });
  await db.insert(productVariants).values({
    id: 'variant1',
    productId: 'product1',
    sku: 'TEST-001-2MG',
    quantity: '2 mg',
    presentation: 'powder',
    institutionalPriceCents: 100,
    active: true,
  });
  await db.insert(cartItems).values({ id: 'cart1', accountId: account.id, variantId: 'variant1', quantity: 2 });
  await db.insert(lots).values({
    id: 'lot1',
    lotNumber: 'TEST-LOT',
    productCode: 'TEST-001',
    productName: 'Synthetic',
    casNumber: '50-00-0',
    status: 'released',
    analyticalLab: 'Fixture lab',
    accessionNumber: 'ACC-FIXTURE',
    testingStandard: 'Fixture panel v1',
    receivedAt: new Date(),
    quantityReceived: '10 mg',
    quantityRemaining: '10 mg',
  });
});

afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
  local.sqlite.close();
  for (const key of Object.keys(env)) delete env[key];
});

describe('wholesale checkout', () => {
  it("quotes the organization's address on record and charges the rate the buyer chose", async () => {
    // A typed address is ignored: wholesale orders ship only to the address on record.
    const quoted = await quote(post('/api/checkout/quotes', { line1: '99 Somewhere Else', city: 'Elsewhere' }));
    expect(quoted.status).toBe(200);
    const body = (await quoted.json()) as {
      ok: boolean;
      quotes: { id: string; shippingCents: number; taxCents: number }[];
    };
    expect(body.ok).toBe(true);
    expect(body.quotes.length).toBeGreaterThan(0);
    const chosen = body.quotes[body.quotes.length - 1];

    const setting = RESEARCH_SETTINGS[0];
    const response = await submit(
      post('/api/orders', {
        token: 'b'.repeat(32),
        checkout_quote: chosen.id,
        confirm_ruo: 'on',
        confirm_age: 'on',
        research_setting: setting,
      }),
    );
    expect(response.status).toBe(303);
    expect(new URL(response.headers.get('location') ?? '').pathname).toMatch(/^\/account\/orders\/NX-\d{6}-\d{4}$/);

    const row = local.sqlite.prepare('SELECT * FROM orders').get() as Record<string, unknown>;
    expect(row.ship_to_line1).toBe('1 Receiving Dock');
    expect(row.shipping_cents).toBe(chosen.shippingCents);
    expect(row.shipping_cents).toBeGreaterThan(0);
    expect(row.tax_cents).toBe(chosen.taxCents);
    expect(row.total_cents).toBe(200 + chosen.shippingCents + chosen.taxCents);
    expect(row.age_confirmed).toBe(1);
    expect(row.research_setting).toBe(setting);
    expect(row.acknowledged_from).toBe('203.0.113.7');
  });

  it('refuses a wholesale order without a current delivery quote', async () => {
    const response = await submit(post('/api/orders', { token: 'c'.repeat(32), confirm_ruo: 'on', confirm_age: 'on' }));
    expect(response.status).toBe(303);
    const location = new URL(response.headers.get('location') ?? '');
    expect(location.pathname).toBe('/account/cart');
    // The refusal travels in a short-lived cookie; the URL carries only a code (lib/notice.ts).
    expect(location.searchParams.get('error')).toBe('notice');
    expect(noticeFrom(response)).toContain('Compare delivery options');
    expect(count('orders')).toBe(0);
  });

  it('does not quote for an organization that is not approved', async () => {
    local.sqlite.prepare("UPDATE organizations SET verification_status = 'revoked'").run();
    const response = await quote(post('/api/checkout/quotes', {}));
    expect(response.status).toBe(403);
    expect(count('checkout_quotes')).toBe(0);
  });

  it('tells the buyer ordering is not open, not which settings are missing, until shipping and tax are set up', async () => {
    // Production before live shipping and tax: nothing is set up, and every order still needs a quote.
    env.APP_ENV = 'production';
    for (const key of ['SHIPPING_PROVIDER', 'SHIPPING_SIMULATION_ENABLED', 'TAX_PROVIDER', 'TAX_SIMULATED_RATE_BPS']) delete env[key];
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const response = await quote(post('/api/checkout/quotes', {}));
    expect(response.status).toBe(422);
    const { error } = (await response.json()) as { error: string };
    expect(error).toContain('Online ordering is not open yet');
    expect(error).not.toMatch(/shippo|taxjar|provider|configur|live shipping/i);
    // Staff still get the reason, in the log as on /manage/readiness.
    expect(warn).toHaveBeenCalledWith(
      '[checkout-quote] online ordering is not open:',
      expect.stringContaining('Shipping provider is not configured.'),
    );
    warn.mockRestore();
    expect(count('checkout_quotes')).toBe(0);
  });
});
