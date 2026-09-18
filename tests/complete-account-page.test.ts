import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({ RESEARCHER_TIER_ENABLED: 'true' }) as Record<string, unknown>);
vi.mock('cloudflare:workers', () => ({ env }));
vi.mock('next/navigation', () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => ({ value: 'synthetic-pending' }) }) }));
vi.mock('@/lib/account-auth', () => ({ getAccount: async () => null }));
vi.mock('@/lib/google-signin', () => ({
  PENDING_COOKIE: 'synthetic',
  openPendingIdentity: async () => ({ email: 'researcher@example.invalid', name: 'Researcher' }),
}));

import CompleteAccountPage from '@/app/account/complete/page';

const render = async (tier?: string) => renderToStaticMarkup(await CompleteAccountPage({
  searchParams: Promise.resolve({ tier, return_to: '/account/cart' }),
}));

beforeEach(() => { env.RESEARCHER_TIER_ENABLED = 'true'; });

describe('Google signup follows the simplified researcher path', () => {
  it('does not require DOB, setting, password or another account-type selection', async () => {
    const html = await render();
    expect(html).toContain('name="tier" value="researcher"');
    expect(html).not.toContain('name="date_of_birth"');
    expect(html).not.toContain('name="research_setting"');
    expect(html).not.toContain('name="password"');
    expect(html).not.toContain('type="radio"');
    expect(html).toContain('name="accept_research_age"');
    expect(html).toContain('name="accept_terms"');
    expect(html).toContain('/legal/privacy');
    expect(html).toContain('return_to=%2Faccount%2Fcart&amp;tier=institutional');
    expect(html).toContain('name="return_to" value="/account/cart"');
  });

  it('retains wholesale requirements when explicitly selected', async () => {
    const html = await render('institutional');
    expect(html).toContain('name="tier" value="institutional"');
    expect(html).toContain('name="date_of_birth"');
    expect(html).toContain('name="research_setting"');
    expect(html).toContain('Wholesale ordering requires approval.');
    expect(html).toContain('Create a researcher account');
  });

  it('does not advertise researcher access when disabled', async () => {
    env.RESEARCHER_TIER_ENABLED = 'false';
    const html = await render('researcher');
    expect(html).toContain('name="tier" value="institutional"');
    expect(html).not.toContain('Create a researcher account');
  });
});