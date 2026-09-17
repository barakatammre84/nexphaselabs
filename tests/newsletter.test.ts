import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localD1 } from './helpers/local-d1';
import { seedCommerceFixture } from './helpers/commerce-fixture';

const { env, sent } = vi.hoisted(() => ({ env: {} as Record<string, unknown>, sent: [] as { to: string; subject: string; text: string }[] }));
vi.mock('cloudflare:workers', () => ({ env }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@/lib/email', () => ({
  sendEmail: vi.fn(async (message: { to: string; subject: string; text: string }) => {
    sent.push(message);
    return { ok: true, id: null };
  }),
}));

import { getDb } from '@/db';
import { accounts } from '@/db/schema';
import { signUp, verifyEmailToken } from '@/lib/account-auth';
import { addToCart } from '@/lib/cart';
import { brevoConfigured, brevoSendMarketing, brevoSender } from '@/lib/brevo';
import { cartRemindersEnabled, sendCartReminders } from '@/lib/cart-reminders';
import { confirmConsent, consentForAccount, requestConsent, revokeConsent, sweepMarketingSync } from '@/lib/marketing-consent';
import { visibilityFor } from '@/lib/visibility-rules';
import { POST as newsletterPost } from '@/app/api/newsletter/route';
import { POST as oneClick } from '@/app/api/newsletter/unsubscribe/route';
import { POST as brevoWebhook } from '@/app/api/webhooks/brevo/route';

let local: ReturnType<typeof localD1>;
const calls: { url: string; init: RequestInit }[] = [];
const row = (sql: string, ...args: (string | number)[]) => local.sqlite.prepare(sql).get(...args) as Record<string, unknown> | undefined;
const tokenFrom = (text: string, path: string) => new URL(text.match(new RegExp(`https?://\\S+${path}\\S+`))![0]).searchParams.get('token')!;

beforeEach(async () => {
  local = localD1();
  Object.assign(env, {
    DB: local.binding,
    APP_ENV: 'staging',
    PUBLIC_ORIGIN: 'https://staging.example.invalid',
    OPEN_CHECKOUT_ENABLED: 'true',
    TEST_EMAIL_ALLOWLIST: 'ada@example.org,bob@example.org,new@example.org',
    BREVO_API_KEY: 'brevo-test-key',
    BREVO_LIST_ID: '7',
    BREVO_SENDER: 'NexPhase Labs <news@news.example.invalid>',
    BREVO_WEBHOOK_TOKEN: 'hook-token',
  });
  sent.length = 0;
  calls.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ id: 1, messageId: '<m1@brevo>' }), { status: 201 });
    }),
  );
  await seedCommerceFixture();
  await getDb().insert(accounts).values([
    { id: 'acct_ada', email: 'ada@example.org', name: 'Ada', passwordHash: 'unused', tier: 'researcher', status: 'active' },
    { id: 'acct_bob', email: 'bob@example.org', name: 'Bob', passwordHash: 'unused', tier: 'researcher', status: 'active' },
  ]);
});
afterEach(() => {
  vi.unstubAllGlobals();
  local.sqlite.close();
  for (const key of Object.keys(env)) delete env[key];
});

const post = (path: string, body: Record<string, string>, headers: Record<string, string> = {}) =>
  new Request(`https://staging.example.invalid${path}`, {
    method: 'POST',
    headers: { Origin: 'https://staging.example.invalid', Host: 'staging.example.invalid', ...headers },
    body: new URLSearchParams(body),
  });

