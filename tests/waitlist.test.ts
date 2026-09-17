import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localD1 } from './helpers/local-d1';
import { seedCommerceFixture } from './helpers/commerce-fixture';

const { env } = vi.hoisted(() => ({ env: {} as Record<string, unknown> }));
vi.mock('cloudflare:workers', () => ({ env }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
// The route reads the session from the request; the test names the account with a header instead.
vi.mock('@/lib/account-auth', () => ({
  getAccountFromRequest: async (request: Request) =>
    request.headers.get('x-test-account')
      ? { id: request.headers.get('x-test-account'), email: 'buyer@example.invalid', status: 'active', tier: 'researcher' }
      : null,
}));

import { getDb } from '@/db';
import { accounts } from '@/db/schema';
import { POST } from '@/app/api/waitlist/route';
import {
  joinWaitlist,
  leaveWaitlist,
  listWaitlistForAccount,
  normaliseSku,
  notifyWaitlist,
  sweepWaitlist,
  WAITLIST_COPY,
  waitlistSummary,
  waitlistedSkus,
} from '@/lib/waitlist';

let local: ReturnType<typeof localD1>;
const SKU = 'NPL-9999-2MG';
const row = (sql: string) => local.sqlite.prepare(sql).get() as Record<string, unknown> | undefined;
const all = (sql: string) => local.sqlite.prepare(sql).all() as Record<string, unknown>[];

beforeEach(async () => {
  local = localD1();
  Object.assign(env, { DB: local.binding, APP_ENV: 'staging', OPEN_CHECKOUT_ENABLED: 'true', ACCOUNT_REQUIRED: 'true' });
  await seedCommerceFixture();
  await getDb().insert(accounts).values([
    { id: 'acct_a', email: 'buyer@example.invalid', name: 'Buyer', passwordHash: 'unused', tier: 'researcher', status: 'active' },
    { id: 'acct_b', email: 'second@example.invalid', name: 'Second', passwordHash: 'unused', tier: 'researcher', status: 'active' },
    { id: 'acct_off', email: 'closed@example.invalid', name: 'Closed', passwordHash: 'unused', tier: 'researcher', status: 'suspended' },
  ]);
});
afterEach(() => {
  local.sqlite.close();
  for (const key of Object.keys(env)) delete env[key];
});

const post = (body: Record<string, string>, headers: Record<string, string> = {}) =>
  POST(
    new Request('http://localhost/api/waitlist', {
      method: 'POST',
      headers: { Origin: 'http://localhost', Host: 'localhost', ...headers },
      body: new URLSearchParams(body),
    }),
  );

describe('waitlist requests', () => {
  it('normalises the pack code and refuses one that is not offered', async () => {
    expect(normaliseSku(' npl-9999-2mg ')).toBe(SKU);
    expect(normaliseSku('../x')).toBeNull();
    expect(await joinWaitlist('acct_a', 'NPL-0000-1MG')).toEqual({ ok: false, error: WAITLIST_COPY.unknownPack });
    expect(await joinWaitlist('acct_a', '')).toEqual({ ok: false, error: WAITLIST_COPY.unknownPack });
  });

  it('records one request per pack size, lets the customer withdraw it, and re-arms it on request', async () => {
    const first = await joinWaitlist('acct_a', SKU);
    expect(first).toEqual({ ok: true, already: false, sku: SKU, productSlug: 'synthetic' });
    expect(await waitlistedSkus('acct_a')).toEqual([SKU]);
    expect(await joinWaitlist('acct_a', SKU)).toMatchObject({ ok: true, already: true });
    expect(all('SELECT id FROM stock_waitlist')).toHaveLength(1);

    const [entry] = await listWaitlistForAccount('acct_a');
    expect(entry).toMatchObject({ sku: SKU, productCode: 'NPL-9999', productName: 'Synthetic only', productSlug: 'synthetic', pack: '2 mg · powder', status: 'waiting', notifiedAt: null });

    expect(await leaveWaitlist('acct_b', entry.id)).toBe(false); // not theirs
    expect(await leaveWaitlist('acct_a', entry.id)).toBe(true);
    expect(await leaveWaitlist('acct_a', entry.id)).toBe(false); // already cancelled
    expect(await listWaitlistForAccount('acct_a')).toEqual([]);
    expect(row('SELECT status FROM stock_waitlist')?.status).toBe('cancelled');

    expect(await joinWaitlist('acct_a', SKU)).toMatchObject({ ok: true, already: false });
    expect(row('SELECT id, status FROM stock_waitlist')).toEqual({ id: entry.id, status: 'waiting' });
  });

  it('notifies once when a released lot can supply the pack size, and never again', async () => {
    await joinWaitlist('acct_a', SKU);
    await joinWaitlist('acct_b', SKU);
    await joinWaitlist('acct_off', SKU);
    const cancelled = await joinWaitlist('acct_b', SKU); // already waiting
    expect(cancelled).toMatchObject({ already: true });

    // Nothing sellable: the request stays and nothing is queued.
    local.sqlite.prepare("UPDATE lots SET status = 'quarantine'").run();
    expect(await notifyWaitlist('NPL-9999')).toBe(0);
    expect(await sweepWaitlist()).toEqual({ ok: true, products: 1, queued: 0 });
    expect(all('SELECT id FROM notifications')).toHaveLength(0);

    // Released: one outbox row per active waiting account; the closed account is skipped.
    local.sqlite.prepare("UPDATE lots SET status = 'released'").run();
    expect(await notifyWaitlist('npl-9999')).toBe(2);
    const notices = all('SELECT id, order_number, category, action_path, recipient, subject, body, status FROM notifications ORDER BY recipient');
    expect(notices.map((n) => n.recipient)).toEqual(['buyer@example.invalid', 'second@example.invalid']);
    expect(notices[0]).toMatchObject({ order_number: 'NPL-9999', category: 'waitlist', action_path: '/catalog/synthetic', status: 'pending' });
    expect(notices[0].subject).toBe('Synthetic only 2 mg can be ordered again — NexPhase Labs');
    const body = String(notices[0].body);
    expect(body).toContain('A lot has been released');
    expect(body).toContain('does not reserve any');
    expect(body).toContain('laboratory research use only');
    expect(body).not.toMatch(/\$|price/i);

    const requests = all('SELECT account_id, status, notify_count, last_notification_id FROM stock_waitlist ORDER BY account_id');
    expect(requests.find((r) => r.account_id === 'acct_a')).toMatchObject({ status: 'notified', notify_count: 1, last_notification_id: notices[0].id });
    expect(requests.find((r) => r.account_id === 'acct_off')).toMatchObject({ status: 'waiting', notify_count: 0 });

    // A second release pass and the sweep add nothing.
    expect(await notifyWaitlist('NPL-9999')).toBe(0);
    expect(await sweepWaitlist()).toEqual({ ok: true, products: 1, queued: 0 });
    expect(all('SELECT id FROM notifications')).toHaveLength(2);

    const summary = await waitlistSummary();
    expect(summary).toHaveLength(1);
    expect(summary[0]).toMatchObject({ productCode: 'NPL-9999', productName: 'Synthetic only', sku: SKU, pack: '2 mg · powder', waiting: 1, notified: 2 });
    expect(summary[0].latestAt).toBeInstanceOf(Date);

    // The customer asks again after being told: a new request, a new notice later.
    expect(await joinWaitlist('acct_a', SKU)).toMatchObject({ ok: true, already: false });
    expect(await notifyWaitlist('NPL-9999')).toBe(1);
    expect(row("SELECT notify_count FROM stock_waitlist WHERE account_id = 'acct_a'")?.notify_count).toBe(2);
  });

  it('skips a cancelled request when the lot is released', async () => {
    await joinWaitlist('acct_a', SKU);
    const [entry] = await listWaitlistForAccount('acct_a');
    await leaveWaitlist('acct_a', entry.id);
    expect(await notifyWaitlist('NPL-9999')).toBe(0);
    expect(all('SELECT id FROM notifications')).toHaveLength(0);
    expect(await waitlistSummary()).toEqual([]);
  });
});

describe('POST /api/waitlist', () => {
  it('sends a stranger to sign in — there is no guest to email', async () => {
    const json = await post({ intent: 'join', sku: SKU, return_to: '/catalog/synthetic' }, { Accept: 'application/json' });
    expect(json.status).toBe(401);
    expect(await json.json()).toEqual({ ok: false, error: WAITLIST_COPY.signIn, signIn: '/account/sign-in?return_to=%2Fcatalog%2Fsynthetic' });
    const form = await post({ intent: 'join', sku: SKU, return_to: '/catalog/synthetic' });
    expect(form.status).toBe(303);
    expect(form.headers.get('Location')).toBe('http://localhost/account/sign-in?return_to=%2Fcatalog%2Fsynthetic');
    expect(all('SELECT id FROM stock_waitlist')).toHaveLength(0);
  });

  it('joins for the panel (JSON) and the plain form (303), and leaves from the account page', async () => {
    const json = await post({ intent: 'join', sku: SKU, return_to: '/catalog/synthetic' }, { Accept: 'application/json', 'x-test-account': 'acct_a' });
    expect(json.status).toBe(200);
    expect(await json.json()).toEqual({ ok: true, already: false, sku: SKU });

    const again = await post({ intent: 'join', sku: SKU, return_to: '/catalog/synthetic' }, { 'x-test-account': 'acct_a' });
    expect(again.status).toBe(303);
    expect(again.headers.get('Location')).toBe('http://localhost/catalog/synthetic?waitlist=joined');

    const bad = await post({ intent: 'join', sku: 'NPL-0000-1MG', return_to: 'https://elsewhere.example/x' }, { 'x-test-account': 'acct_a' });
    expect(bad.status).toBe(303);
    expect(bad.headers.get('Location')).toBe('http://localhost/catalog?waitlist=error'); // off-site return ignored
    expect(bad.headers.get('Set-Cookie')).toContain('nx_notice');

    const [entry] = await listWaitlistForAccount('acct_a');
    const leave = await post({ intent: 'leave', id: entry.id }, { 'x-test-account': 'acct_a' });
    expect(leave.status).toBe(303);
    expect(leave.headers.get('Location')).toBe('http://localhost/account/waitlist?removed=1');
    expect(await listWaitlistForAccount('acct_a')).toEqual([]);
  });

  it('refuses a cross-site post', async () => {
    const response = await post({ intent: 'join', sku: SKU }, { Origin: 'https://elsewhere.example', 'x-test-account': 'acct_a' });
    expect(response.status).toBe(403);
  });
});
