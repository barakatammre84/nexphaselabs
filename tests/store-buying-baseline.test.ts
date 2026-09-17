import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runStoreBuyingBaseline } from '@/lib/store-buying-baseline';
import { localD1 } from './helpers/local-d1';

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
  anonymous['/catalog/ghk-cu'] = response(200, productBody);
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
    expect(
      report.checks.find((check) => check.name === 'signed-in-access')?.detail,
    ).toContain('[staging] /api/account/sign-in');
    expect(
      calls.some((call) =>
        /\/api\/orders|\/api\/payment|\/pay(?:$|\/)/.test(
          new URL(call.url).pathname,
        ),
      ),
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

  it('requires a linked product route for the local fixture baseline', async () => {
    const report = await runStoreBuyingBaseline({
      origin: 'http://127.0.0.1:5000',
      environment: 'local',
      requireProductRoute: true,
      fetcher: fakeFetch(
        healthyRoutes(
          '<main>Catalog Prices and lot availability are shown to research accounts.</main>',
        ),
      ),
    });

    const failure = report.checks.find(
      (check) => check.name === 'browse-product',
    );
    expect(report.ok).toBe(false);
    expect(failure).toMatchObject({
      environment: 'local',
      route: '/catalog',
      ok: false,
    });
    expect(failure?.detail).toContain('seed the local baseline fixture');
  });

  it('applies the generated local fixture to a fresh migrated database', () => {
    const projectRoot = fileURLToPath(new URL('../', import.meta.url));

    execFileSync(
      process.execPath,
      ['node_modules/tsx/dist/cli.mjs', 'scripts/seed-catalog.ts'],
      { cwd: projectRoot, stdio: 'pipe' },
    );

    const local = localD1();
    try {
      local.sqlite.exec(
        readFileSync(
          new URL('../drizzle/seed/local-baseline.sql', import.meta.url),
          'utf8',
        ),
      );

      const product = local.sqlite
        .prepare(
          `SELECT id, code, slug, name, status, visibility
           FROM products
           WHERE id = 'prd_local_baseline'`,
        )
        .get() as
        | {
            id: string;
            code: string;
            slug: string;
            name: string;
            status: string;
            visibility: string;
          }
        | undefined;
      expect(product).toEqual({
        id: 'prd_local_baseline',
        code: 'NPL-999',
        slug: 'synthetic-baseline-material',
        name: 'Synthetic Baseline Material',
        status: 'available',
        visibility: 'published',
      });

      const variant = local.sqlite
        .prepare(
          `SELECT product_id, sku, quantity, list_price_cents,
                  institutional_price_cents, active
           FROM product_variants
           WHERE id = 'var_local_baseline_5mg'`,
        )
        .get() as
        | {
            product_id: string;
            sku: string;
            quantity: string;
            list_price_cents: number;
            institutional_price_cents: number;
            active: number;
          }
        | undefined;
      expect(variant).toEqual({
        product_id: 'prd_local_baseline',
        sku: 'NPL-999-5MG',
        quantity: '5 mg',
        list_price_cents: 1250,
        institutional_price_cents: 1000,
        active: 1,
      });

      const lot = local.sqlite
        .prepare(
          `SELECT product_code, lot_number, status, released_by,
                  quantity_received, quantity_remaining
           FROM lots
           WHERE id = 'lot_local_baseline'`,
        )
        .get() as
        | {
            product_code: string;
            lot_number: string;
            status: string;
            released_by: string;
            quantity_received: string;
            quantity_remaining: string;
          }
        | undefined;
      expect(lot).toEqual({
        product_code: 'NPL-999',
        lot_number: 'LOCAL-BASELINE-2609',
        status: 'released',
        released_by: 'local-baseline-fixture',
        quantity_received: '25 mg',
        quantity_remaining: '25 mg',
      });
    } finally {
      local.sqlite.close();
    }
  });

  it('keeps the local-only fixture out of staging and production seed commands', () => {
    const packageJson = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { scripts: Record<string, string> };
    const localSeed = packageJson.scripts['db:seed:local'];
    const stagingSeed = packageJson.scripts['db:seed:staging'];
    const productionSeed = packageJson.scripts['db:seed:prod'];

    expect(localSeed).toContain('drizzle/seed/local-baseline.sql');
    expect(stagingSeed).toContain('drizzle/seed/catalog.sql');
    expect(productionSeed).toContain('drizzle/seed/catalog.sql');
    expect(stagingSeed).not.toContain('drizzle/seed/local-baseline.sql');
    expect(productionSeed).not.toContain('drizzle/seed/local-baseline.sql');
  });
});
