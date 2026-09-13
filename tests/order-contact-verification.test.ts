import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localD1 } from './helpers/local-d1';

const { env } = vi.hoisted(() => ({ env: {} as Record<string, unknown> }));
vi.mock('cloudflare:workers', () => ({ env }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

import { seedCommerceFixture, syntheticOrder } from './helpers/commerce-fixture';
import { getOrderByNumber } from '@/lib/orders';
import {
  contactVerification,
  requestContactVerification,
  verifyContactToken,
} from '@/lib/order-contact-verification';
import { lotConsignees } from '@/lib/customer-reachability';

/**
 * Chapter 10 c10-verify. Verification is a recall requirement asked for after
 * the order, so these tests care about two things above all: that nothing is
 * blocked at the point of sale, and that a token cannot verify anything it was
 * not issued for.
 */

let local: ReturnType<typeof localD1>;

const tokenFromNotice = () => {
  const row = local.sqlite
    .prepare("SELECT action_path, body FROM notifications WHERE id LIKE 'verify:%' ORDER BY rowid DESC LIMIT 1")
    .get() as { action_path: string; body: string } | undefined;
  return row?.action_path?.split('token=')[1] ?? '';
};

beforeEach(async () => {
  local = localD1();
  Object.assign(env, {
    DB: local.binding,
    APP_ENV: 'staging',
    OPEN_CHECKOUT_ENABLED: 'true',
    INVENTORY_RESERVATION_MINUTES: '30',
    PUBLIC_ORIGIN: 'https://staging.example.invalid',
  });
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('No external calls')));
  await seedCommerceFixture();
});

afterEach(() => {
  vi.unstubAllGlobals();
  local.sqlite.close();
  for (const key of Object.keys(env)) delete env[key];
});

describe('asking', () => {
  it('queues one notice with a link, and the token is never stored in the clear', async () => {
    const order = await syntheticOrder(1);
    expect(await requestContactVerification(order.detail.order.id)).toEqual({ ok: true, sent: true });

    const notice = local.sqlite
      .prepare("SELECT recipient, subject, body, action_path FROM notifications WHERE id LIKE 'verify:%'")
      .get() as { recipient: string; subject: string; body: string; action_path: string };
    expect(notice.recipient).toBe('synthetic@example.invalid');
    expect(notice.subject).toContain(order.detail.order.orderNumber);
    expect(notice.body).toContain('https://staging.example.invalid/api/orders/verify?token=');
    expect(notice.body).toContain('Nothing is held up');

    const token = tokenFromNotice();
    const stored = local.sqlite.prepare('SELECT token_hash FROM order_contact_verifications').get() as { token_hash: string };
    expect(token.length).toBeGreaterThan(31);
    expect(stored.token_hash).not.toBe(token);
  });

  it('does not ask twice for the same order', async () => {
    const order = await syntheticOrder(1);
    await requestContactVerification(order.detail.order.id);
    expect(await requestContactVerification(order.detail.order.id)).toEqual({ ok: true, sent: false });
    expect(local.sqlite.prepare("SELECT count(*) n FROM notifications WHERE id LIKE 'verify:%'").get()!.n).toBe(1);
  });

  it('re-issues on a resend, and the previous link stops working', async () => {
    const order = await syntheticOrder(1);
    await requestContactVerification(order.detail.order.id);
    const first = tokenFromNotice();
    expect(await requestContactVerification(order.detail.order.id, { resend: true })).toEqual({ ok: true, sent: true });
    const second = tokenFromNotice();
    expect(second).not.toBe(first);
    expect(await verifyContactToken(first)).toEqual({ ok: false, reason: 'unknown' });
    expect((await verifyContactToken(second)).ok).toBe(true);
  });

  it('stops resending after five', async () => {
    const order = await syntheticOrder(1);
    await requestContactVerification(order.detail.order.id);
    for (let i = 0; i < 4; i += 1) {
      expect((await requestContactVerification(order.detail.order.id, { resend: true })).ok).toBe(true);
    }
    const result = await requestContactVerification(order.detail.order.id, { resend: true });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain('5 times');
  });

  it('says so rather than throwing when there is nothing to verify', async () => {
    expect(await requestContactVerification('ord_does_not_exist')).toEqual({
      ok: false,
      error: 'Order not found.',
    });
  });
});

describe('confirming', () => {
  it('marks the order verified and says which one', async () => {
    const order = await syntheticOrder(1);
    await requestContactVerification(order.detail.order.id);
    const result = await verifyContactToken(tokenFromNotice());
    expect(result).toEqual({ ok: true, orderNumber: order.detail.order.orderNumber });

    const state = await contactVerification(order.detail.order.id);
    expect(state.verifiedAt).not.toBeNull();
    expect(state.email).toBe('synthetic@example.invalid');
  });

  it('is idempotent — a link clicked twice is not an error', async () => {
    const order = await syntheticOrder(1);
    await requestContactVerification(order.detail.order.id);
    const token = tokenFromNotice();
    expect((await verifyContactToken(token)).ok).toBe(true);
    expect((await verifyContactToken(token)).ok).toBe(true);
  });

  it('refuses a token that was never issued, and one that has expired', async () => {
    const order = await syntheticOrder(1);
    await requestContactVerification(order.detail.order.id);
    expect(await verifyContactToken('f'.repeat(64))).toEqual({ ok: false, reason: 'unknown' });
    expect(await verifyContactToken('not-a-token')).toEqual({ ok: false, reason: 'unknown' });

    local.sqlite.exec('UPDATE order_contact_verifications SET expires_at = 1');
    expect(await verifyContactToken(tokenFromNotice())).toEqual({ ok: false, reason: 'expired' });
    expect((await contactVerification(order.detail.order.id)).expired).toBe(true);
  });

  it('verifies other unverified orders of the same buyer to the same address, and nothing else', async () => {
    const first = await syntheticOrder(1);
    await requestContactVerification(first.detail.order.id);
    // a second order from a different buyer, same address text
    const second = await syntheticOrder(1);
    await verifyContactToken(tokenFromNotice());

    expect((await getOrderByNumber(first.detail.order.orderNumber))!.order.contactVerifiedAt).not.toBeNull();
    expect((await getOrderByNumber(second.detail.order.orderNumber))!.order.contactVerifiedAt).toBeNull();
  });
});

describe('what it changes for a recall', () => {
  it('turns an unproven consignee into a reachable one', async () => {
    const order = await syntheticOrder(1);
    local.sqlite.exec("UPDATE order_items SET lot_number = 'SYNTHETIC-LOT'");
    local.sqlite.exec(`UPDATE orders SET shipped_at = ${Math.floor(Date.now() / 1000)}`);

    expect((await lotConsignees('SYNTHETIC-LOT'))[0].reachability.state).toBe('unproven');
    await requestContactVerification(order.detail.order.id);
    await verifyContactToken(tokenFromNotice());
    expect((await lotConsignees('SYNTHETIC-LOT'))[0].reachability.state).toBe('reachable');
  });
});
