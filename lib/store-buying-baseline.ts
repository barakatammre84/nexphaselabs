export type StoreBaselineEnvironment =
  | 'production'
  | 'staging'
  | 'development'
  | 'local';

export type StoreBaselineCheck = {
  name: string;
  environment: StoreBaselineEnvironment;
  route: string;
  ok: boolean;
  detail: string;
  status?: number;
};

export type StoreBaselineReport = {
  ok: boolean;
  environment: StoreBaselineEnvironment;
  origin: string;
  checkedAt: string;
  readOnly: boolean;
  checks: StoreBaselineCheck[];
};

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

type ReadResult = {
  response: Response | null;
  body: string;
  error?: string;
};

type QuoteResponse = {
  ok?: unknown;
  quotes?: Array<{
    shippingCents?: unknown;
    taxCents?: unknown;
    test?: unknown;
  }>;
};

export type StoreBaselineOptions = {
  origin: string;
  environment: StoreBaselineEnvironment;
  /**
   * The current production and staging posture requires an account before
   * prices, stock, or the cart are exposed. Pass false only for an environment
   * that has deliberately enabled anonymous pricing.
   */
  accountRequired?: boolean;
  /**
   * Require the local fixture to expose a linked product route. Production and
   * staging may still be checked before their first released lot exists.
   */
  requireProductRoute?: boolean;
  /**
   * Run the authenticated cart and quote rehearsal. This is deliberately
   * accepted only for staging: the production baseline must remain anonymous.
   */
  authenticatedAccount?: {
    email: string;
    password: string;
  };
  fetcher?: Fetcher;
  timeoutMs?: number;
};

