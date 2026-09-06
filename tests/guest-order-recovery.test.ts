import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localD1 } from './helpers/local-d1';
const { env } = vi.hoisted(() => ({ env: {} as Record<string, unknown> }));
vi.mock('cloudflare:workers', () => ({ env }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
import { seedCommerceFixture, syntheticOrder } from './helpers/commerce-fixture';
import { issueOrderRecoveryCode, recoveredOrder, recoverOrder } from '@/lib/guest-order-recovery';
import { getBuyerFromRequest } from '@/lib/buyer-session';
import { POST as pay } from '@/app/api/orders/[orderNumber]/pay/route';
let local: ReturnType<typeof localD1>;
beforeEach(async () => { local = localD1(); Object.assign(env, { DB: local.binding, APP_ENV: 'staging', OPEN_CHECKOUT_ENABLED: 'true' }); await seedCommerceFixture(); });
afterEach(() => { local.sqlite.close(); for (const k of Object.keys(env)) delete env[k]; });
describe('one-order guest recovery without email verification', () => {
  it('recovers only the named order and never grants a buyer session or payment access', async () => {
    const first = await syntheticOrder(); const other = await syntheticOrder();
    const code = (await issueOrderRecoveryCode(first.buyer, first.detail.order.orderNumber))!;
    expect(local.sqlite.prepare('SELECT token_hash FROM guest_order_keys').get()!.token_hash).not.toBe(code.code);
    const grant = (await recoverOrder(code.orderNumber, code.code, true))!;
    expect(grant.cookie).toContain('HttpOnly'); expect(grant.cookie).toContain('Secure');
    const token = grant.cookie.split(';')[0].split('=')[1];
    expect((await recoveredOrder(token, code.orderNumber))?.order.id).toBe(first.detail.order.id);
    expect(await recoveredOrder(token, other.detail.order.orderNumber)).toBeNull();
    const request = new Request('https://test.invalid/api/orders/x/pay', { method: 'POST', headers: { Origin: 'https://test.invalid', Host: 'test.invalid', Cookie: grant.cookie.split(';')[0] }, body: new URLSearchParams({ method: 'invoice' }) });
    expect(await getBuyerFromRequest(request)).toBeNull();
    expect((await pay(request, { params: Promise.resolve({ orderNumber: code.orderNumber }) })).status).toBe(401);
  });
  it('does not use matching contact emails to grant access', async () => {
    const first = await syntheticOrder(); const second = await syntheticOrder();
    expect(first.detail.order.contactEmail).toBe(second.detail.order.contactEmail);
    expect(await issueOrderRecoveryCode(second.buyer, first.detail.order.orderNumber)).toBeNull();
    expect(await recoverOrder(first.detail.order.orderNumber, first.detail.order.contactEmail!, true)).toBeNull();
  });
  it('rotates codes and revokes previous recovered sessions', async () => {
    const first = await syntheticOrder();
    const old = (await issueOrderRecoveryCode(first.buyer, first.detail.order.orderNumber))!;
    const grant = (await recoverOrder(old.orderNumber, old.code, true))!;
    const fresh = (await issueOrderRecoveryCode(first.buyer, first.detail.order.orderNumber))!;
    expect(await recoverOrder(old.orderNumber, old.code, true)).toBeNull();
    expect(await recoveredOrder(grant.cookie.split(';')[0].split('=')[1], old.orderNumber)).toBeNull();
    expect(await recoverOrder(fresh.orderNumber, fresh.code, true)).not.toBeNull();
  });
  it('rejects expired codes, expired sessions and suspended owners', async () => {
    const first = await syntheticOrder(); const code = (await issueOrderRecoveryCode(first.buyer, first.detail.order.orderNumber))!;
    const grant = (await recoverOrder(code.orderNumber, code.code, true))!;
    local.sqlite.exec('UPDATE guest_order_sessions SET expires_at = 0; UPDATE guest_order_keys SET expires_at = 0');
    expect(await recoveredOrder(grant.cookie.split(';')[0].split('=')[1], code.orderNumber)).toBeNull();
    expect(await recoverOrder(code.orderNumber, code.code, true)).toBeNull();
    local.sqlite.exec("UPDATE accounts SET status = 'suspended'");
    expect(await issueOrderRecoveryCode(first.buyer, code.orderNumber)).toBeNull();
  });
  it('does not issue a usable code if suspension races the final write', async () => {
    const first = await syntheticOrder();
    local.beforeNextBatch(() => local.sqlite.exec("UPDATE accounts SET status = 'suspended'"));
    expect(await issueOrderRecoveryCode(first.buyer, first.detail.order.orderNumber)).toBeNull();
    expect(local.sqlite.prepare('SELECT count(*) n FROM guest_order_keys').get()!.n).toBe(0);
  });
});
