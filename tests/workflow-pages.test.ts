import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.stubGlobal('React', React);
const { state } = vi.hoisted(() => ({
  state: {
    signedIn: false,
    status: 'more_info',
    note: '<script>not markup</script> Please attach registration.',
  },
}));
vi.mock('@/lib/site-config', () => ({ openCheckoutEnabled: () => false }));
vi.mock('next/link', () => ({
  default: ({
    children,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) =>
    React.createElement('a', props, children),
}));
vi.mock('@/lib/account-auth', () => ({
  getAccount: async () => (state.signedIn ? { id: 'local' } : null),
  requireAccount: async () => ({
    id: 'local',
    name: 'Synthetic Researcher',
    email: 'test@example.invalid',
    tier: 'institutional',
    verificationStatus: state.status,
  }),
}));
vi.mock('@/lib/account-rules', () => ({ acknowledgementsCurrent: () => true }));
vi.mock('@/lib/organizations', () => ({
  getOrganizationForAccount: async () => ({ reviewNote: state.note }),
}));
vi.mock('@/lib/orders', () => ({ listOrdersForAccount: async () => [] }));
// Saved addresses read the database; this test is about what the page renders.
vi.mock('@/lib/account-addresses', () => ({ listAddresses: async () => [] }));
vi.mock('@/lib/catalog-data', () => ({
  loadCatalog: async (fn: () => Promise<unknown>) => ({
    data: await fn(),
    unavailable: false,
  }),
}));
import { SiteHeader } from '@/components/site/site-header';
import { AccessProgress } from '@/components/site/access-progress';
import AccountPage from '@/app/account/page';
beforeEach(() => {
  state.signedIn = false;
  state.status = 'more_info';
});
describe('navigation and account rendering', () => {
  it('renders sign-in in both desktop and mobile navigation', async () => {
    const html = renderToStaticMarkup(await SiteHeader());
    expect(html.match(/href="\/account\/sign-in"/g)).toHaveLength(2);
    expect(html).toContain('Mobile navigation');
  });
  it('renders cart links for signed-in customers', async () => {
    state.signedIn = true;
    const html = renderToStaticMarkup(await SiteHeader());
    expect(html.match(/href="\/account\/cart"/g)).toHaveLength(2);
    expect(html).not.toContain('href="/account/sign-in"');
  });
  it('shows the actual review request safely and links to resubmission', async () => {
    const html = renderToStaticMarkup(
      await AccountPage({ searchParams: Promise.resolve({}) }),
    );
    expect(html).toContain('Please attach registration.');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>not markup');
    expect(html).toContain('Update details and resubmit');
    expect(html).toContain('href="/account/organization"');
  });
  it('does not show an obsolete review message after approval', async () => {
    state.status = 'approved';
    const html = renderToStaticMarkup(
      await AccountPage({ searchParams: Promise.resolve({}) }),
    );
    expect(html).not.toContain('Please attach registration.');
    expect(html).toContain('Verified institutional account');
  });
  it('marks only the current step and marks approval complete', () => {
    const pending = renderToStaticMarkup(
      React.createElement(AccessProgress, { current: 2 }),
    );
    expect(pending.match(/aria-current="step"/g)).toHaveLength(1);
    const complete = renderToStaticMarkup(
      React.createElement(AccessProgress, { current: 3, complete: true }),
    );
    expect(complete).not.toContain('aria-current');
    expect(complete.match(/>Complete</g)).toHaveLength(4);
  });
});
