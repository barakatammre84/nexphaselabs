import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localD1 } from './helpers/local-d1';
const { env } = vi.hoisted(() => ({ env: {} as Record<string, unknown> }));
vi.mock('cloudflare:workers', () => ({ env }));
import { getDb } from '@/db';
import { accounts, orders, orderEvents } from '@/db/schema';
import { notifications } from '@/db/notifications-schema';
import { dispatchNotifications, handleNotification, RETRY_WINDOW_SECONDS } from '@/lib/notifications';

let local: ReturnType<typeof localD1>;
const now = new Date('2026-09-05T12:00:00Z');
const later = (seconds: number) => new Date(now.getTime() + seconds * 1000);
const row = () => local.sqlite.prepare('SELECT * FROM notifications').get()!;
const history = () => local.sqlite.prepare('SELECT * FROM notification_events ORDER BY created_at').all();
const provider = vi.fn();
beforeEach(async () => {
  local = localD1();
  Object.assign(env, { DB: local.binding, APP_ENV: 'staging', RESEND_API_KEY: 'synthetic-key', TEST_EMAIL_ALLOWLIST: 'test@example.org', PUBLIC_ORIGIN: 'https://test.example.org' });
  vi.stubGlobal('fetch', provider);
  provider.mockReset().mockResolvedValue(new Response(JSON.stringify({ id: 'provider-1' }), { status: 200 }));
  await getDb().insert(accounts).values({ id: 'customer', email: 'test@example.org', name: 'Test', passwordHash: 'unused', tier: 'institutional' });
  await getDb().insert(orders).values({ id: 'order1', orderNumber: 'NPL-1', accountId: 'customer', subtotalCents: 100, totalCents: 100, priceTier: 'institutional', consigneeName: 'Test', shipToLine1: 'Test', shipToCity: 'Test', shipToRegion: 'CA', shipToPostalCode: '00000', shipToCountry: 'US', submittedAt: now });
  await getDb().insert(orderEvents).values({ id: 'event1', orderId: 'order1', fromStatus: '', toStatus: 'submitted', actor: 'customer', note: 'PRIVATE STAFF NOTE' });
  local.sqlite.prepare('UPDATE notifications SET next_attempt_at = ?, created_at = ?').run(now.getTime() / 1000, now.getTime() / 1000);
});
afterEach(() => { local.sqlite.close(); for (const key of Object.keys(env)) delete env[key]; vi.unstubAllGlobals(); });

