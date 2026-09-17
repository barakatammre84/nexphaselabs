import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({ APP_ENV: 'test', RESEARCHER_TIER_ENABLED: 'true' }) as Record<string, unknown>);
vi.mock('cloudflare:workers', () => ({ env }));
vi.mock('next/navigation', () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock('@/lib/account-auth', () => ({ getAccount: async () => null }));

import SignUpPage from '@/app/account/sign-up/page';

const render = async () => renderToStaticMarkup(await SignUpPage({ searchParams: Promise.resolve({}) }));

describe('the sign-up page tells the truth about how buying works', () => {
  it('does not offer guest checkout once an account is required', async () => {
    // Guest checkout was retired when ACCOUNT_REQUIRED went on, but this page kept advertising it,
    // so a visitor was told they could skip the very thing the page exists to make them do.
    env.ACCOUNT_REQUIRED = 'true';
    const html = await render();
    expect(html).not.toContain('check out as a guest');
    expect(html).toContain('An account is how prices, lot availability and the cart are shown');
  });

  it('still offers it while guests are genuinely allowed', async () => {
    env.ACCOUNT_REQUIRED = 'false';
    expect(await render()).toContain('check out as a guest');
  });

  it('describes a wholesale application instead when the researcher tier is closed', async () => {
    env.RESEARCHER_TIER_ENABLED = 'false';
    env.ACCOUNT_REQUIRED = 'true';
    const html = await render();
    expect(html).toContain('first step of a wholesale application');
    expect(html).not.toContain('check out as a guest');
    env.RESEARCHER_TIER_ENABLED = 'true';
  });
});
