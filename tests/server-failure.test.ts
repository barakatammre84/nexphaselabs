import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.stubGlobal('React', React);
vi.mock('cloudflare:workers', () => ({ env: {} }));
vi.mock('@/lib/marketing-consent', () => ({
  confirmConsent: async () => {
    throw new Error(disclosedSql);
  },
  NEWSLETTER_COPY: {
    confirmed: 'Confirmed.',
    already: 'Already confirmed.',
    invalid: 'Invalid.',
    scope: 'Product news only.',
  },
}));

import { loadCatalog } from '@/lib/catalog-data';
import { reportServerFailure, type ServerFailure } from '@/lib/server-failure';
import NewsletterConfirmPage from '@/app/newsletter/confirm/page';

const disclosedSql =
  'query: select "lot_number", "coa_key" from "lots" where "status" = ? -- params: released';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('render-time server failure reporting', () => {
  it('logs only fixed event names that are safe if React mirrors them into RSC', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failures: ServerFailure[] = [
      'catalog-read',
      'viewer-account-lookup',
      'header-account-lookup',
      'newsletter-confirm',
    ];

    for (const failure of failures) reportServerFailure(failure);

    const serialized = JSON.stringify(log.mock.calls);
    expect(serialized).not.toContain('query:');
    expect(serialized).not.toContain('"lots"');
    expect(log.mock.calls).toEqual([
      ['[catalog] read failed'],
      ['[viewer] account lookup failed'],
      ['[header] account lookup failed'],
      ['[newsletter] confirm failed'],
    ]);
  });

  it('does not log or return a database error from a failed public catalog read', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = await loadCatalog(async () => {
      throw new Error(disclosedSql);
    });

    expect(result).toEqual({ data: null, unavailable: true });
    expect(log).toHaveBeenCalledWith('[catalog] read failed');
    expect(JSON.stringify(log.mock.calls)).not.toContain(disclosedSql);
    expect(JSON.stringify(result)).not.toContain(disclosedSql);
  });

  it('renders a generic newsletter failure without logging database details', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const html = renderToStaticMarkup(
      await NewsletterConfirmPage({
        searchParams: Promise.resolve({ token: 'syntactically-valid-token' }),
      }),
    );

    expect(html).toContain('That could not be recorded just now.');
    expect(html).not.toContain(disclosedSql);
    expect(log).toHaveBeenCalledWith('[newsletter] confirm failed');
    expect(JSON.stringify(log.mock.calls)).not.toContain(disclosedSql);
  });
});
