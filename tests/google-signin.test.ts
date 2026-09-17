import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localD1 } from './helpers/local-d1';

const { env } = vi.hoisted(() => ({ env: {} as Record<string, unknown> }));
vi.mock('cloudflare:workers', () => ({ env }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock('next/navigation', () => ({ redirect: vi.fn(), notFound: vi.fn() }));

import { getDb } from '@/db';
import { accounts } from '@/db/schema';
import { completeGoogleSignUp, resolveGoogleSignIn } from '@/lib/google-accounts';
import {
  authorizationUrl,
  exchangeCode,
  googleRedirectUri,
  googleSignInEnabled,
  identityFromIdToken,
  openPendingIdentity,
  readOauthCookie,
  sealPendingIdentity,
} from '@/lib/google-signin';
import { GET as startRoute } from '@/app/api/auth/google/start/route';
import { GET as callbackRoute } from '@/app/api/auth/google/callback/route';

const CLIENT_ID = '123-abc.apps.googleusercontent.com';
const ORIGIN = 'https://staging.example.invalid';
let local: ReturnType<typeof localD1>;

const b64url = (value: string) => btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
/** A token shaped exactly like Google's, so the claim checks are exercised rather than mocked. */
const idToken = (claims: Record<string, unknown>) =>
  `${b64url(JSON.stringify({ alg: 'RS256' }))}.${b64url(JSON.stringify(claims))}.signature`;
const goodClaims = (over: Record<string, unknown> = {}) => ({
  iss: 'https://accounts.google.com',
  aud: CLIENT_ID,
  sub: 'google-sub-1',
  email: 'Ada@Example.org',
  email_verified: true,
  name: 'Ada Lovelace',
  nonce: 'nonce-1',
  exp: Math.floor(Date.now() / 1000) + 600,
  ...over,
});
const row = (sql: string, ...args: (string | number)[]) =>
  local.sqlite.prepare(sql).get(...args) as Record<string, unknown> | undefined;

beforeEach(() => {
  local = localD1();
  Object.assign(env, {
    DB: local.binding,
    APP_ENV: 'staging',
    PUBLIC_ORIGIN: ORIGIN,
    RESEARCHER_TIER_ENABLED: 'true',
    GOOGLE_SIGN_IN_CLIENT_ID: CLIENT_ID,
    GOOGLE_SIGN_IN_CLIENT_SECRET: 'client-secret',
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  local.sqlite.close();
  for (const key of Object.keys(env)) delete env[key];
});

describe('configuration', () => {
  it('is off until both halves exist, and builds the consent URL when they do', () => {
    expect(googleSignInEnabled()).toBe(true);
    expect(googleRedirectUri()).toBe(`${ORIGIN}/api/auth/google/callback`);
    const url = new URL(authorizationUrl('state-1', 'nonce-1')!);
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: CLIENT_ID,
      redirect_uri: `${ORIGIN}/api/auth/google/callback`,
      response_type: 'code',
      scope: 'openid email profile',
      state: 'state-1',
      nonce: 'nonce-1',
    });
    delete env.GOOGLE_SIGN_IN_CLIENT_SECRET;
    expect(googleSignInEnabled()).toBe(false);
    delete env.GOOGLE_SIGN_IN_CLIENT_ID;
    expect(authorizationUrl('s', 'n')).toBeNull();
  });
});

describe('id token claims', () => {
  it('accepts a token from Google for this client and this attempt', () => {
    const result = identityFromIdToken(idToken(goodClaims()), 'nonce-1');
    expect(result).toEqual({
      ok: true,
      identity: { subject: 'google-sub-1', email: 'ada@example.org', emailVerified: true, name: 'Ada Lovelace' },
    });
  });

  it('refuses a token that is genuine but not ours, not now, or not this attempt', () => {
    const cases: [string, string, string][] = [
      ['unexpected issuer', idToken(goodClaims({ iss: 'https://evil.example' })), 'nonce-1'],
      ['token issued for another client', idToken(goodClaims({ aud: 'someone-else' })), 'nonce-1'],
      ['expired id token', idToken(goodClaims({ exp: Math.floor(Date.now() / 1000) - 10 })), 'nonce-1'],
      ['nonce mismatch', idToken(goodClaims()), 'a-different-nonce'],
      ['nonce mismatch', idToken(goodClaims({ nonce: undefined })), 'nonce-1'],
      ['incomplete id token', idToken(goodClaims({ sub: '' })), 'nonce-1'],
      ['malformed id token', 'not.a.token.at.all', 'nonce-1'],
      ['unreadable id token', 'aaa.bbb.ccc', 'nonce-1'],
    ];
    for (const [error, token, nonce] of cases) expect(identityFromIdToken(token, nonce)).toEqual({ ok: false, error });
  });

  it('carries through that Google has not verified an address', () => {
    const result = identityFromIdToken(idToken(goodClaims({ email_verified: false })), 'nonce-1');
    expect(result.ok && result.identity.emailVerified).toBe(false);
  });
});

describe('code exchange', () => {
  it('posts the client credentials and the exact redirect URI', async () => {
    const calls: [string, RequestInit][] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push([url, init]);
      return new Response(JSON.stringify({ id_token: idToken(goodClaims()) }), { status: 200 });
    }) as unknown as typeof fetch;
    const result = await exchangeCode('auth-code', 'nonce-1', fetchImpl);
    expect(result.ok).toBe(true);
    expect(calls[0][0]).toBe('https://oauth2.googleapis.com/token');
    expect(Object.fromEntries(new URLSearchParams(String(calls[0][1].body)))).toEqual({
      code: 'auth-code',
      client_id: CLIENT_ID,
      client_secret: 'client-secret',
      redirect_uri: `${ORIGIN}/api/auth/google/callback`,
      grant_type: 'authorization_code',
    });
  });

  it('reports a refusal from Google rather than throwing', async () => {
    const bad = (async () => new Response('nope', { status: 400 })) as unknown as typeof fetch;
    expect(await exchangeCode('c', 'n', bad)).toEqual({ ok: false, error: 'Google answered 400' });
    const empty = (async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;
    expect(await exchangeCode('c', 'n', empty)).toEqual({ ok: false, error: 'no id token returned' });
    const down = (async () => { throw new Error('network'); }) as unknown as typeof fetch;
    expect(await exchangeCode('c', 'n', down)).toEqual({ ok: false, error: 'could not reach Google' });
  });
});

describe('the sealed half-finished sign-up', () => {
  const identity = { subject: 'google-sub-1', email: 'ada@example.org', emailVerified: true, name: 'Ada' };

  it('round-trips, and refuses a payload that was edited', async () => {
    const sealed = (await sealPendingIdentity(identity))!;
    expect(await openPendingIdentity(sealed)).toMatchObject(identity);

    // Swapping the address for somebody else's is exactly what the signature exists to stop:
    // this account would be created already marked email-verified.
    const [body, signature] = sealed.split('.');
    const tampered = btoa(JSON.stringify({ ...identity, email: 'victim@example.org', issuedAt: Math.floor(Date.now() / 1000) }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(await openPendingIdentity(`${tampered}.${signature}`)).toBeNull();
    expect(await openPendingIdentity(`${body}.${signature}x`)).toBeNull();
    expect(await openPendingIdentity('rubbish')).toBeNull();
    expect(await openPendingIdentity(null)).toBeNull();
  });

  it('expires, and cannot be opened by a deploy with a different secret', async () => {
    const sealed = (await sealPendingIdentity(identity, new Date(Date.now() - 3600_000)))!;
    expect(await openPendingIdentity(sealed)).toBeNull();
    const fresh = (await sealPendingIdentity(identity))!;
    env.GOOGLE_SIGN_IN_CLIENT_SECRET = 'a-different-secret';
    expect(await openPendingIdentity(fresh)).toBeNull();
  });
});

describe('resolving an identity to an account', () => {
  const identity = { subject: 'google-sub-1', email: 'ada@example.org', emailVerified: true, name: 'Ada' };
  const seed = (over: Record<string, unknown> = {}) =>
    getDb().insert(accounts).values({
      id: 'acct_ada',
      email: 'ada@example.org',
      name: 'Ada',
      passwordHash: 'unused',
      tier: 'researcher',
      status: 'active',
      ...over,
    });

  it('refuses an address Google has not verified', async () => {
    await seed();
    expect(await resolveGoogleSignIn({ ...identity, emailVerified: false }, null)).toEqual({
      outcome: 'refused',
      reason: 'unverified-email',
    });
  });

  it('sends somebody Google has never introduced to the completion form, creating nothing', async () => {
    expect(await resolveGoogleSignIn(identity, null)).toEqual({ outcome: 'needs-completion' });
    expect(local.sqlite.prepare('SELECT count(*) AS n FROM accounts').get()).toEqual({ n: 0 });
  });

  it('links an existing password account on the verified address, once', async () => {
    await seed();
    const first = await resolveGoogleSignIn(identity, null);
    expect(first).toMatchObject({ outcome: 'signed-in', linked: true });
    expect(row('SELECT google_subject FROM accounts')?.google_subject).toBe('google-sub-1');

    // Second time it matches on the subject, so a later address change at Google would not break it.
    await getDb().update(accounts).set({ email: 'moved@example.org' });
    const second = await resolveGoogleSignIn(identity, null);
    expect(second).toMatchObject({ outcome: 'signed-in', linked: false });
    expect(second.outcome === 'signed-in' && second.account.email).toBe('moved@example.org');
  });

  it("activates an account that never opened its verification email, because Google verified it", async () => {
    await seed({ status: 'pending_email' });
    expect(await resolveGoogleSignIn(identity, null)).toMatchObject({ outcome: 'signed-in' });
    expect(row('SELECT status, email_verified_at FROM accounts')).toMatchObject({ status: 'active' });
    expect(row('SELECT email_verified_at FROM accounts')?.email_verified_at).not.toBeNull();
  });

  it('refuses an address whose account is already tied to a different Google identity', async () => {
    await seed({ googleSubject: 'google-sub-ORIGINAL', googleLinkedAt: new Date() });
    // A released and re-registered address gets a new subject from Google, still verified.
    // Trusting the address alone here would hand the new owner the original account.
    expect(await resolveGoogleSignIn({ ...identity, subject: 'google-sub-NEW' }, null)).toEqual({
      outcome: 'refused',
      reason: 'linked-elsewhere',
    });
    // The genuine owner still gets in, because the subject matches.
    expect(await resolveGoogleSignIn({ ...identity, subject: 'google-sub-ORIGINAL' }, null)).toMatchObject({
      outcome: 'signed-in',
      linked: false,
    });
  });

  it('refuses a suspended account', async () => {
    await seed({ status: 'suspended' });
    expect(await resolveGoogleSignIn(identity, null)).toEqual({ outcome: 'refused', reason: 'suspended' });
  });
});

describe('completing a Google sign-up', () => {
  const identity = { subject: 'google-sub-1', email: 'ada@example.org', emailVerified: true, name: 'Ada Lovelace' };
  const good = {
    tier: 'researcher',
    dateOfBirth: '1980-01-01',
    acceptTerms: true,
    acceptRuo: true,
    acceptAge: true,
  };

  it('will not create an account without the age and the acknowledgements Google cannot give', async () => {
    for (const [field, value, expected] of [
      ['dateOfBirth', '', 'Enter your date of birth.'],
      ['acceptTerms', false, 'You must accept the terms of sale.'],
      ['acceptRuo', false, 'You must confirm the research-use acknowledgement.'],
      ['acceptAge', false, 'You must confirm that you are at least 21 years of age.'],
    ] as const) {
      const result = await completeGoogleSignUp(identity, { ...good, [field]: value }, null, true);
      expect(!result.ok && result.errors).toContain(expected);
    }
    const young = await completeGoogleSignUp(identity, { ...good, dateOfBirth: '2010-05-05' }, null, true);
    expect(!young.ok && young.errors.some((e) => e.includes('at least 21'))).toBe(true);
    expect(local.sqlite.prepare('SELECT count(*) AS n FROM accounts').get()).toEqual({ n: 0 });
  });

  it('creates an active, already-verified account linked to the Google subject', async () => {
    const result = await completeGoogleSignUp(identity, good, 'test-agent', true);
    expect(result.ok).toBe(true);
    const account = row('SELECT email, name, status, google_subject, date_of_birth, tier FROM accounts')!;
    expect(account).toMatchObject({
      email: 'ada@example.org',
      name: 'Ada Lovelace',
      status: 'active',
      google_subject: 'google-sub-1',
      date_of_birth: '1980-01-01',
      tier: 'researcher',
    });
    expect(row('SELECT email_verified_at, age_confirmed_at, terms_accepted_at, ruo_accepted_at FROM accounts')).not.toContain(null);
    // The acknowledgement is recorded as rows, which is what the compliance page says happens.
    expect((local.sqlite.prepare('SELECT count(*) AS n FROM account_acknowledgements').get() as { n: number }).n).toBeGreaterThan(0);
    // No usable password: the only ways in are Google or a reset started from their own mailbox.
    expect(String(row('SELECT password_hash FROM accounts')?.password_hash).length).toBeGreaterThan(20);
  });

  it('refuses a tier the storefront is not offering, and a duplicate address', async () => {
    const closed = await completeGoogleSignUp(identity, good, null, false);
    expect(!closed.ok && closed.errors[0]).toContain('research organisations only');
    await completeGoogleSignUp(identity, good, null, true);
    const again = await completeGoogleSignUp({ ...identity, subject: 'google-sub-2' }, good, null, true);
    expect(!again.ok && again.errors[0]).toContain('already exists');
  });
});

describe('routes', () => {
  it('starts the flow with a state cookie and lands on Google', async () => {
    const response = await startRoute(new Request(`${ORIGIN}/api/auth/google/start?return_to=/account/cart`));
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toContain('accounts.google.com');
    const cookie = response.headers.get('Set-Cookie')!;
    expect(cookie).toContain('nx_oauth=');
    expect(cookie).toContain('HttpOnly');
    const parsed = readOauthCookie(cookie.split(';')[0]);
    expect(parsed?.returnTo).toBe('/account/cart');
    expect(new URL(response.headers.get('Location')!).searchParams.get('state')).toBe(parsed?.state);
  });

  it('refuses a callback whose state does not match the cookie this browser was given', async () => {
    const response = await callbackRoute(
      new Request(`${ORIGIN}/api/auth/google/callback?code=c&state=forged`, {
        headers: { cookie: 'nx_oauth=real-state.nonce-1.%2Faccount' },
      }),
    );
    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toContain('error=google_state');
    expect(local.sqlite.prepare('SELECT count(*) AS n FROM accounts').get()).toEqual({ n: 0 });
  });

  it('treats a declined consent as a cancellation, and a missing config as unavailable', async () => {
    const cancelled = await callbackRoute(new Request(`${ORIGIN}/api/auth/google/callback?error=access_denied`));
    expect(cancelled.headers.get('Location')).toContain('error=google_cancelled');
    delete env.GOOGLE_SIGN_IN_CLIENT_SECRET;
    const off = await callbackRoute(new Request(`${ORIGIN}/api/auth/google/callback?code=c&state=s`));
    expect(off.headers.get('Location')).toContain('error=google');
  });
});
