import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({ APP_ENV: 'test', RESEARCHER_TIER_ENABLED: 'true' }) as Record<string, unknown>);
vi.mock('cloudflare:workers', () => ({ env }));
vi.mock('next/navigation', () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock('@/lib/account-auth', () => ({ getAccount: async () => null }));

import SignUpPage from '@/app/account/sign-up/page';

const render = async (params: { tier?: string } = {}) =>
  renderToStaticMarkup(await SignUpPage({ searchParams: Promise.resolve(params) }));
const field = (html: string, name: string) =>
  html.match(new RegExp(`<input\\b[^>]*\\bname="${name}"[^>]*>`))?.[0] ?? '';

beforeEach(() => {
  env.RESEARCHER_TIER_ENABLED = 'true';
  env.ACCOUNT_REQUIRED = 'true';
});

describe('the sign-up page tells the truth about how buying works', () => {
  it('does not offer guest checkout once an account is required', async () => {
    // Guest checkout was retired when ACCOUNT_REQUIRED went on, but this page kept advertising it,
    // so a visitor was told they could skip the very thing the page exists to make them do.
    env.ACCOUNT_REQUIRED = 'true';
    const html = await render();
    expect(html).not.toContain('check out as a guest');
    expect(html).toContain('Use your email to access researcher prices');
  });

  it('still offers it while guests are genuinely allowed', async () => {
    env.ACCOUNT_REQUIRED = 'false';
    expect(await render()).toContain('check out as a guest');
  });

  it('keeps the researcher form short without removing required consent', async () => {
    const html = await render();
    expect(html).toContain('Personal email addresses are welcome.');
    expect(html).toContain('name="tier" value="researcher"');
    expect(html).not.toContain('Work email address');
    expect(html).not.toContain('name="date_of_birth"');
    expect(html).not.toContain('name="research_setting"');
    expect(html).not.toContain('type="radio"');
    expect(field(html, 'accept_research_age')).toContain('required=""');
    expect(field(html, 'accept_terms')).toContain('required=""');
    expect(html).not.toContain('name="accept_age"');
    expect(html).not.toContain('name="accept_ruo"');
    expect(html).toContain('It will not be administered to humans or animals');
    expect(html).toContain('name="product_news"');
    expect(field(html, 'product_news')).not.toContain('required');
    expect(field(html, 'product_news')).not.toContain('checked');
    expect(html).toContain('/account/sign-up?tier=institutional');
  });

  it('keeps wholesale requirements on the separate application path', async () => {
    const html = await render({ tier: 'institutional' });
    expect(html).toContain('Apply for wholesale');
    expect(html).toContain('Work email address');
    expect(html).toContain('name="tier" value="institutional"');
    expect(field(html, 'date_of_birth')).toContain('required=""');
    expect(field(html, 'date_of_birth')).toContain('type="date"');
    expect(html).toContain('name="research_setting"');
    expect(html).toContain('Create a researcher account');
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