describe('durable order notifications', () => {
  it('queues one notice with the event without including private notes', () => {
    expect(row().id).toBe('order:event1');
    expect(row().recipient).toBe('test@example.org');
    expect(row().body).toContain('submitted');
    expect(row().body).not.toContain('PRIVATE');
  });
  it('rolls back the order and event if the queue cannot record the notice', async () => {
    local.sqlite.exec("CREATE TRIGGER reject_notice BEFORE INSERT ON notifications BEGIN SELECT RAISE(ABORT, 'simulated queue failure'); END;");
    await expect(getDb().batch([
      getDb().update(orders).set({ status: 'cancelled' }),
      getDb().insert(orderEvents).values({ id: 'event2', orderId: 'order1', fromStatus: 'submitted', toStatus: 'cancelled', actor: 'staff' }),
    ])).rejects.toThrow();
    expect(local.sqlite.prepare('SELECT status FROM orders').get()!.status).toBe('submitted');
    expect(local.sqlite.prepare('SELECT count(*) AS n FROM order_events').get()!.n).toBe(1);
  });
  it('claims a due notice once when dispatchers overlap and never resends accepted notices', async () => {
    await Promise.all([dispatchNotifications(5, now), dispatchNotifications(5, now)]);
    expect(provider).toHaveBeenCalledTimes(1);
    expect(row().status).toBe('accepted');
    expect(history()).toHaveLength(1);
    expect(history()[0].detail).toContain('Inbox delivery is not confirmed');
    await dispatchNotifications(5, later(600));
    expect(provider).toHaveBeenCalledTimes(1);
  });
  it('retries uncertain delivery with the same key and frozen payload', async () => {
    provider.mockRejectedValueOnce(new Error('network'));
    expect((await dispatchNotifications(5, now)).retrying).toBe(1);
    expect(row().next_attempt_at).toBe(later(60).getTime() / 1000);
    await dispatchNotifications(5, later(59));
    expect(provider).toHaveBeenCalledTimes(1);
    env.EMAIL_FROM = 'Changed <changed@example.org>';
    env.PUBLIC_ORIGIN = 'https://changed.example.org';
    await dispatchNotifications(5, later(60));
    expect(row().status).toBe('accepted');
    const calls = provider.mock.calls;
    expect(calls[0][1].body).toBe(calls[1][1].body);
    expect(calls[0][1].headers['Idempotency-Key']).toBe(calls[1][1].headers['Idempotency-Key']);
    expect(JSON.parse(calls[0][1].body).subject).toMatch(/^\[TEST\]/);
    expect(JSON.parse(calls[0][1].body).text).toContain('https://test.example.org/account/orders/NPL-1');
  });
  it('records a missing provider as attention without pretending to send', async () => {
    delete env.RESEND_API_KEY;
    expect((await dispatchNotifications(5, now)).attention).toBe(1);
    expect(provider).not.toHaveBeenCalled();
    expect(row().attempts).toBe(0);
    expect(history()[0].action).toBe('attention');
    env.RESEND_API_KEY = 'synthetic-key';
    expect(await handleNotification(String(row().id), 'retry', 'Admin (staff1)', 'Provider configuration checked', now)).toBe(true);
    await dispatchNotifications(5, now);
    expect(row().status).toBe('accepted');
    expect(history().find((event) => event.action === 'retry')?.actor).toBe('Admin (staff1)');
  });
  it('blocks non-allowlisted staging recipients even with a provider key', async () => {
    env.TEST_EMAIL_ALLOWLIST = 'someoneelse@example.org';
    await dispatchNotifications(5, now);
    expect(provider).not.toHaveBeenCalled();
    expect(row().status).toBe('attention');
  });
  it('stops before the provider idempotency window expires and requires manual resolution', async () => {
    provider.mockRejectedValueOnce(new Error('lost response'));
    await dispatchNotifications(5, now);
    await dispatchNotifications(5, later(RETRY_WINDOW_SECONDS));
    expect(provider).toHaveBeenCalledTimes(1);
    expect(row().status).toBe('attention');
    expect(await handleNotification(String(row().id), 'retry', 'Admin', 'Checked', later(RETRY_WINDOW_SECONDS))).toBe(false);
    expect(await handleNotification(String(row().id), 'resolve', 'Admin', '', later(RETRY_WINDOW_SECONDS))).toBe(false);
    expect(await handleNotification(String(row().id), 'resolve', 'Admin', 'Provider history reviewed; customer contacted separately.', later(RETRY_WINDOW_SECONDS))).toBe(true);
    expect(row().status).toBe('resolved');
  });
  it('recovers an expired dispatcher lease without changing its original payload', async () => {
    const envelope = JSON.stringify({ from: 'Test <test@example.org>', to: ['test@example.org'], subject: '[TEST] original', text: 'original' });
    await getDb().update(notifications).set({ status: 'sending', leaseId: 'old-worker', leaseUntil: later(120), firstAttemptAt: now, attempts: 1, envelope });
    await dispatchNotifications(5, later(119));
    expect(provider).not.toHaveBeenCalled();
    await dispatchNotifications(5, later(120));
    expect(provider.mock.calls[0][1].body).toBe(envelope);
    expect(row().attempts).toBe(2);
  });
  it.each(['not json', JSON.stringify({ to: ['other@example.org'] })])('quarantines corrupt or redirected payloads: %s', async (envelope) => {
    await getDb().update(notifications).set({ envelope });
    await dispatchNotifications(5, now);
    expect(provider).not.toHaveBeenCalled();
    expect(row().status).toBe('attention');
  });
  it.each([400, 401, 403, 422])('does not automatically retry provider rejection %s', async (status) => {
    provider.mockResolvedValueOnce(new Response('', { status }));
    await dispatchNotifications(5, now);
    expect(row().status).toBe('attention');
  });
  it.each([408, 429, 500, 503])('backs off for temporary provider response %s', async (status) => {
    provider.mockResolvedValueOnce(new Response('', { status }));
    await dispatchNotifications(5, now);
    expect(row().status).toBe('retry');
  });
  it('does not mistake a success response without a provider reference for acceptance', async () => {
    provider.mockResolvedValueOnce(new Response('{}', { status: 200 }));
    await dispatchNotifications(5, now);
    expect(row().status).toBe('retry');
    expect(row().accepted_at).toBeNull();
  });
  it('halts at the attempt budget and cannot retry an accepted or exhausted record', async () => {
    await getDb().update(notifications).set({ attempts: 8, firstAttemptAt: now });
    await dispatchNotifications(5, now);
    expect(provider).not.toHaveBeenCalled();
    expect(await handleNotification(String(row().id), 'retry', 'Admin', 'Checked', now)).toBe(false);
    local.sqlite.exec("UPDATE notifications SET status = 'accepted', attempts = 1");
    expect(await handleNotification(String(row().id), 'retry', 'Admin', 'Checked', now)).toBe(false);
    expect(await handleNotification(String(row().id), 'resolve', 'Admin', 'Checked', now)).toBe(false);
  });
});
