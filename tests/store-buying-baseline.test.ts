import { describe, expect, it } from 'vitest';
import { runStoreBuyingBaseline } from '@/lib/store-buying-baseline';

function response(
  status: number,
  body: string,
  headers: Record<string, string> = {},
) {
  return new Response(body, { status, headers });
}

function fakeFetch(
  routes: Record<string, Response>,
  calls: Array<{ url: string; method: string }> = [],
) {
  return async (url: string, init?: RequestInit) => {
    calls.push({ url, method: String(init?.method ?? '') });
    const route = new URL(url).pathname;
    return routes[route] ?? response(404, 'not found');
  };
}

function signedInFakeFetch(
  calls: Array<{ url: string; method: string }>,
  { liveQuote = true } = {},
) {
  const anonymous: Record<string, Response> = healthyRoutes(
    '<main>Catalog Prices and lot availability are shown to research accounts. <a href="/account/sign-in">Sign in</a> <a href="/catalog/ghk-cu">GHK-Cu</a></main>',
  );
  const productBody =
    '<main>GHK-Cu NPL-0001-1MG Prices and lot availability are shown to research accounts.</main>';
  anonymous['/catalog/ghk-cu'] = response(
    200,
    productBody,
  );
  return async (url: string, init?: RequestInit) => {
    const path = new URL(url).pathname;
    const method = String(init?.method ?? 'GET').toUpperCase();
    const cookie = new Headers(init?.headers).get('cookie');
    const signedIn = cookie === `nx_account=${'a'.repeat(64)}`;
    calls.push({ url, method });

    if (path === '/api/account/sign-in' && method === 'POST') {
      return response(303, '', {
        location: '/account/cart',
        'set-cookie': `nx_account=${'a'.repeat(64)}; Path=/; HttpOnly`,
      });
    }
    if (signedIn && path === '/account') {
      return response(200, '<main>Research account</main>');
    }
    if (signedIn && path === '/catalog/ghk-cu') {
      return response(200, productBody);
    }
    if (signedIn && path === '/api/cart' && method === 'POST') {
      return response(200, '{"ok":true,"lines":[{"itemId":"line-1"}]}');
    }
    if (signedIn && path === '/api/cart' && method === 'GET') {
      return response(200, '{"ok":true,"lines":[{"itemId":"line-1"}]}');
    }
    if (signedIn && path === '/account/cart') {
      return response(
        200,
        '<main>Your cart <form action="/api/orders">Continue to payment Compare delivery services</form></main>',
      );
    }
    if (signedIn && path === '/api/checkout/quotes' && method === 'POST') {
      return liveQuote
        ? response(
            200,
            '{"ok":true,"quotes":[{"shippingCents":900,"taxCents":83,"test":true}]}',
          )
        : response(
            200,
            '{"ok":true,"quotes":[{"shippingCents":900,"taxCents":83,"test":false}]}',
          );
    }
    if (path === '/api/checkout/quotes' && method === 'GET') {
      return anonymous[path];
    }
    return anonymous[path] ?? response(404, 'not found');
  };
}

const healthyRoutes = (
  catalog = '<main>Catalog Prices and lot availability are shown to research accounts. <a href="/account/sign-in">Sign in</a> <a href="/catalog/ghk-cu">GHK-Cu</a><script>self.rsc.push("$2")</script></main>',
) => ({
  '/api/health': response(200, '{"ok":true,"env":"production"}', {
    'content-type': 'application/json',
  }),
  '/': response(200, '<main>NexPhase Labs</main>'),
  '/catalog': response(200, catalog),
  '/catalog/ghk-cu': response(
    200,
    '<main>GHK-Cu Prices and lot availability are shown to research accounts.</main>',
  ),
  '/account/sign-in': response(
    200,
    '<form action="/api/account/sign-in"><input name="email"><input name="password"></form>',
  ),
  '/account': response(307, '', {
    location: '/account/sign-in?return_to=%2Faccount',
  }),
  '/account/cart': response(307, '', {
    location: '/account/sign-in?return_to=%2Faccount%2Fcart',
  }),
  '/api/cart': response(401, '{"ok":false,"signIn":"/account/sign-in"}', {
    'content-type': 'application/json',
  }),
  '/api/checkout/quotes': response(405, 'Method Not Allowed'),
});

