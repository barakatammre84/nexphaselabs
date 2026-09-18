import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({ APP_ENV: 'test', RESEARCHER_TIER_ENABLED: 'true' }) as Record<string, unknown>);
vi.mock('cloudflare:workers', () => ({ env }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@/lib/account-auth', () => ({ getAccount: async () => null }));

import { latestBirthDate } from '@/lib/account-rules';
import { turnstileEnabled, verifyTurnstile } from '@/lib/turnstile';
import SignUpPage from '@/app/account/sign-up/page';

const keys = () => Object.assign(env, { TURNSTILE_SITE_KEY: '1x00000000000000000000AA', TURNSTILE_SECRET_KEY: 'secret' });
const answer = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

afterEach(() => {
  delete env.TURNSTILE_SITE_KEY;
  delete env.TURNSTILE_SECRET_KEY;
});

describe('turnstile', () => {
  it('is off, and passes everything, until both keys exist', async () => {
    expect(turnstileEnabled()).toBe(false);
    const never = vi.fn();
    expect(await verifyTurnstile(null, '1.2.3.4', never as unknown as typeof fetch)).toEqual({ ok: true });
    env.TURNSTILE_SITE_KEY = 'site-only';
    expect(turnstileEnabled()).toBe(false);
    expect(await verifyTurnstile('tok', '1.2.3.4', never as unknown as typeof fetch)).toEqual({ ok: true });
    expect(never).not.toHaveBeenCalled();
  });

  it('fails closed once on: no token, a rejected token, or no answer from Cloudflare', async () => {
    keys();
    expect(turnstileEnabled()).toBe(true);
    expect(await verifyTurnstile(null, '1.2.3.4', answer({ success: true }))).toEqual({ ok: false, reason: 'missing' });
    expect(await verifyTurnstile('tok', '1.2.3.4', answer({ success: false }))).toEqual({ ok: false, reason: 'rejected' });
    expect(await verifyTurnstile('tok', '1.2.3.4', answer({}, 503))).toEqual({ ok: false, reason: 'unavailable' });
    const down = vi.fn(async () => { throw new Error('network'); }) as unknown as typeof fetch;
    expect(await verifyTurnstile('tok', '1.2.3.4', down)).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('posts the secret, the token and the caller address to siteverify', async () => {
    keys();
    const ok = answer({ success: true });
    expect(await verifyTurnstile('tok', '1.2.3.4', ok)).toEqual({ ok: true });
    const [url, init] = (ok as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
    expect(String(init.body)).toBe('secret=secret&response=tok&remoteip=1.2.3.4');
  });
});

describe('sign-up form', () => {
  const render = async () => renderToStaticMarkup(await SignUpPage({ searchParams: Promise.resolve({}) }));

  it('asks researchers to affirm their age without a birth date, and shows no widget while turnstile is off', async () => {
    const html = await render();
    expect(html).not.toContain('name="date_of_birth"');
    expect(html).toContain('name="accept_research_age"');
    expect(html).not.toContain('cf-turnstile');
    expect(html).not.toContain('challenges.cloudflare.com');
  });

  it('still caps wholesale birth dates at the minimum age', async () => {
    const html = renderToStaticMarkup(await SignUpPage({ searchParams: Promise.resolve({ tier: 'institutional' }) }));
    expect(html).toContain('name="date_of_birth"');
    expect(html).toContain(`max="${latestBirthDate()}"`);
    expect(html).toContain('type="date"');
  });

  it('renders the widget and its script once both keys exist', async () => {
    keys();
    const html = await render();
    expect(html).toContain('class="cf-turnstile"');
    expect(html).toContain('data-sitekey="1x00000000000000000000AA"');
    expect(html).toContain('https://challenges.cloudflare.com/turnstile/v0/api.js');
  });
});
