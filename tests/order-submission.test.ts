import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localD1 } from './helpers/local-d1';
const { env } = vi.hoisted(() => ({ env: {} as { DB?: D1Database } }));
vi.mock('cloudflare:workers', () => ({ env }));
import { getDb } from '@/db';
import { accounts, accountSessions, cartItems, lots, organizations, products, productVariants } from '@/db/schema';
import { createOrderFromCart, shipToFromOrganization, type ShipTo } from '@/lib/orders';
import { RUO_VERSION, TERMS_VERSION } from '@/lib/policy';
import type { AccountPrincipal } from '@/lib/account-auth';
import type { Visibility } from '@/lib/visibility-rules';

let local: ReturnType<typeof localD1>;
let shipTo: ShipTo;
const account: AccountPrincipal = { id: 'customer', email: 'synthetic@example.invalid', name: 'Synthetic customer', tier: 'institutional', status: 'active', verificationStatus: 'approved', sessionId: 'session1', ruoVersion: RUO_VERSION, termsVersion: TERMS_VERSION };
const visibility: Visibility = { signedIn: true, pricing: 'institutional', availability: true, reason: null };
const token = 'a'.repeat(32);
const submit = () => createOrderFromCart(account, visibility, shipTo, 'org1', null, token);
const count = (table: string) => local.sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get()!.n;
beforeEach(async () => {
  local = localD1(); env.DB = local.binding;
  const db = getDb();
  await db.insert(accounts).values({ ...account, passwordHash: 'disabled' });
  await db.insert(accountSessions).values({ id: 'session1', accountId: account.id, tokenHash: 'unused', expiresAt: new Date(Date.now() + 3600000) });
  const [org] = await db.insert(organizations).values({ id: 'org1', accountId: account.id, legalName: 'Synthetic institution', website: 'https://example.invalid', emailDomain: 'example.invalid', organizationType: 'analytical_lab', addressLine1: 'Test address', city: 'Test', region: 'CA', postalCode: '00000', country: 'US', researchContext: 'Synthetic test only', receivingParty: 'Synthetic receiver', verificationStatus: 'approved', submittedAt: new Date() }).returning();
  shipTo = shipToFromOrganization(org, account);
  await db.insert(products).values({ id: 'product1', code: 'TEST-001', slug: 'synthetic-product', name: 'Synthetic product', formalName: 'Test', chemicalClass: 'Test', casNumber: '50-00-0', molecularFormula: 'Test', molecularWeight: 'Test', purity: 'Test', form: 'Test', saltForm: 'Test', storageSolid: 'Test', storageStock: 'Test', stability: 'Test', shipping: 'Test', description: 'Synthetic fixture, never published externally', visibility: 'published' });
  await db.insert(productVariants).values({ id: 'variant1', productId: 'product1', sku: 'TEST-001-2MG', quantity: '2 mg', presentation: 'powder', institutionalPriceCents: 100, active: true });
  await db.insert(cartItems).values({ id: 'cart1', accountId: account.id, variantId: 'variant1', quantity: 2 });
  await db.insert(lots).values({ id: 'lot1', lotNumber: 'TEST-LOT', productCode: 'TEST-001', productName: 'Synthetic', casNumber: '50-00-0', status: 'released', analyticalLab: 'Fixture lab', accessionNumber: 'ACC-FIXTURE', testingStandard: 'Fixture panel v1', receivedAt: new Date(), quantityRemaining: '10 mg' });
});
afterEach(() => { local.sqlite.close(); delete env.DB; });

describe('checkout acceptance is guarded at commit', () => {
  it('accepts the reviewed order, preserves prices/address, clears cart and enqueues once', async () => {
    expect((await submit()).ok).toBe(true);
    expect(count('orders')).toBe(1); expect(count('order_items')).toBe(1);
    expect(count('cart_items')).toBe(0); expect(count('notifications')).toBe(1);
    const row = local.sqlite.prepare('SELECT * FROM orders').get()!;
    expect(row.total_cents).toBe(200);
    expect(row.ship_to_line1).toBe('Test address');
    expect(row.payment_status).toBe('unpaid');
    expect(row.created_at).toBeGreaterThan(0);
    expect((await submit()).ok).toBe(true);
    expect(count('orders')).toBe(1);
  });
  it.each([
    "UPDATE accounts SET status = 'suspended'",
    "UPDATE accounts SET verification_status = 'revoked'",
    "UPDATE organizations SET verification_status = 'revoked'",
    "UPDATE organizations SET address_line1 = 'Changed address'",
    "UPDATE account_sessions SET revoked_at = unixepoch()",
    "UPDATE account_sessions SET expires_at = unixepoch() - 1",
    "UPDATE accounts SET ruo_version = 'old'",
    "UPDATE products SET visibility = 'withdrawn'",
    "UPDATE product_variants SET active = 0",
    "UPDATE product_variants SET institutional_price_cents = 150",
    "UPDATE product_variants SET quantity = '5 mg'",
    "UPDATE cart_items SET quantity = 3",
    "UPDATE lots SET status = 'on_hold'",
    "UPDATE lots SET superseded_by_id = 'replacement'",
  ])('rejects a concurrent change without clearing the cart or creating orphan records: %s', async (change) => {
    local.beforeNextBatch(() => local.sqlite.exec(change));
    const result = await submit();
    expect(result.ok).toBe(false);
    expect(count('orders')).toBe(0); expect(count('order_items')).toBe(0);
    expect(count('order_events')).toBe(0); expect(count('notifications')).toBe(0);
    expect(count('cart_items')).toBe(1);
  });
  it('returns the same order for overlapping submissions of the same cart', async () => {
    const results = await Promise.all([submit(), submit()]);
    expect(results.every((result) => result.ok)).toBe(true);
    if (results[0].ok && results[1].ok) expect(results[0].orderNumber).toBe(results[1].orderNumber);
    expect(count('orders')).toBe(1); expect(count('notifications')).toBe(1);
  });
  it('accepts the full 20-line cart within D1 parameter limits', async () => {
    for (let i = 2; i <= 20; i++) {
      await getDb().insert(productVariants).values({ id: `variant${i}`, productId: 'product1', sku: `TEST-SKU-${i}`, quantity: `${i} mg`, presentation: 'powder', institutionalPriceCents: 100, active: true });
      await getDb().insert(cartItems).values({ id: `cart${i}`, accountId: account.id, variantId: `variant${i}`, quantity: 1 });
    }
    expect((await submit()).ok).toBe(true);
    expect(count('order_items')).toBe(20);
    expect(count('notifications')).toBe(1);
  });
});
