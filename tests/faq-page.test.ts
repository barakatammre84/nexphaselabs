import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.stubGlobal('React', React);
const { env } = vi.hoisted(() => ({ env: {} as Record<string, unknown> }));
vi.mock('cloudflare:workers', () => ({ env }));
import FaqPage from '@/app/faq/page';

/**
 * /access is only a redirect now (app/access/page.tsx): to the catalog while the
 * storefront is open, and to the wholesale application, which starts at sign-up,
 * while it is closed. The FAQ used to send closed-storefront visitors to "the
 * research access page", which no longer exists.
 */
const render = () => renderToStaticMarkup(FaqPage());

afterEach(() => {
  for (const key of Object.keys(env)) delete env[key];
});

describe('FAQ access answers', () => {
  it('link a closed-storefront visitor to the wholesale application itself', () => {
    const html = render();
    expect(html).not.toContain('research access page');
    expect(html).not.toContain('href="/access"');
    expect(html).toMatch(/Not yet\.[^<]*<a[^>]*href="\/account\/sign-up\?tier=institutional"/);
    expect(html).toMatch(/two business days\.[^<]*<a[^>]*href="\/account\/sign-up\?tier=institutional"/);
  });

  it('send nobody to an access page or the wholesale application while the storefront is open', () => {
    env.OPEN_CHECKOUT_ENABLED = 'true';
    const html = render();
    expect(html).toContain('Do I need an account to order?');
    expect(html).not.toContain('research access page');
    expect(html).not.toContain('href="/access"');
    expect(html).not.toContain('tier=institutional');
  });
});