describe('product-news consent', () => {
  it('is double opt-in from the footer: pending until the emailed link is opened, then synced to Brevo', async () => {
    const requested = await requestConsent({ email: ' Ada@Example.org ', source: 'footer', clientAddress: '1.2.3.4' });
    expect(requested).toMatchObject({ ok: true, status: 'pending' });
    expect(row("SELECT status, source, client_address FROM marketing_consents WHERE email = 'ada@example.org'")).toEqual({ status: 'pending', source: 'footer', client_address: '1.2.3.4' });
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toContain('Confirm product news');
    expect(sent[0].text).not.toMatch(/dosing|reconstitut|clinical|benefit/i);
    expect(calls).toHaveLength(0); // nothing reaches Brevo before confirmation

    const token = tokenFrom(sent[0].text, '/newsletter/confirm');
    expect(await confirmConsent('nonsense')).toBe('invalid');
    expect(await confirmConsent(token)).toBe('confirmed');
    expect(await confirmConsent(token)).toBe('invalid'); // consumed
    expect(row("SELECT status, confirm_token_hash FROM marketing_consents WHERE email = 'ada@example.org'")).toMatchObject({ status: 'confirmed', confirm_token_hash: null });
    expect(calls[0].url).toBe('https://api.brevo.com/v3/contacts');
    expect(JSON.parse(String(calls[0].init.body))).toMatchObject({ email: 'ada@example.org', listIds: [7], updateEnabled: true });
    expect(row("SELECT brevo_synced_at FROM marketing_consents WHERE email = 'ada@example.org'")?.brevo_synced_at).not.toBeNull();

    // Asking again for a confirmed address changes nothing and sends nothing.
    expect(await requestConsent({ email: 'ada@example.org', source: 'footer' })).toMatchObject({ status: 'confirmed', confirmToken: null });
    expect(sent).toHaveLength(1);
  });

  it('finishes a sign-up and an unsubscribe the provider was down for', async () => {
    const brevoDown = () =>
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string, init: RequestInit) => {
          calls.push({ url, init });
          return new Response(JSON.stringify({ message: 'temporarily unavailable' }), { status: 503 });
        }),
      );
    const brevoUp = () =>
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string, init: RequestInit) => {
          calls.push({ url, init });
          return new Response(JSON.stringify({ id: 1 }), { status: 201 });
        }),
      );
    const syncedAt = () => row("SELECT brevo_synced_at FROM marketing_consents WHERE email = 'ada@example.org'")?.brevo_synced_at;

    const { confirmToken } = await requestConsent({ email: 'ada@example.org', accountId: 'acct_ada', source: 'account' });
    // A pending request is not the provider's business and is never swept.
    expect(await sweepMarketingSync()).toEqual({ ok: true, attempted: 0, synced: 0, failed: 0, deferred: 0 });

    brevoDown();
    expect(await confirmConsent(confirmToken!)).toBe('confirmed');
    expect(syncedAt()).toBeNull();
    // The token is spent, so the subscriber has no way to retry this themselves.
    expect(await confirmConsent(confirmToken!)).toBe('invalid');

    expect(await sweepMarketingSync()).toEqual({ ok: true, attempted: 1, synced: 0, failed: 1, deferred: 0 });
    expect(syncedAt()).toBeNull();

    brevoUp();
    expect(await sweepMarketingSync()).toEqual({ ok: true, attempted: 1, synced: 1, failed: 0, deferred: 0 });
    expect(calls.at(-1)?.url).toBe('https://api.brevo.com/v3/contacts');
    expect(syncedAt()).not.toBeNull();
    // Nothing is left over, so a healthy provider is not called again on the next tick.
    expect(await sweepMarketingSync()).toEqual({ ok: true, attempted: 0, synced: 0, failed: 0, deferred: 0 });

    brevoDown();
    expect(await revokeConsent({ email: 'ada@example.org' }, 'account page')).toBe(true);
    expect(row("SELECT status FROM marketing_consents WHERE email = 'ada@example.org'")?.status).toBe('revoked');
    expect(syncedAt()).toBeNull();

    brevoUp();
    expect(await sweepMarketingSync()).toEqual({ ok: true, attempted: 1, synced: 1, failed: 0, deferred: 0 });
    expect(calls.at(-1)?.url).toBe('https://api.brevo.com/v3/contacts/lists/7/contacts/remove');
    expect(syncedAt()).not.toBeNull();
    expect(await sweepMarketingSync()).toEqual({ ok: true, attempted: 0, synced: 0, failed: 0, deferred: 0 });
  });

  it('answers an unknown or malformed address exactly like a real one', async () => {
    expect(await requestConsent({ email: 'not-an-address', source: 'footer' })).toEqual({ ok: true, status: 'pending', confirmToken: null });
    expect(row('SELECT count(*) AS n FROM marketing_consents')?.n).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it('revokes from the link, one-click, the account page and the Brevo webhook, and removes the contact', async () => {
    const { confirmToken } = await requestConsent({ email: 'ada@example.org', accountId: 'acct_ada', source: 'account' });
    await confirmConsent(confirmToken!);
    const unsubscribeToken = String(row("SELECT unsubscribe_token FROM marketing_consents WHERE email = 'ada@example.org'")?.unsubscribe_token);

    const click = await oneClick(
      new Request(`https://staging.example.invalid/api/newsletter/unsubscribe?token=${unsubscribeToken}`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'List-Unsubscribe=One-Click',
      }),
    );
    expect(click.status).toBe(200);
    expect(row("SELECT status, revoke_reason FROM marketing_consents WHERE email = 'ada@example.org'")).toEqual({ status: 'revoked', revoke_reason: 'one-click' });
    expect(calls.at(-1)?.url).toBe('https://api.brevo.com/v3/contacts/lists/7/contacts/remove');

    // Re-arming is a fresh double opt-in, and only the owner may start it: a revoked address is a
    // suppression list that a stranger typing it into the footer form cannot lift.
    expect(await requestConsent({ email: 'ada@example.org', source: 'footer' })).toMatchObject({ status: 'revoked' });
    const again = await requestConsent({ email: 'ada@example.org', accountId: 'acct_ada', source: 'account' });
    expect(again.status).toBe('pending');
    await confirmConsent(again.confirmToken!);

    const webhook = await brevoWebhook(
      new Request('https://staging.example.invalid/api/webhooks/brevo?token=hook-token', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ event: 'unsubscribed', email: 'ada@example.org' }),
      }),
    );
    expect(await webhook.json()).toEqual({ ok: true, revoked: 1 });
    expect(row("SELECT status, revoke_reason FROM marketing_consents WHERE email = 'ada@example.org'")).toEqual({ status: 'revoked', revoke_reason: 'brevo:unsubscribed' });
    const bad = await brevoWebhook(new Request('https://staging.example.invalid/api/webhooks/brevo?token=wrong', { method: 'POST', body: '{}' }));
    expect(bad.status).toBe(401);

    expect(await revokeConsent({ email: 'nobody@example.org' }, 'x')).toBe(false);
  });

  it('will not let a stranger re-solicit an address that unsubscribed', async () => {
    const { confirmToken } = await requestConsent({ email: 'ada@example.org', accountId: 'acct_ada', source: 'account' });
    await confirmConsent(confirmToken!);
    await revokeConsent({ email: 'ada@example.org' }, 'one-click');
    sent.length = 0;

    // The footer form takes any address anybody types, so this is the vector.
    expect(await requestConsent({ email: 'ada@example.org', source: 'footer' })).toMatchObject({ status: 'revoked' });
    expect(await requestConsent({ email: 'ada@example.org', accountId: 'acct_bob', source: 'account' })).toMatchObject({ status: 'revoked' });
    expect(sent).toHaveLength(0);
    expect(row("SELECT status FROM marketing_consents WHERE email = 'ada@example.org'")?.status).toBe('revoked');

    // The owner, signed in as that address, can still come off the suppression list.
    const owner = await requestConsent({ email: 'ada@example.org', accountId: 'acct_ada', source: 'account' });
    expect(owner.status).toBe('pending');
    expect(sent).toHaveLength(1);
    await confirmConsent(owner.confirmToken!);
    expect(row("SELECT status FROM marketing_consents WHERE email = 'ada@example.org'")?.status).toBe('confirmed');
  });

  it('takes the sign-up box as a pending request and confirms it with the account verification link', async () => {
    const result = await signUp(
      { name: 'Dr New', email: 'new@example.org', password: 'a long enough password', tier: 'institutional', ageConfirmed: true, dateOfBirth: '1980-01-01' },
      null,
    );
    if (!result.ok) throw new Error(result.reason);
    await requestConsent({ email: 'new@example.org', accountId: result.accountId, source: 'sign_up', sendConfirmation: false });
    expect(sent).toHaveLength(1); // only the account verification email
    expect(row("SELECT status FROM marketing_consents WHERE email = 'new@example.org'")?.status).toBe('pending');

    const verifyToken = tokenFrom(sent[0].text, '/account/verify');
    expect(await verifyEmailToken(verifyToken)).toBe('verified');
    expect(row("SELECT status, source FROM marketing_consents WHERE email = 'new@example.org'")).toEqual({ status: 'confirmed', source: 'sign_up' });
    expect((await consentForAccount(result.accountId, 'new@example.org'))?.status).toBe('confirmed');
  });
});

