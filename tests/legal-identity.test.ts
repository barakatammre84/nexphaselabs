import * as React from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.stubGlobal('React', React);
const { env } = vi.hoisted(() => ({ env: {} as Record<string, unknown> }));
vi.mock('cloudflare:workers', () => ({ env }));

import AboutPage from '@/app/about/page';
import CompliancePage from '@/app/legal/compliance/page';
import PrivacyPage from '@/app/legal/privacy/page';
import TermsPage from '@/app/legal/terms/page';
import { ENTITY, ENTITY_FOOTER } from '@/lib/entity';

/**
 * Confirmed by the owner on 15 September 2026: the legal entity is 8486 Ventures LLC, its filed
 * DBA is Nexphaselabs, Chase Zelle pays the legal name rather than the DBA, and counsel has
 * signed off every legal page.
 */
type Page = () => React.ReactNode | Promise<React.ReactNode>;
const render = async (page: Page) => renderToStaticMarkup(await page());
const pages: [string, Page][] = [
  ['about', AboutPage as Page],
  ['compliance', CompliancePage as Page],
  ['privacy', PrivacyPage as Page],
  ['terms', TermsPage as Page],
];

afterEach(() => {
  for (const key of Object.keys(env)) delete env[key];
});

describe('the legal identity the site states', () => {
  it('names the entity and its filed DBA on every page that says who is selling', async () => {
    for (const [name, page] of pages) {
      const html = await render(page);
      expect(html, name).toContain('8486 Ventures LLC');
      expect(html, name).toContain('doing business as Nexphaselabs');
      expect(html, name).not.toMatch(/8486 LLC|8486 llc/);
    }
    expect(ENTITY.legalName).toBe('8486 Ventures LLC');
    expect(ENTITY.dbaName).toBe('Nexphaselabs');
    expect(ENTITY_FOOTER).toContain('8486 Ventures LLC');
  });
});

describe('counsel sign-off', () => {
  it('drops the draft banner once the environment records the sign-off, and shows it otherwise', async () => {
    expect(await render(TermsPage as Page)).toContain('Draft — not yet reviewed by counsel.');
    env.POLICIES_COUNSEL_REVIEWED = 'true';
    expect(await render(TermsPage as Page)).not.toContain('Draft — not yet reviewed by counsel.');
  });

  it('is recorded for production and staging in the reviewed configuration', () => {
    expect(readFileSync('wrangler.jsonc', 'utf8').match(/"POLICIES_COUNSEL_REVIEWED": "true"/g)).toHaveLength(2);
  });
});

describe('the Zelle payee', () => {
  it('is the legal business name in both environments, never the DBA', () => {
    const names = [...readFileSync('wrangler.jsonc', 'utf8').matchAll(/"ZELLE_RECIPIENT_NAME": "([^"]+)"/g)].map((match) => match[1]);
    expect(names).toEqual(['8486 Ventures LLC', '8486 Ventures LLC']);
  });
});
