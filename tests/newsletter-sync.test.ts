import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localD1 } from './helpers/local-d1';

const { env, recordCommerceEvent } = vi.hoisted(() => ({
  env: {} as Record<string, unknown>,
  recordCommerceEvent: vi.fn(),
}));
vi.mock('cloudflare:workers', () => ({ env }));
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn(async () => ({ ok: true })) }));
vi.mock('@/lib/commerce-events', () => ({ recordCommerceEvent }));

import { confirmConsent, confirmConsentForAccount, requestConsent, revokeConsent, sweepMarketingSync } from '@/lib/marketing-consent';
import { sendEmail } from '@/lib/email';

let local: ReturnType<typeof localD1>;
const now = new Date('2026-09-17T10:00:00Z');
const later = new Date('2026-09-17T10:10:00Z');
const email = 'buyer@example.invalid';
const state = () => local.sqlite.prepare('SELECT * FROM marketing_consents WHERE email = ?').get(email) as Record<string, unknown>;
const ok = () => new Response(null, { status: 204 });
const down = () => new Response('{"message":"buyer@example.invalid provider failed"}', { status: 503 });
async function subscribe() {
  const request = await requestConsent({ email, accountId: 'owner', source: 'account', sendConfirmation: false }, now);
  await confirmConsent(request.confirmToken!, now);
}
beforeEach(() => {
  local = localD1();
  Object.assign(env, {
    DB: local.binding, APP_ENV: 'staging', TEST_EMAIL_ALLOWLIST: email,
    BREVO_API_KEY: 'synthetic', BREVO_LIST_ID: '7', BREVO_SENDER: 'news@example.invalid',
  });
  vi.stubGlobal('fetch', vi.fn(async () => ok()));
  recordCommerceEvent.mockClear();
});
afterEach(() => {
  local.sqlite.close();
  Object.keys(env).forEach(key => delete env[key]);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('newsletter retry safety', () => {
  it('records persisted consent transitions, not idempotent repeats or provider sweeps', async () => {
    const requested = await requestConsent({
      email,
      accountId: 'owner',
      source: 'account',
      sendConfirmation: false,
    }, now);
    expect(recordCommerceEvent.mock.calls).toEqual([
      ['newsletter_request_accepted', { source: 'account' }],
    ]);

    recordCommerceEvent.mockClear();
    expect(await confirmConsent(requested.confirmToken!, now)).toBe('confirmed');
    expect(await confirmConsent(requested.confirmToken!, now)).toBe('invalid');
    expect(recordCommerceEvent.mock.calls).toEqual([
      ['newsletter_confirmed', { source: 'account' }],
    ]);

    recordCommerceEvent.mockClear();
    expect(await revokeConsent({ email }, 'account', now)).toBe(true);
    expect(await revokeConsent({ email }, 'account', now)).toBe(true);
    expect(recordCommerceEvent.mock.calls).toEqual([
      ['newsletter_unsubscribed', { source: 'account' }],
    ]);

    recordCommerceEvent.mockClear();
    local.sqlite.prepare('UPDATE marketing_consents SET brevo_synced_at = NULL').run();
    expect(await sweepMarketingSync(later)).toMatchObject({ synced: 1 });
    expect(recordCommerceEvent).not.toHaveBeenCalled();
  });

  it('records account-verification confirmation as a sign-up transition', async () => {
    await requestConsent({
      email,
      accountId: 'owner',
      source: 'sign_up',
      sendConfirmation: false,
    }, now);
    recordCommerceEvent.mockClear();
    expect(await confirmConsentForAccount('owner', now)).toBe(true);
    expect(await confirmConsentForAccount('owner', now)).toBe(false);
    expect(recordCommerceEvent.mock.calls).toEqual([
      ['newsletter_confirmed', { source: 'sign_up' }],
    ]);
  });

  it('lets unsubscribe win when consent is rearmed between its read and write', async () => {
    await subscribe();
    recordCommerceEvent.mockClear();
    const original = env.DB as D1Database;
    const prepare = original.prepare.bind(original);
    let interleaved = false;
    const queries = new WeakMap<object, string>();
    const interleave = (query: string) => {
      if (
        !interleaved
        && query.toLowerCase().includes('update')
        && query.toLowerCase().includes('marketing_consents')
      ) {
        interleaved = true;
        local.sqlite.prepare(
          "UPDATE marketing_consents SET status = 'pending', requested_at = requested_at + 1 WHERE email = ?",
        ).run(email);
      }
    };
    const wrap = (
      statement: D1PreparedStatement,
      query: string,
    ): D1PreparedStatement => {
      const proxy = new Proxy(statement, {
        get(target, property) {
          if (property === 'bind')
            return (...values: Parameters<D1PreparedStatement['bind']>) =>
              wrap(target.bind(...values), query);
          if (property === 'run')
            return async () => {
              interleave(query);
              return target.run();
            };
          if (property === 'all')
            return async () => {
              interleave(query);
              return target.all();
            };
          const value = Reflect.get(target, property);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
      queries.set(proxy, query);
      return proxy;
    };
    env.DB = {
      prepare(query: string) {
        interleave(query);
        return wrap(prepare(query), query);
      },
      batch(statements: D1PreparedStatement[]) {
        for (const statement of statements) interleave(queries.get(statement) ?? '');
        return original.batch(statements);
      },
    } as unknown as D1Database;

    expect(await revokeConsent({ email }, 'one-click', later)).toBe(true);
    expect(interleaved).toBe(true);
    expect(state().status).toBe('revoked');
    expect(recordCommerceEvent.mock.calls).toEqual([
      ['newsletter_unsubscribed', { source: 'account' }],
    ]);
  });

  it('does not let a stale footer request overwrite a concurrent unsubscribe', async () => {
    await requestConsent({ email, source: 'footer', sendConfirmation: false }, now);
    vi.mocked(sendEmail).mockClear();
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    vi.spyOn(crypto.subtle, 'digest').mockImplementationOnce(async (algorithm, data) => {
      await revokeConsent({ email }, 'one-click', now);
      return digest(algorithm, data);
    });
    expect(await requestConsent({ email, source: 'footer' }, now))
      .toEqual({ ok: true, status: 'revoked', confirmToken: null });
    expect(state().status).toBe('revoked');
    expect(state().confirm_token_hash).toBeNull();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it.each([0, 60])('repairs a legacy revoked marker even when the transition gap was %s seconds', async gap => {
    await subscribe();
    local.sqlite.prepare(`UPDATE marketing_consents SET status = 'revoked', revoked_at = ?, brevo_synced_at = ?`)
      .run(now.getTime() / 1000 + gap, now.getTime() / 1000);
    expect(await sweepMarketingSync(later)).toMatchObject({ synced: 1 });
    expect(String(vi.mocked(fetch).mock.calls.at(-1)?.[0])).toContain('/contacts/remove');
    expect(await sweepMarketingSync(later)).toMatchObject({ attempted: 0 });
  });

  it('retries failed re-subscription instead of trusting the old removal marker', async () => {
    await subscribe();
    await revokeConsent({ email }, 'account', now);
    const request = await requestConsent({ email, accountId: 'owner', source: 'account', sendConfirmation: false }, now);
    expect(state().brevo_synced_at).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => down()));
    await confirmConsent(request.confirmToken!, now);
    expect(state().brevo_synced_at).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => ok()));
    expect(await sweepMarketingSync(later)).toMatchObject({ synced: 1 });
  });

  it('retries account-verification sign-ups too', async () => {
    await requestConsent({ email, accountId: 'owner', source: 'sign_up', sendConfirmation: false }, now);
    vi.stubGlobal('fetch', vi.fn(async () => down()));
    expect(await confirmConsentForAccount('owner', now)).toBe(true);
    vi.stubGlobal('fetch', vi.fn(async () => ok()));
    expect(await sweepMarketingSync(later)).toMatchObject({ synced: 1 });
  });

  it.each(['request', 'sweep'])('repairs a stale %s upsert that completes after an unsubscribe', async path => {
    const request = await requestConsent({ email, accountId: 'owner', source: 'account', sendConfirmation: false }, now);
    if (path === 'sweep') {
      vi.stubGlobal('fetch', vi.fn(async () => down()));
      await confirmConsent(request.confirmToken!, now);
    }
    let onList = false;
    let race = true;
    vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).endsWith('/contacts') && race) {
        race = false;
        await revokeConsent({ email }, 'account', now); // deliberately the same second
        onList = true; // old upsert completes AFTER removal acknowledged
      } else onList = String(url).endsWith('/contacts');
      return ok();
    }));
    if (path === 'sweep') expect(await sweepMarketingSync(later)).toMatchObject({ deferred: 1 });
    else await confirmConsent(request.confirmToken!, now);
    expect(state().status).toBe('revoked');
    expect(onList).toBe(false);
    expect(await sweepMarketingSync(later)).toMatchObject({ attempted: 0 });
  });

  it('repairs a removal that completes after re-confirmation', async () => {
    await subscribe();
    vi.stubGlobal('fetch', vi.fn(async () => down()));
    await revokeConsent({ email }, 'account', now);
    let race = true;
    let onList = false;
    vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).includes('/contacts/remove') && race) {
        race = false;
        const request = await requestConsent({ email, accountId: 'owner', source: 'account', sendConfirmation: false }, now);
        await confirmConsent(request.confirmToken!, now);
        onList = false; // stale removal finishes last
      } else onList = String(url).endsWith('/contacts');
      return ok();
    }));
    expect(await sweepMarketingSync(later)).toMatchObject({ deferred: 1 });
    expect(state().status).toBe('confirmed');
    expect(onList).toBe(true);
  });

  it('keeps pending re-subscriptions off the provider list and retries failed cleanup', async () => {
    await subscribe();
    local.sqlite.prepare('UPDATE marketing_consents SET brevo_synced_at = NULL').run();
    let race = true;
    vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).endsWith('/contacts') && race) {
        race = false;
        await revokeConsent({ email }, 'account', now);
        await requestConsent({ email, accountId: 'owner', source: 'account', sendConfirmation: false }, now);
        return ok();
      }
      return down();
    }));
    expect(await sweepMarketingSync(later)).toMatchObject({ deferred: 1 });
    expect(state().status).toBe('pending');
    expect(state().brevo_synced_at).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => ok()));
    expect(await sweepMarketingSync(later)).toMatchObject({ synced: 1 });
    expect(String(vi.mocked(fetch).mock.calls.at(-1)?.[0])).toContain('/contacts/remove');
  });

  it('bounds batches and rotates failures without logging provider contact data', async () => {
    await subscribe();
    const seed = state();
    for (let i = 0; i < 11; i++) {
      local.sqlite.prepare(`INSERT INTO marketing_consents
        (id,email,status,source,requested_at,consented_at,unsubscribe_token,created_at,updated_at)
        VALUES (?,?,'confirmed','account',?,?,?, ?,?)`)
        .run(`retry${i}`, `retry${i}@example.invalid`, seed.requested_at as number, seed.consented_at as number,
          `token${i}`, seed.created_at as number, Number(seed.updated_at) + i);
    }
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => down()));
    expect(await sweepMarketingSync(later)).toMatchObject({ attempted: 10, failed: 10 });
    expect(JSON.stringify(errors.mock.calls)).not.toContain(email);
    const batch = local.sqlite.prepare(`SELECT id FROM marketing_consents WHERE brevo_synced_at IS NULL ORDER BY updated_at LIMIT 1`).get();
    expect(batch).toEqual({ id: 'retry10' });
  });

  it('does nothing while the provider is unconfigured', async () => {
    delete env.BREVO_API_KEY;
    await subscribe();
    expect(await sweepMarketingSync(later)).toMatchObject({ attempted: 0 });
    expect(fetch).not.toHaveBeenCalled();
  });
});