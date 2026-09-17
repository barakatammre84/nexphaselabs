import { chromium, type Browser, type Page } from 'playwright-core';

export type BrowserForbiddenCategory = 'order' | 'payment' | 'email' | 'label';

export type BrowserNetworkRequest = {
  method: string;
  route: string;
  category?: BrowserForbiddenCategory;
};

export type StoreBuyingBrowserCheck = {
  name: string;
  environment: 'staging';
  route: string;
  ok: boolean;
  detail: string;
  status?: number;
};

export type StoreBuyingBrowserReport = {
  ok: boolean;
  environment: 'staging';
  origin: string;
  checkedAt: string;
  checks: StoreBuyingBrowserCheck[];
  network: {
    observedMutations: BrowserNetworkRequest[];
    forbiddenRequests: BrowserNetworkRequest[];
  };
};

export type StoreBuyingBrowserOptions = {
  origin: string;
  email: string;
  password: string;
  timeoutMs?: number;
  headed?: boolean;
  executablePath?: string;
};

const FORBIDDEN_ROUTE_PATTERNS: Array<{
  category: BrowserForbiddenCategory;
  pattern: RegExp;
}> = [
  {
    category: 'order',
    pattern:
      /(?:^|\/)(?:api\/)?orders?(?:\/|$)|\/checkout\/(?:submit|order)(?:\/|$)/i,
  },
  {
    category: 'payment',
    pattern:
      /(?:^|\/)(?:api\/)?payments?(?:\/|$)|(?:^|\/)pay(?:\/|$)|stripe|btcpay/i,
  },
  {
    category: 'email',
    pattern:
      /(?:^|\/)(?:api\/)?(?:e-?mail|mail|notifications?)(?:\/|$)|resend|gmail/i,
  },
  {
    category: 'label',
    pattern: /(?:^|\/)(?:api\/)?(?:shipping\/)?labels?(?:\/|$)|shipping-label/i,
  },
];

export function classifyBrowserRequest(
  requestUrl: string,
): BrowserForbiddenCategory | undefined {
  const value = requestUrl.toLowerCase();
  return FORBIDDEN_ROUTE_PATTERNS.find(({ pattern }) => pattern.test(value))
    ?.category;
}

