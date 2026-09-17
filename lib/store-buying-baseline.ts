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
  readOnly: true;
  checks: StoreBaselineCheck[];
};

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

type ReadResult = {
  response: Response | null;
  body: string;
  error?: string;
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

export async function runStoreBuyingBaseline(
  options: StoreBaselineOptions,
): Promise<StoreBaselineReport> {
  const origin = originOf(options.origin);
  const environment = options.environment;
  const accountRequired = options.accountRequired ?? true;
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? 15_000;
  const checks: StoreBaselineCheck[] = [];
  const responses = new Map<string, ReadResult>();

  const get = async (route: string): Promise<ReadResult> => {
    const existing = responses.get(route);
    if (existing) return existing;

    let result: ReadResult;
    try {
      const response = await fetcher(`${origin}${route}`, {
        method: 'GET',
        redirect: 'manual',
        headers: {
          accept: 'text/html,application/json',
          'cache-control': 'no-cache',
          'user-agent': 'nexphase-store-buying-baseline/1.0',
        },
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
    responses.set(route, result);
    return result;
  };

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
    const productOk =
      product.response?.status === 200 &&
      /<main\b/i.test(product.body) &&
      (!accountRequired ||
        (product.body.includes(pricingText) &&
          !/\$\s?\d/.test(visibleText(product.body))));
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
    record(
      'browse-product',
      '/catalog',
      catalogOk,
      catalogOk
        ? 'skipped: catalog returned no product link (an empty released catalog is allowed)'
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

  return {
    ok: checks.every((check) => check.ok),
    environment,
    origin,
    checkedAt: new Date().toISOString(),
    readOnly: true,
    checks,
  };
}