describe('store buying-flow baseline', () => {
  it('passes the anonymous read-only contract without sending a mutating request', async () => {
    const calls: Array<{ url: string; method: string }> = [];
    const report = await runStoreBuyingBaseline({
      origin: 'https://store.example',
      environment: 'production',
      fetcher: fakeFetch(healthyRoutes(), calls),
    });

    expect(report.ok).toBe(true);
    expect(report.readOnly).toBe(true);
    expect(
      report.checks.every((check) => check.environment === 'production'),
    ).toBe(true);
    expect(calls.every((call) => call.method === 'GET')).toBe(true);
    expect(calls.map((call) => new URL(call.url).pathname)).not.toContain(
      '/api/orders',
    );
  });

  it('identifies the affected environment and route when a boundary regresses', async () => {
    const routes = healthyRoutes();
    routes['/api/cart'] = response(200, '{"ok":true,"lines":[]}', {
      'content-type': 'application/json',
    });

    const report = await runStoreBuyingBaseline({
      origin: 'http://127.0.0.1:5000',
      environment: 'local',
      fetcher: fakeFetch(routes),
    });
    const failure = report.checks.find(
      (check) => check.name === 'cart-api-protection',
    );

    expect(report.ok).toBe(false);
    expect(failure).toMatchObject({
      environment: 'local',
      route: '/api/cart',
      ok: false,
      status: 200,
    });
    expect(failure?.detail).toContain('[local] /api/cart');
  });

  it('supports an explicitly configured anonymous-pricing environment', async () => {
    const routes = healthyRoutes(
      '<main>Catalog <a href="/catalog/ghk-cu">GHK-Cu</a> $25.00</main>',
    );
    routes['/catalog/ghk-cu'] = response(200, '<main>GHK-Cu $25.00</main>');

    const report = await runStoreBuyingBaseline({
      origin: 'http://127.0.0.1:5000',
      environment: 'development',
      accountRequired: false,
      fetcher: fakeFetch(routes),
    });

    expect(report.ok).toBe(true);
    expect(
      report.checks.find((check) => check.name === 'pricing-visibility')
        ?.detail,
    ).toContain('does not show the account-required pricing boundary');
  });

  it('rehearses signed-in staging checkout through synthetic quotes without ordering or paying', async () => {
    const calls: Array<{ url: string; method: string }> = [];
    const report = await runStoreBuyingBaseline({
      origin: 'https://staging.example',
      environment: 'staging',
      authenticatedAccount: {
        email: 'synthetic@example.invalid',
        password: 'not-printed',
      },
      fetcher: signedInFakeFetch(calls),
    });

    expect(report.ok).toBe(true);
    expect(report.readOnly).toBe(false);
    expect(
      report.checks
        .filter((check) => check.name.startsWith('signed-in'))
        .every((check) => check.environment === 'staging'),
    ).toBe(true);
    expect(report.checks.find((check) => check.name === 'signed-in-access')?.detail).toContain(
      '[staging] /api/account/sign-in',
    );
    expect(
      calls.some((call) => /\/api\/orders|\/api\/payment|\/pay(?:$|\/)/.test(new URL(call.url).pathname)),
    ).toBe(false);
  });

  it('identifies a non-test quote failure by staging environment and customer route', async () => {
    const report = await runStoreBuyingBaseline({
      origin: 'https://staging.example',
      environment: 'staging',
      authenticatedAccount: {
        email: 'synthetic@example.invalid',
        password: 'not-printed',
      },
      fetcher: signedInFakeFetch([], { liveQuote: false }),
    });
    const failure = report.checks.find(
      (check) => check.name === 'signed-in-shipping-quote',
    );

    expect(report.ok).toBe(false);
    expect(failure).toMatchObject({
      environment: 'staging',
      route: '/api/checkout/quotes',
      ok: false,
      status: 200,
    });
    expect(failure?.detail).toContain('[staging] /api/checkout/quotes');
  });
});