describe('newsletter routes', () => {
  it('records a footer request and lands on the same page for everyone', async () => {
    const response = await newsletterPost(post('/api/newsletter', { intent: 'subscribe', email: 'bob@example.org', return_to: '/' }));
    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('https://staging.example.invalid/newsletter/requested');
    expect(row("SELECT status, source FROM marketing_consents WHERE email = 'bob@example.org'")).toEqual({ status: 'pending', source: 'footer' });
    expect(sent).toHaveLength(1);
    const cross = await newsletterPost(post('/api/newsletter', { intent: 'subscribe', email: 'bob@example.org' }, { Origin: 'https://elsewhere.example' }));
    expect(cross.status).toBe(403);
  });
});

describe('Brevo client', () => {
  it('parses the sender and refuses to send without a confirmed consent or outside the test allowlist', async () => {
    expect(brevoConfigured()).toBe(true);
    expect(brevoSender()).toEqual({ name: 'NexPhase Labs', email: 'news@news.example.invalid' });
    const message = { to: 'ada@example.org', subject: 'News', text: 'Hello', unsubscribeUrl: 'https://staging.example.invalid/newsletter/unsubscribe?token=t' };
    expect(await brevoSendMarketing(message, 'pending')).toEqual({ ok: false, error: 'No confirmed marketing consent for this address.' });
    expect(await brevoSendMarketing({ ...message, to: 'stranger@example.org' }, 'confirmed')).toEqual({ ok: false, error: 'Recipient is not in the non-production test allowlist.' });
    expect(calls).toHaveLength(0);

    expect(await brevoSendMarketing(message, 'confirmed')).toEqual({ ok: true, id: '<m1@brevo>' });
    const body = JSON.parse(String(calls[0].init.body));
    expect(calls[0].url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(body.subject).toBe('[TEST] News');
    expect(body.headers).toEqual({ 'List-Unsubscribe': '<https://staging.example.invalid/newsletter/unsubscribe?token=t>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' });
    expect(body.textContent).toContain('Unsubscribe: https://staging.example.invalid/newsletter/unsubscribe?token=t');
    expect((calls[0].init.headers as Record<string, string>)['api-key']).toBe('brevo-test-key');
  });
});

describe('abandoned-cart reminder', () => {
  const hoursAgo = (h: number, now: Date) => Math.floor((now.getTime() - h * 3_600_000) / 1000);

  it('sends once per cart contents, only to a confirmed subscriber, only while switched on', async () => {
    const now = new Date('2026-09-16T20:00:00Z');
    const visibility = visibilityFor(null, false, true);
    await addToCart('acct_ada', 'NPL-9999-2MG', 2, visibility);
    await addToCart('acct_bob', 'NPL-9999-2MG', 1, visibility);
    local.sqlite.prepare('UPDATE cart_items SET updated_at = ?').run(hoursAgo(30, now));
    const { confirmToken } = await requestConsent({ email: 'ada@example.org', accountId: 'acct_ada', source: 'account' });
    await confirmConsent(confirmToken!);
    calls.length = 0;

    expect(cartRemindersEnabled()).toBe(false);
    expect(await sendCartReminders(now)).toMatchObject({ ok: true, skipped: true, sent: 0 });
    env.ABANDONED_CART_REMINDERS = 'true';
    expect(cartRemindersEnabled()).toBe(true);

    // Ada: confirmed → one send. Bob: no consent → nothing, ever.
    expect(await sendCartReminders(now)).toEqual({ ok: true, considered: 2, sent: 1 });
    expect(calls).toHaveLength(1);
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.to).toEqual([{ email: 'ada@example.org' }]);
    expect(body.textContent).toContain('Synthetic only, 2 mg × 2');
    expect(body.textContent).toContain('does not reserve material');
    expect(body.textContent).toContain('laboratory research use only');
    expect(body.textContent).not.toMatch(/\$\d/);
    expect(row("SELECT recipient, provider_id FROM cart_reminders WHERE account_id = 'acct_ada'")).toEqual({ recipient: 'ada@example.org', provider_id: '<m1@brevo>' });

    // Same cart again: nothing. A cart touched an hour ago: nothing. Revoked: nothing.
    expect(await sendCartReminders(now)).toEqual({ ok: true, considered: 2, sent: 0 });
    local.sqlite.prepare("UPDATE cart_items SET updated_at = ?, quantity = 3 WHERE account_id = 'acct_ada'").run(hoursAgo(1, now));
    expect(await sendCartReminders(now)).toMatchObject({ sent: 0 });
    local.sqlite.prepare("UPDATE cart_items SET updated_at = ? WHERE account_id = 'acct_ada'").run(hoursAgo(30, now));
    await revokeConsent({ accountId: 'acct_ada' }, 'account page');
    expect(await sendCartReminders(now)).toMatchObject({ sent: 0 });
    expect(calls.filter((c) => c.url.endsWith('/smtp/email'))).toHaveLength(1);
  });
});