function originOf(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

function routeOf(value: string): string {
  try {
    const url = new URL(value);
    return `${url.pathname}${url.search}`;
  } catch {
    return value;
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function visibleBodyText(page: Page): Promise<string> {
  return page
    .locator('body')
    .innerText({ timeout: 2_000 })
    .catch(() => '');
}

function stagingRouteDetail(route: string, text: string): string {
  return `[staging] ${route}: ${text}`;
}

function addNotRunChecks(
  checks: StoreBuyingBrowserCheck[],
  entries: Array<[string, string]>,
) {
  for (const [name, route] of entries) {
    checks.push({
      name,
      environment: 'staging',
      route,
      ok: false,
      detail: stagingRouteDetail(
        route,
        'not run because the earlier staging customer route failed',
      ),
    });
  }
}

export async function runStoreBuyingBrowserBaseline(
  options: StoreBuyingBrowserOptions,
): Promise<StoreBuyingBrowserReport> {
  const origin = originOf(options.origin);
  const timeoutMs = options.timeoutMs ?? 15_000;
  const checks: StoreBuyingBrowserCheck[] = [];
  const observedRequests: BrowserNetworkRequest[] = [];
  const forbiddenRequests: BrowserNetworkRequest[] = [];
  let browser: Browser | null = null;
  let page: Page | null = null;

  const record = (
    name: string,
    route: string,
    ok: boolean,
    text: string,
    status?: number,
  ) => {
    checks.push({
      name,
      environment: 'staging',
      route,
      ok,
      detail: stagingRouteDetail(route, text),
      ...(status === undefined ? {} : { status }),
    });
  };

  try {
    browser = await chromium.launch({
      headless: !options.headed,
      ...(options.executablePath
        ? { executablePath: options.executablePath }
        : {}),
    });
    const context = await browser.newContext();
    page = await context.newPage();
    page.setDefaultTimeout(timeoutMs);
    page.setDefaultNavigationTimeout(timeoutMs);
    page.on('request', (request) => {
      const method = request.method().toUpperCase();
      const route = routeOf(request.url());
      const category = classifyBrowserRequest(request.url());
      const evidence = {
        method,
        route,
        ...(category ? { category } : {}),
      };
      if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
        observedRequests.push(evidence);
      }
      if (category) {
        forbiddenRequests.push(evidence);
      }
    });

    const signInPage = await page.goto(
      `${origin}/account/sign-in?return_to=%2Faccount%2Fcart`,
      { waitUntil: 'domcontentloaded' },
    );
    const signInRouteOk =
      signInPage !== null &&
      signInPage.status() < 400 &&
      (await page.locator('form[action="/api/account/sign-in"]').count()) === 1;
    record(
      'browser-sign-in-page',
      '/account/sign-in',
      signInRouteOk,
      signInRouteOk
        ? 'staging customer sign-in form rendered in Chromium'
        : `expected the staging customer sign-in form; received HTTP ${signInPage?.status() ?? 'no response'}`,
      signInPage?.status(),
    );
    if (!signInRouteOk) {
      addNotRunChecks(checks, [
        ['signed-in-access', '/api/account/sign-in'],
        ['signed-in-cart-add', '/api/cart'],
        ['signed-in-checkout-page', '/account/cart'],
        ['signed-in-shipping-quote', '/api/checkout/quotes'],
        ['signed-in-payment-boundary', '/account/cart'],
      ]);
      return finishReport();
    }

    try {
      const entryNotice = page.locator(
        '[role="dialog"][aria-labelledby="entry-notice-title"]',
      );
      await entryNotice
        .waitFor({ state: 'visible', timeout: Math.min(timeoutMs, 2_000) })
        .catch(() => undefined);
      if (await entryNotice.isVisible().catch(() => false)) {
        await entryNotice.getByRole('button').first().click();
        await entryNotice.waitFor({ state: 'hidden' });
      }
      const signInForm = page.locator('form[action="/api/account/sign-in"]');
      await signInForm.locator('input[name="email"]').fill(options.email);
      await signInForm.locator('input[name="password"]').fill(options.password);
      await page
        .locator('form[action="/api/account/sign-in"] button[type="submit"]')
        .click();
      await page.waitForURL(
        (url) =>
          url.pathname === '/account/cart' ||
          (url.pathname === '/account/sign-in' &&
            url.searchParams.has('error')),
      );
    } catch (error) {
      const body = await visibleBodyText(page);
      record(
        'signed-in-access',
        '/api/account/sign-in',
        false,
        `staging customer route failed: ${errorText(error)}. ${body.slice(0, 240)}`,
      );
      addNotRunChecks(checks, [
        ['signed-in-cart-add', '/api/cart'],
        ['signed-in-checkout-page', '/account/cart'],
        ['signed-in-shipping-quote', '/api/checkout/quotes'],
        ['signed-in-payment-boundary', '/account/cart'],
      ]);
      return finishReport();
    }
    const signedIn = new URL(page.url()).pathname === '/account/cart';
    record(
      'signed-in-access',
      '/api/account/sign-in',
      signedIn,
      signedIn
        ? 'synthetic staging customer session reached the cart'
        : `staging customer sign-in ended at ${routeOf(page.url())}`,
    );
    if (!signedIn) {
      const body = await visibleBodyText(page);
      record(
        'signed-in-access-detail',
        '/api/account/sign-in',
        false,
        `staging customer route failed: ${body.slice(0, 240) || 'no error text was rendered'}`,
      );
      addNotRunChecks(checks, [
        ['signed-in-cart-add', '/api/cart'],
        ['signed-in-checkout-page', '/account/cart'],
        ['signed-in-shipping-quote', '/api/checkout/quotes'],
        ['signed-in-payment-boundary', '/account/cart'],
      ]);
      return finishReport();
    }

    const catalogPage = await page.goto(`${origin}/catalog`, {
      waitUntil: 'domcontentloaded',
    });
    const productRoute = await page
      .locator('a[href^="/catalog/"]')
      .first()
      .getAttribute('href');
    if (!productRoute) {
      record(
        'signed-in-cart-add',
        '/api/cart',
        false,
        'staging customer route did not expose an available catalog product link',
        catalogPage?.status(),
      );
      addNotRunChecks(checks, [
        ['signed-in-checkout-page', '/account/cart'],
        ['signed-in-shipping-quote', '/api/checkout/quotes'],
        ['signed-in-payment-boundary', '/account/cart'],
      ]);
      return finishReport();
    }

    const productPage = await page.goto(`${origin}${productRoute}`, {
      waitUntil: 'domcontentloaded',
    });
    const addForm = page.locator('form[action="/api/cart"]').first();
    const addFormOk = (await addForm.count()) === 1;
    if (!addFormOk) {
      record(
        'signed-in-cart-add',
        '/api/cart',
        false,
        'staging customer route did not expose an available Add to cart form',
        productPage?.status(),
      );
      addNotRunChecks(checks, [
        ['signed-in-checkout-page', '/account/cart'],
        ['signed-in-shipping-quote', '/api/checkout/quotes'],
        ['signed-in-payment-boundary', '/account/cart'],
      ]);
      return finishReport();
    }

    try {
      await addForm.locator('input[name="quantity"]').fill('1');
      await addForm
        .getByRole('button', { name: 'Add to cart', exact: true })
        .click();
      await page.waitForURL(/\/account\/cart(?:\?|$)/);
    } catch (error) {
      record(
        'signed-in-cart-add',
        '/api/cart',
        false,
        `staging customer route failed: ${errorText(error)}`,
      );
      addNotRunChecks(checks, [
        ['signed-in-checkout-page', '/account/cart'],
        ['signed-in-shipping-quote', '/api/checkout/quotes'],
        ['signed-in-payment-boundary', '/account/cart'],
      ]);
      return finishReport();
    }
    const addSucceeded = new URL(page.url()).pathname === '/account/cart';
    record(
      'signed-in-cart-add',
      '/api/cart',
      addSucceeded,
      addSucceeded
        ? 'one available pack was added through the staging customer UI'
        : `staging customer cart add ended at ${routeOf(page.url())}`,
    );
    if (!addSucceeded) {
      addNotRunChecks(checks, [
        ['signed-in-checkout-page', '/account/cart'],
        ['signed-in-shipping-quote', '/api/checkout/quotes'],
        ['signed-in-payment-boundary', '/account/cart'],
      ]);
      return finishReport();
    }

    const checkoutForm = page.locator('form[action="/api/orders"]');
    const checkoutFormOk = (await checkoutForm.count()) === 1;
    record(
      'signed-in-checkout-page',
      '/account/cart',
      checkoutFormOk,
      checkoutFormOk
        ? 'signed-in staging cart rendered the checkout form'
        : 'staging customer route did not render the order form',
    );
    if (!checkoutFormOk) {
      addNotRunChecks(checks, [
        ['signed-in-shipping-quote', '/api/checkout/quotes'],
        ['signed-in-payment-boundary', '/account/cart'],
      ]);
      return finishReport();
    }

    const continueButton = page.getByRole('button', {
      name: 'Continue to payment',
      exact: true,
    });
    const blockedBeforeQuote = await continueButton.isDisabled();
    record(
      'payment-guard-before-quote',
      '/account/cart',
      blockedBeforeQuote,
      blockedBeforeQuote
        ? 'Continue to payment is guarded until a delivery quote is selected'
        : 'Continue to payment was enabled before a delivery quote was selected',
    );

    for (const [name, value] of [
      ['email', options.email],
      ['name', 'Synthetic staging buyer'],
      ['company', 'Synthetic staging account'],
      ['line1', '1 Test Street'],
      ['city', 'Test City'],
      ['region', 'CA'],
      ['postalCode', '00000'],
    ] as const) {
      await checkoutForm.locator(`input[name="${name}"]`).fill(value);
    }
    await checkoutForm.locator('select[name="country"]').selectOption('US');

    const compareButton = page.getByRole('button', {
      name: 'Compare delivery services',
      exact: true,
    });
    let quoteResponse: Awaited<ReturnType<Page['waitForResponse']>>;
    try {
      const quoteResponsePromise = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === '/api/checkout/quotes' &&
          response.request().method() === 'POST',
      );
      await compareButton.click();
      quoteResponse = await quoteResponsePromise;
    } catch (error) {
      record(
        'signed-in-shipping-quote',
        '/api/checkout/quotes',
        false,
        `staging customer route failed: ${errorText(error)}`,
      );
      addNotRunChecks(checks, [
        ['signed-in-payment-boundary', '/account/cart'],
      ]);
      return finishReport();
    }
    const quoteBody = (await quoteResponse.json().catch(() => null)) as {
      ok?: unknown;
      quotes?: Array<{ id?: unknown; test?: unknown }>;
    } | null;
    const quotes = quoteBody?.quotes ?? [];
    const quoteOk =
      quoteResponse.status() === 200 &&
      quoteBody?.ok === true &&
      quotes.length > 0 &&
      quotes.every(
        (quote) => typeof quote.id === 'string' && quote.test === true,
      );
    record(
      'signed-in-shipping-quote',
      '/api/checkout/quotes',
      quoteOk,
      quoteOk
        ? `staging customer route returned ${quotes.length} synthetic quote(s)`
        : `expected a 200 response containing only test quotes; received HTTP ${quoteResponse.status()}`,
      quoteResponse.status(),
    );
    if (!quoteOk) {
      addNotRunChecks(checks, [
        ['signed-in-payment-boundary', '/account/cart'],
      ]);
      return finishReport();
    }

    const selectedQuote =
      (await checkoutForm
        .locator('input[name="checkout_quote"]')
        .inputValue()) !== '';
    const selectedRate =
      (await checkoutForm
        .locator('input[name="delivery_choice"]:checked')
        .count()) > 0;
    const paymentVisible = await page
      .getByText('Payment', { exact: true })
      .first()
      .isVisible();
    const testBannerVisible = await page
      .getByText(/Test environment: rates, tax and payment are synthetic/i)
      .isVisible();
    const enabledAfterQuote = !(await continueButton.isDisabled());
    const paymentBoundaryOk =
      selectedQuote &&
      selectedRate &&
      paymentVisible &&
      testBannerVisible &&
      enabledAfterQuote;
    record(
      'signed-in-payment-boundary',
      '/account/cart',
      paymentBoundaryOk,
      paymentBoundaryOk
        ? 'a test quote is selected, the payment step is visible, and Continue to payment is ready without being submitted'
        : 'staging customer route did not render the selected test quote and payment boundary together',
    );
  } catch (error) {
    const route = page ? routeOf(page.url()) : '/account/sign-in';
    record(
      'browser-session',
      route,
      false,
      `staging customer route failed: ${errorText(error)}`,
    );
  } finally {
    await browser?.close().catch(() => undefined);
  }

  return finishReport();

  function finishReport(): StoreBuyingBrowserReport {
    if (!checks.some((check) => check.name === 'browser-network-safety')) {
      if (forbiddenRequests.length > 0) {
        record(
          'browser-network-safety',
          forbiddenRequests[0].route,
          false,
          `forbidden ${forbiddenRequests[0].category} request observed in the staging browser`,
        );
      } else {
        record(
          'browser-network-safety',
          '/api/orders',
          true,
          'browser network evidence shows no order, payment, email, or label request',
        );
      }
    }
    return {
      ok: checks.every((check) => check.ok),
      environment: 'staging',
      origin,
      checkedAt: new Date().toISOString(),
      checks,
      network: {
        observedMutations: observedRequests,
        forbiddenRequests,
      },
    };
  }
}