function originOf(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

function detail(
  environment: StoreBaselineEnvironment,
  route: string,
  text: string,
): string {
  return `[${environment}] ${route}: ${text}`;
}

function redirectToSignIn(response: Response | null): boolean {
  if (!response || response.status < 300 || response.status >= 400)
    return false;
  return (response.headers.get('location') ?? '').includes('/account/sign-in');
}

function hasJsonError(body: string): boolean {
  try {
    const parsed = JSON.parse(body) as { ok?: unknown; signIn?: unknown };
    return parsed.ok === false && typeof parsed.signIn === 'string';
  } catch {
    return false;
  }
}

function visibleText(body: string): string {
  return body
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#x27;|&#39;/gi, "'")
    .replace(/&quot;/gi, '"');
}

function firstProductRoute(body: string): string | null {
  const match = body.match(/href="(\/catalog\/[a-z0-9-]+)"/i);
  return match?.[1] ?? null;
}

function firstSku(body: string): string | null {
  const match = body.match(/\b(NPL-\d{3,4}-[A-Z0-9.]{1,12})\b/i);
  return match?.[1]?.toUpperCase() ?? null;
}

function sessionCookie(response: Response): string | null {
  const headers = response.headers as Headers & {
    getSetCookie?: () => string[];
  };
  const values = headers.getSetCookie?.() ?? [];
  const combined = values.length
    ? values.join(',')
    : response.headers.get('set-cookie') ?? '';
  const match = combined.match(/(?:^|,)\s*(nx_account=[^;,]+)/i);
  return match?.[1] ?? null;
}

function locationPath(response: Response | null): string | null {
  const location = response?.headers.get('location');
  if (!location) return null;
  try {
    return new URL(location, 'https://baseline.invalid').pathname;
  } catch {
    return location;
  }
}

export async function runStoreBuyingBaseline(
  options: StoreBaselineOptions,
): Promise<StoreBaselineReport> {
  const origin = originOf(options.origin);
  const environment = options.environment;
  const accountRequired = options.accountRequired ?? true;
  const requireProductRoute =
    options.requireProductRoute ?? environment === 'local';
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? 15_000;
  const authenticated = Boolean(options.authenticatedAccount);
  const checks: StoreBaselineCheck[] = [];
  const responses = new Map<string, ReadResult>();
  const requestLog: Array<{ route: string; method: string }> = [];

  const request = async (
    route: string,
    init: RequestInit = {},
    cacheKey?: string,
  ): Promise<ReadResult> => {
    const existing = cacheKey ? responses.get(cacheKey) : undefined;
    if (existing) return existing;

    requestLog.push({
      route,
      method: String(init.method ?? 'GET').toUpperCase(),
    });

    const headers = new Headers(init.headers);
    headers.set('accept', 'text/html,application/json');
    headers.set('cache-control', 'no-cache');
    headers.set('user-agent', 'nexphase-store-buying-baseline/1.0');
    if (init.method && init.method !== 'GET') {
      headers.set('origin', origin);
      headers.set('host', new URL(origin).host);
    }

    let result: ReadResult;
    try {
      const response = await fetcher(`${origin}${route}`, {
        ...init,
        redirect: 'manual',
        headers,
        signal: AbortSignal.timeout(timeoutMs),
      });
      result = { response, body: await response.text() };
    } catch (error) {
      result = {
        response: null,
        body: '',
        error: error instanceof Error ? error.message : String(error),
      };
    }
    if (cacheKey) responses.set(cacheKey, result);
    return result;
  };

  const get = (route: string) => request(route, { method: 'GET' }, route);

  const record = (
    name: string,
    route: string,
    ok: boolean,
    text: string,
    response?: Response | null,
  ) => {
    checks.push({
      name,
      environment,
      route,
      ok,
      detail: detail(environment, route, text),
      ...(response ? { status: response.status } : {}),
    });
  };

  const health = await get('/api/health');
  let healthOk = false;
  try {
    healthOk =
      health.response?.status === 200 &&
      (JSON.parse(health.body) as { ok?: unknown }).ok === true;
  } catch {
    healthOk = false;
  }
  record(
    'health',
    '/api/health',
    healthOk,
    health.error ??
      (healthOk
        ? 'worker and dependencies reported healthy'
        : `expected HTTP 200 with {"ok":true}; received HTTP ${health.response?.status ?? 'no response'}`),
    health.response,
  );

  const home = await get('/');
  const homeOk =
    home.response?.status === 200 &&
    /<main\b/i.test(home.body) &&
    /nexphase/i.test(home.body);
  record(
    'browse-home',
    '/',
    homeOk,
    home.error ??
      (homeOk
        ? 'public home page rendered'
        : `expected HTTP 200 with the storefront shell; received HTTP ${home.response?.status ?? 'no response'}`),
    home.response,
  );

  const catalog = await get('/catalog');
  const catalogOk =
    catalog.response?.status === 200 && /materials|catalog/i.test(catalog.body);
  record(
    'browse-catalog',
    '/catalog',
    catalogOk,
    catalog.error ??
      (catalogOk
        ? 'catalog page rendered'
        : `expected HTTP 200 with catalog content; received HTTP ${catalog.response?.status ?? 'no response'}`),
    catalog.response,
  );

  const pricingText =
    'Prices and lot availability are shown to research accounts.';
  const catalogVisibleText = visibleText(catalog.body);
  const pricingOk = accountRequired
    ? catalogOk &&
      catalog.body.includes(pricingText) &&
      catalog.body.includes('href="/account/sign-in') &&
      !/\$\s?\d/.test(catalogVisibleText)
    : catalogOk && !catalog.body.includes(pricingText);
  record(
    'pricing-visibility',
    '/catalog',
    pricingOk,
    catalog.error ??
      (pricingOk
        ? accountRequired
          ? 'anonymous catalog shows the sign-in boundary without exposing a price'
          : 'catalog does not show the account-required pricing boundary'
        : accountRequired
          ? 'expected account-required copy, a sign-in link, and no anonymous dollar price'
          : 'unexpected account-required pricing copy in an anonymous-pricing environment'),
    catalog.response,
  );

  const productRoute = firstProductRoute(catalog.body);
  if (productRoute) {
    const product = await get(productRoute);
    const productPricingOk = accountRequired
      ? product.body.includes(pricingText) &&
        !/\$\s?\d/.test(visibleText(product.body))
      : !product.body.includes(pricingText) &&
        /\$\s?\d/.test(visibleText(product.body));
    const productOk =
      product.response?.status === 200 &&
      /<main\b/i.test(product.body) &&
      productPricingOk;
    record(
      'browse-product',
      productRoute,
      productOk,
      product.error ??
        (productOk
          ? accountRequired
            ? 'product detail rendered without anonymous pricing'
            : 'product detail rendered'
          : `expected a readable product detail page with the configured pricing boundary; received HTTP ${product.response?.status ?? 'no response'}`),
      product.response,
    );
  } else {
    const productRequiredDetail = requireProductRoute
      ? 'expected a linked released product route; seed the local baseline fixture before running this check'
      : 'skipped: catalog returned no product link (an empty released catalog is allowed)';
    record(
      'browse-product',
      '/catalog',
      catalogOk && !requireProductRoute,
      catalogOk
        ? productRequiredDetail
        : 'not run: catalog did not render, so no product route could be selected',
      catalog.response,
    );
  }

  const signIn = await get('/account/sign-in');
  const signInOk =
    signIn.response?.status === 200 &&
    /<form\b[^>]*action="\/api\/account\/sign-in"/i.test(signIn.body) &&
    /\bname="email"/i.test(signIn.body) &&
    /\bname="password"/i.test(signIn.body);
  record(
    'account-access',
    '/account/sign-in',
    signInOk,
    signIn.error ??
      (signInOk
        ? 'sign-in form is available'
        : `expected the sign-in form; received HTTP ${signIn.response?.status ?? 'no response'}`),
    signIn.response,
  );

  const account = await get('/account');
  const accountOk = redirectToSignIn(account.response);
  record(
    'account-protection',
    '/account',
    accountOk,
    account.error ??
      (accountOk
        ? 'anonymous account access redirects to sign-in'
        : `expected a redirect to /account/sign-in; received HTTP ${account.response?.status ?? 'no response'}`),
    account.response,
  );

  const cartPage = await get('/account/cart');
  const cartPageOk = redirectToSignIn(cartPage.response);
  record(
    'cart-page-protection',
    '/account/cart',
    cartPageOk,
    cartPage.error ??
      (cartPageOk
        ? 'anonymous cart access redirects to sign-in'
        : `expected a redirect to /account/sign-in; received HTTP ${cartPage.response?.status ?? 'no response'}`),
    cartPage.response,
  );

  const cartApi = await get('/api/cart');
  const cartApiOk =
    cartApi.response?.status === 401 && hasJsonError(cartApi.body);
  record(
    'cart-api-protection',
    '/api/cart',
    cartApiOk,
    cartApi.error ??
      (cartApiOk
        ? 'anonymous cart API access is rejected without changing cart state'
        : `expected HTTP 401 JSON with a sign-in target; received HTTP ${cartApi.response?.status ?? 'no response'}`),
    cartApi.response,
  );

  const checkoutQuotes = await get('/api/checkout/quotes');
  const checkoutQuotesOk = checkoutQuotes.response?.status === 405;
  record(
    'checkout-eligibility-boundary',
    '/api/checkout/quotes',
    checkoutQuotesOk,
    checkoutQuotes.error ??
      (checkoutQuotesOk
        ? 'GET is rejected; no quote or checkout mutation was attempted'
        : `expected GET HTTP 405 because quotes require a deliberate POST flow; received HTTP ${checkoutQuotes.response?.status ?? 'no response'}`),
    checkoutQuotes.response,
  );

  if (authenticated) {
    const account = options.authenticatedAccount;
    if (environment !== 'staging') {
      record(
        'signed-in-environment',
        '/api/account/sign-in',
        false,
        'signed-in rehearsal credentials are accepted only for staging',
      );
    } else if (!account) {
      record(
        'signed-in-account',
        '/api/account/sign-in',
        false,
        'a synthetic staging account is required for the signed-in rehearsal',
      );
    } else {
      const signInForm = new FormData();
      signInForm.set('email', account.email);
      signInForm.set('password', account.password);
      signInForm.set('return_to', '/account/cart');
      const signedIn = await request('/api/account/sign-in', {
        method: 'POST',
        body: signInForm,
      });
      const cookie = signedIn.response
        ? sessionCookie(signedIn.response)
        : null;
      const signInOk =
        signedIn.response?.status === 303 &&
        locationPath(signedIn.response) === '/account/cart' &&
        Boolean(cookie && /^nx_account=[a-f0-9]{64}$/i.test(cookie));
      record(
        'signed-in-access',
        '/api/account/sign-in',
        signInOk,
        signedIn.error ??
          (signInOk
            ? 'synthetic account signed in and received a session'
            : `expected a redirect to /account/cart with an account session; received HTTP ${signedIn.response?.status ?? 'no response'}`),
        signedIn.response,
      );

      if (cookie) {
        const authHeaders = { Cookie: cookie };
        const accountPage = await request('/account', {
          method: 'GET',
          headers: authHeaders,
        });
        const accountPageOk =
          accountPage.response?.status === 200 &&
          /<main\b/i.test(accountPage.body);
        record(
          'signed-in-account-page',
          '/account',
          accountPageOk,
          accountPage.error ??
            (accountPageOk
              ? 'signed-in account page rendered'
              : `expected the signed-in account page; received HTTP ${accountPage.response?.status ?? 'no response'}`),
          accountPage.response,
        );

        const authProduct = productRoute
          ? await request(productRoute, {
              method: 'GET',
              headers: authHeaders,
            })
          : null;
        const sku = authProduct ? firstSku(authProduct.body) : null;
        const skuOk = Boolean(
          authProduct?.response?.status === 200 && sku,
        );
        record(
          'signed-in-product',
          productRoute ?? '/catalog',
          skuOk,
          authProduct?.error ??
            (skuOk
              ? `signed-in product rendered with pack ${sku}`
              : `expected a signed-in product with an available pack SKU; received HTTP ${authProduct?.response?.status ?? 'no product route'}`),
          authProduct?.response,
        );

        const addForm = new FormData();
        if (sku) addForm.set('sku', sku);
        addForm.set('quantity', '1');
        addForm.set('return_to', productRoute ?? '/catalog');
        const addToCart = sku
          ? await request('/api/cart', {
              method: 'POST',
              headers: { ...authHeaders, accept: 'application/json' },
              body: addForm,
            })
          : null;
        let addBody: { ok?: unknown; lines?: unknown[] } | null = null;
        try {
          addBody = addToCart
            ? (JSON.parse(addToCart.body) as { ok?: unknown; lines?: unknown[] })
            : null;
        } catch {
          addBody = null;
        }
        const addOk =
          addToCart?.response?.status === 200 && addBody?.ok === true;
        record(
          'signed-in-cart-add',
          '/api/cart',
          addOk,
          addToCart?.error ??
            (addOk
              ? 'one synthetic pack was added to the staging cart'
              : `expected the synthetic pack to be added without creating an order; received HTTP ${addToCart?.response?.status ?? 'not attempted'}`),
          addToCart?.response,
        );

        const cartApi = await request('/api/cart', {
          method: 'GET',
          headers: authHeaders,
        });
        let cartBody: { ok?: unknown; lines?: unknown[] } | null = null;
        try {
          cartBody = JSON.parse(cartApi.body) as {
            ok?: unknown;
            lines?: unknown[];
          };
        } catch {
          cartBody = null;
        }
        const cartApiOk =
          cartApi.response?.status === 200 &&
          cartBody?.ok === true &&
          Array.isArray(cartBody.lines) &&
          cartBody.lines.length > 0;
        record(
          'signed-in-cart-api',
          '/api/cart',
          cartApiOk,
          cartApi.error ??
            (cartApiOk
              ? 'signed-in cart contains the synthetic pack'
              : `expected HTTP 200 JSON with a non-empty signed-in cart; received HTTP ${cartApi.response?.status ?? 'no response'}`),
          cartApi.response,
        );

        const cartPage = await request('/account/cart', {
          method: 'GET',
          headers: authHeaders,
        });
        const checkoutPageOk =
          cartPage.response?.status === 200 &&
          /<form\b[^>]*action="\/api\/orders"/i.test(cartPage.body) &&
          /Continue to payment/i.test(visibleText(cartPage.body));
        record(
          'signed-in-checkout-page',
          '/account/cart',
          checkoutPageOk,
          cartPage.error ??
            (checkoutPageOk
              ? 'signed-in cart rendered the checkout form up to the payment boundary'
              : `expected the signed-in cart checkout form and payment boundary; received HTTP ${cartPage.response?.status ?? 'no response'}`),
          cartPage.response,
        );

        const quoteForm = new FormData();
        quoteForm.set('email', account.email);
        quoteForm.set('name', 'Synthetic staging buyer');
        quoteForm.set('company', 'Synthetic staging account');
        quoteForm.set('line1', '1 Test Street');
        quoteForm.set('city', 'Test City');
        quoteForm.set('region', 'CA');
        quoteForm.set('postalCode', '00000');
        quoteForm.set('country', 'US');
        const quote = await request('/api/checkout/quotes', {
          method: 'POST',
          headers: authHeaders,
          body: quoteForm,
        });
        let quoteBody: QuoteResponse | null = null;
        try {
          quoteBody = JSON.parse(quote.body) as QuoteResponse;
        } catch {
          quoteBody = null;
        }
        const quotes = quoteBody?.quotes ?? [];
        const quoteOk =
          quote.response?.status === 200 &&
          quoteBody?.ok === true &&
          quotes.length > 0 &&
          quotes.every(
            (item) =>
              typeof item.shippingCents === 'number' &&
              typeof item.taxCents === 'number' &&
              item.test === true,
          );
        record(
          'signed-in-shipping-quote',
          '/api/checkout/quotes',
          quoteOk,
          quote.error ??
            (quoteOk
              ? `staging returned ${quotes.length} synthetic delivery quote(s); no order was submitted`
              : `expected HTTP 200 with test delivery and tax quotes; received HTTP ${quote.response?.status ?? 'no response'}`),
          quote.response,
        );
      } else {
        for (const [name, route, text] of [
          [
            'signed-in-account-page',
            '/account',
            'not run: sign-in did not provide a usable session',
          ],
          [
            'signed-in-cart-api',
            '/api/cart',
            'not run: sign-in did not provide a usable session',
          ],
          [
            'signed-in-checkout-page',
            '/account/cart',
            'not run: sign-in did not provide a usable session',
          ],
          [
            'signed-in-shipping-quote',
            '/api/checkout/quotes',
            'not run: sign-in did not provide a usable session',
          ],
        ] as const) {
          record(name, route, false, text);
        }
      }
    }
  }

  const unsafeRequest = requestLog.find(
    (entry) =>
      entry.method !== 'GET' &&
      /^\/api\/orders(?:\/|$)|^\/api\/payment(?:\/|$)/i.test(entry.route),
  );
  const safetyOk = !unsafeRequest;
  if (authenticated) {
    record(
      'order-payment-safety',
      unsafeRequest?.route ?? '/api/orders',
      safetyOk,
      safetyOk
        ? 'no order or payment request was submitted'
        : `unexpected ${unsafeRequest.method} request reached ${unsafeRequest.route}`,
    );
  }

  return {
    ok: checks.every((check) => check.ok),
    environment,
    origin,
    checkedAt: new Date().toISOString(),
    readOnly: !authenticated,
    checks,
  };
}
