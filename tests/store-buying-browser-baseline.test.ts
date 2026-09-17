import { describe, expect, it } from 'vitest';
import {
  classifyBrowserRequest,
  runStoreBuyingBrowserBaseline,
  runStagingBuyerPreflight,
} from '@/lib/store-buying-browser-baseline';

describe('staging browser network safety', () => {
  it('classifies every customer-side effect that must remain untouched', () => {
    expect(classifyBrowserRequest('https://staging.example/api/orders')).toBe(
      'order',
    );
    expect(
      classifyBrowserRequest('https://staging.example/api/payments/start'),
    ).toBe('payment');
    expect(
      classifyBrowserRequest('https://staging.example/api/notifications/send'),
    ).toBe('email');
    expect(
      classifyBrowserRequest('https://staging.example/api/shipping/labels'),
    ).toBe('label');
  });

  it('does not treat the intended sign-in, cart, or quote routes as unsafe', () => {
    for (const route of [
      '/api/account/sign-in',
      '/api/cart',
      '/api/checkout/quotes',
      '/account/cart',
    ]) {
      expect(classifyBrowserRequest(`https://staging.example${route}`)).toBe(
        undefined,
      );
    }
  });
});

describe('staging buyer preflight', () => {
  const fetcher = (response: Response) => async () => response;

  it('reports missing configuration without making a request', async () => {
    const result = await runStagingBuyerPreflight({
      origin: 'https://staging.example',
      email: '',
      password: '',
      fetcher: async () => {
        throw new Error('must not be called');
      },
    });

    expect(result).toMatchObject({
      ok: false,
      state: 'missing',
      route: '/api/account/sign-in',
    });
    expect(result.detail).not.toContain('must not be called');
  });

  it('blocks the browser rehearsal before Chromium when the preflight fails', async () => {
    const report = await runStoreBuyingBrowserBaseline({
      origin: 'https://staging.example',
      email: '',
      password: '',
      executablePath: '/path/that/does/not/exist',
    });

    expect(report).toMatchObject({
      ok: false,
      preflight: {
        ok: false,
        state: 'missing',
        route: '/api/account/sign-in',
      },
    });
    expect(report.checks.map((check) => check.name)).not.toContain(
      'browser-session',
    );
    expect(
      report.checks.find((check) => check.name === 'signed-in-payment-boundary')
        ?.detail,
    ).toContain('not run');
  });

  it('confirms a redirect with an account session without exposing credentials', async () => {
    const response = new Response(null, {
      status: 303,
      headers: {
        location: 'https://staging.example/account/cart',
        'set-cookie': `nx_account=${'a'.repeat(64)}; Path=/; HttpOnly`,
      },
    });
    const result = await runStagingBuyerPreflight({
      origin: 'https://staging.example',
      email: 'synthetic@example.invalid',
      password: 'not-in-output',
      fetcher: fetcher(response),
    });

    expect(result).toMatchObject({
      ok: true,
      state: 'ready',
      status: 303,
    });
    expect(result.detail).not.toContain('synthetic@example.invalid');
    expect(result.detail).not.toContain('not-in-output');
  });

  it.each([
    ['unverified', 'unverified'],
    ['expired', 'expired'],
    ['locked', 'locked'],
    ['suspended', 'suspended'],
    ['throttled', 'throttled'],
    ['invalid', 'invalid'],
  ] as const)(
    'classifies %s staging account failures',
    async (error, state) => {
      const result = await runStagingBuyerPreflight({
        origin: 'https://staging.example',
        email: 'synthetic@example.invalid',
        password: 'not-in-output',
        fetcher: fetcher(
          new Response(null, {
            status: 303,
            headers: {
              location: `https://staging.example/account/sign-in?error=${error}`,
            },
          }),
        ),
      });

      expect(result).toMatchObject({
        ok: false,
        state,
        route: '/api/account/sign-in',
        status: 303,
      });
      expect(result.detail).not.toContain('not-in-output');
    },
  );
});
