import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({ APP_ENV: 'test', PUBLIC_ORIGIN: 'https://nexphaselabs.net', RESEARCHER_TIER_ENABLED: 'true' }) as Record<string, unknown>);
vi.mock('cloudflare:workers', () => ({ env }));
const pending = vi.hoisted(() => ({ current: null as Record<string, unknown> | null }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => ({ value: 'sealed' }) }) }));
const redirect = vi.hoisted(() => vi.fn((to: string) => { throw new Error(`REDIRECT:${to}`); }));
vi.mock('next/navigation', () => ({ redirect, notFound: vi.fn() }));
vi.mock('@/lib/account-auth', () => ({ getAccount: async () => null, safeAccountReturnPath: (v: string) => v || '/account' }));
vi.mock('@/lib/google-signin', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/google-signin')>()),
  openPendingIdentity: async () => pending.current,
}));

import { GoogleButton } from '@/components/site/google-button';
import CompleteAccountPage from '@/app/account/complete/page';

describe('the Google button', () => {
  it('is absent until both halves of the client are configured', () => {
    delete env.GOOGLE_SIGN_IN_CLIENT_ID;
    delete env.GOOGLE_SIGN_IN_CLIENT_SECRET;
    expect(renderToStaticMarkup(React.createElement(GoogleButton, { returnTo: '/account', label: 'Continue with Google' }))).toBe('');
    env.GOOGLE_SIGN_IN_CLIENT_ID = 'id';
    expect(renderToStaticMarkup(React.createElement(GoogleButton, { returnTo: '/account', label: 'Continue with Google' }))).toBe('');
  });

  it('links into the flow and says plainly what Google does and does not prove', () => {
    Object.assign(env, { GOOGLE_SIGN_IN_CLIENT_ID: 'id', GOOGLE_SIGN_IN_CLIENT_SECRET: 'secret' });
    const html = renderToStaticMarkup(React.createElement(GoogleButton, { returnTo: '/account/cart', label: 'Continue with Google' }));
    expect(html).toContain('/api/auth/google/start?return_to=%2Faccount%2Fcart');
    expect(html).toContain('Continue with Google');
    expect(html).toMatch(/does not confirm your age/i);
  });
});

describe('the completion page', () => {
  const render = () => CompleteAccountPage({ searchParams: Promise.resolve({}) });

  it('sends a visitor with no pending identity back to sign in', async () => {
    Object.assign(env, { GOOGLE_SIGN_IN_CLIENT_ID: 'id', GOOGLE_SIGN_IN_CLIENT_SECRET: 'secret' });
    pending.current = null;
    await expect(render()).rejects.toThrow('REDIRECT:/account/sign-in?error=google_expired');
  });

  it('asks for exactly what Google could not supply', async () => {
    pending.current = { subject: 'sub', email: 'ada@example.org', emailVerified: true, name: 'Ada', issuedAt: 0 };
    const html = renderToStaticMarkup(await render());
    expect(html).toContain('ada@example.org');
    expect(html).toContain('name="date_of_birth"');
    expect(html).toContain('name="accept_age"');
    expect(html).toContain('name="accept_ruo"');
    expect(html).toContain('name="accept_terms"');
    expect(html).toContain('action="/api/account/complete"');
    // No password field: this account signs in with Google.
    expect(html).not.toContain('type="password"');
    expect(html).toMatch(/Nothing is created until you submit/i);
  });
});
