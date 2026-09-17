import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({ APP_ENV: 'production', PUBLIC_ORIGIN: 'https://nexphaselabs.net' }) as Record<string, unknown>);
vi.mock('cloudflare:workers', () => ({ env }));

import { jsonLdScript, organizationJsonLd } from '@/lib/structured-data';
import WholesalePage from '@/app/wholesale/page';

describe('structured data', () => {
  it('describes the organization and the site, and nothing that reads as an offer', () => {
    const data = organizationJsonLd();
    const text = JSON.stringify(data);
    expect(data['@graph'].map((node) => node['@type'])).toEqual(['Organization', 'WebSite']);
    expect(data['@graph'][0]).toMatchObject({ name: 'NexPhase Labs', legalName: '8486 Ventures LLC', url: 'https://nexphaselabs.net' });
    for (const banned of ['Offer', 'Product', 'AggregateRating', 'SearchAction', 'streetAddress', 'price', 'telephone'])
      expect(text).not.toContain(banned);
  });

  it('cannot break out of its script element', () => {
    expect(jsonLdScript({ name: '</script><b>' })).toBe('{"name":"\\u003c/script>\\u003cb>"}');
  });
});

describe('wholesale page', () => {
  it('explains the account and sends applicants to the institutional sign-up, with no prices or claims', () => {
    const html = renderToStaticMarkup(React.createElement(WholesalePage));
    expect(html).toContain('href="/account/sign-up?tier=institutional"');
    expect(html).toContain('purchase order');
    expect(html).toContain('laboratory research use only');
    expect(html).toContain('We do not provide medical, dosing');
    expect(html).not.toMatch(/\$\d/);
  });
});
