import { beforeEach, describe, expect, it, vi } from 'vitest';

const { env } = vi.hoisted(() => ({ env: {} as Record<string, unknown> }));
vi.mock('cloudflare:workers', () => ({ env }));

import {
  decodeUspsRateId,
  encodeUspsRateId,
  idempotencyKeyFromLabelId,
  labelR2Key,
  priceToCents,
  splitConsigneeName,
  uspsCancelLabel,
  uspsConfiguration,
  uspsPurchaseLabel,
  uspsQuote,
} from '@/lib/usps-provider';

const origin = {
  name: 'NexPhase Labs',
  street1: 'PO Box 1234',
  city: 'Lodi',
  state: 'CA',
  zip: '95242',
  country: 'US',
  phone: '4159301422',
  email: 'shipping@nexphaselabs.net',
  is_residential: false,
};
const destination = {
  name: 'Ada Marie Lovelace',
  street1: '2700 S Jefferson Ave',
  city: 'St. Louis',
  state: 'MO',
  zip: '63118',
  country: 'US',
  is_residential: true,
};
const parcel = { length: 9, width: 6, height: 4, weight: 0.5 };

const pdf = Buffer.from('%PDF-1.4 synthetic label').toString('base64');

let clientSeed = 0;
/** A distinct consumer key per test so the module token cache never leaks across them. */
function credentials(extra: Record<string, unknown> = {}) {
  clientSeed += 1;
  Object.assign(env, {
    APP_ENV: 'staging',
    USPS_CLIENT_ID: `consumerkey000000000${clientSeed}`,
    USPS_CLIENT_SECRET: 'consumersecret0000000',
    USPS_CRID: '59918139',
    USPS_MID: '904260903',
    USPS_MANIFEST_MID: '904260903',
    USPS_MAIL_CLASSES: 'USPS_GROUND_ADVANTAGE',
    ...extra,
  });
}

type Route = { match: string; status?: number; body: unknown };
function routedFetch(routes: Route[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const mock = vi.fn(async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    const route = routes.find((candidate) => url.includes(candidate.match));
    if (!route) throw new Error(`unrouted USPS call: ${url}`);
    return new Response(JSON.stringify(route.body), {
      status: route.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', mock);
  return calls;
}

const tokenRoute: Route = {
  match: '/oauth2/v3/token',
  body: { access_token: 'access-token-value', expires_in: 28_800 },
};
const paymentRoute: Route = {
  match: '/payments/v3/payment-authorization',
  body: { paymentAuthorizationToken: 'payment-token-value' },
};
const priceRoute: Route = {
  match: '/prices/v3/total-rates/search',
  body: {
    rateOptions: [
      {
        totalBasePrice: 8.15,
        rates: [
          {
            mailClass: 'USPS_GROUND_ADVANTAGE',
            rateIndicator: 'SP',
            processingCategory: 'MACHINABLE',
            commitment: { name: '2-5 Days' },
          },
        ],
      },
    ],
  },
};

beforeEach(() => {
  for (const key of Object.keys(env)) delete env[key];
  vi.unstubAllGlobals();
});

describe('value handling', () => {
  it('converts USPS prices to whole cents and refuses sub-cent precision', () => {
    expect(priceToCents(8.15)).toBe(815);
    expect(priceToCents(26.25)).toBe(2_625);
    expect(priceToCents(0)).toBeNull();
    expect(priceToCents(-4)).toBeNull();
    expect(priceToCents('8.15')).toBeNull();
    expect(priceToCents(8.1234)).toBeNull();
  });

  it('splits a consignee name into the first and last USPS requires', () => {
    expect(splitConsigneeName('Ada Marie Lovelace')).toEqual({
      firstName: 'Ada Marie',
      lastName: 'Lovelace',
    });
    expect(splitConsigneeName('Prince')).toEqual({
      firstName: 'Prince',
      lastName: 'Prince',
    });
  });

  it('reuses the durable label claim as a UUID idempotency key', () => {
    expect(idempotencyKeyFromLabelId('sl_0123456789abcdef0123456789abcdef')).toBe(
      '01234567-89ab-cdef-0123-456789abcdef',
    );
    expect(idempotencyKeyFromLabelId('sl_short')).toBeNull();
    expect(idempotencyKeyFromLabelId('not-a-claim')).toBeNull();
  });

  it('only accepts label object keys inside the private label prefix', () => {
    expect(labelR2Key('r2:shipping-labels/2026/sl_abc.pdf')).toBe(
      'shipping-labels/2026/sl_abc.pdf',
    );
    expect(labelR2Key('r2:../../etc/passwd')).toBeNull();
    expect(labelR2Key('r2:coa/secret.pdf')).toBeNull();
    expect(labelR2Key('https://example.com/label.pdf')).toBeNull();
  });
});

describe('rate identifiers', () => {
  const parts = {
    mailClass: 'USPS_GROUND_ADVANTAGE' as const,
    rateIndicator: 'SP',
    processingCode: 'M' as const,
    originZIPCode: '95242',
    destinationZIPCode: '63118',
    weightHundredths: 50,
    lengthHundredths: 900,
    widthHundredths: 600,
    heightHundredths: 400,
    cents: 815,
  };

  it('round-trips every rate ingredient the label request restates', () => {
    const id = encodeUspsRateId(parts);
    expect(id).toBe('usps-GA-SP-M-95242-63118-50-900-600-400-815');
    expect(id.length).toBeLessThanOrEqual(120);
    expect(id).toMatch(/^[a-zA-Z0-9_-]{1,120}$/);
    expect(decodeUspsRateId(id)).toEqual(parts);
  });

  it('refuses malformed, truncated or foreign rate identifiers', () => {
    expect(decodeUspsRateId('shippo-rate-1')).toBeNull();
    expect(decodeUspsRateId('usps-GA-SP-M-95242-63118-50-900-600-400')).toBeNull();
    expect(decodeUspsRateId('usps-ZZ-SP-M-95242-63118-50-900-600-400-815')).toBeNull();
    expect(decodeUspsRateId('usps-GA-SP-X-95242-63118-50-900-600-400-815')).toBeNull();
    expect(decodeUspsRateId('usps-GA-SP-M-9524-63118-50-900-600-400-815')).toBeNull();
    expect(decodeUspsRateId('usps-GA-SP-M-95242-63118-0-900-600-400-815')).toBeNull();
  });
});

describe('configuration', () => {
  it('names every missing USPS credential', () => {
    Object.assign(env, { APP_ENV: 'staging' });
    const issues = uspsConfiguration().issues.join(' ');
    expect(issues).toContain('USPS_CLIENT_ID');
    expect(issues).toContain('USPS_CLIENT_SECRET');
    expect(issues).toContain('USPS_CRID');
    expect(issues).toContain('USPS_MID');
  });

  it('is usable for rating before an EPS account exists, but not for labels', () => {
    credentials();
    const configuration = uspsConfiguration();
    expect(configuration.issues).toEqual([]);
    expect(configuration.labelsReady).toBe(false);
  });

  it('turns labels on once the payment account is set', () => {
    credentials({ USPS_EPS_ACCOUNT_NUMBER: '1000012345' });
    expect(uspsConfiguration().labelsReady).toBe(true);
  });

  it('keeps staging on the USPS test host and production on the live one', () => {
    credentials();
    expect(uspsConfiguration().host).toBe('https://apis-tem.usps.com');
    credentials({ APP_ENV: 'production' });
    expect(uspsConfiguration().host).toBe('https://apis.usps.com');
  });

  it('lets a deployment point staging at the live host, but only at USPS', () => {
    credentials({ USPS_API_HOST: 'https://apis.usps.com' });
    const pointed = uspsConfiguration();
    expect(pointed.host).toBe('https://apis.usps.com');
    expect(pointed.issues).toEqual([]);

    credentials({ USPS_API_HOST: 'https://apis.usps.com.evil.test' });
    const refused = uspsConfiguration();
    expect(refused.issues.join(' ')).toContain('USPS_API_HOST');
    // A refused override must not silently fall back to a working host.
    expect(refused.host).toBe('https://apis-tem.usps.com');
  });
});

describe('rating', () => {
  it('prices a parcel and carries the delivery commitment through', async () => {
    credentials({ USPS_EPS_ACCOUNT_NUMBER: '1000012345' });
    const calls = routedFetch([tokenRoute, priceRoute]);
    const result = await uspsQuote(origin, destination, parcel);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rates).toHaveLength(1);
    expect(result.rates[0]).toMatchObject({
      carrier: 'USPS',
      service: 'usps_ground_advantage',
      serviceName: 'USPS Ground Advantage',
      cents: 815,
      currency: 'USD',
      // The far end of "2-5 Days" is what a customer is promised.
      estimatedDays: 5,
      test: true,
    });
    expect(result.rates[0].id).toBe('usps-GA-SP-M-95242-63118-50-900-600-400-815');
    expect(result.warning).toBeNull();

    const priced = calls.find((call) => call.url.includes('total-rates'))!;
    const body = JSON.parse(String(priced.init.body));
    expect(body).toMatchObject({
      originZIPCode: '95242',
      destinationZIPCode: '63118',
      weight: 0.5,
      length: 9,
      width: 6,
      height: 4,
      mailClass: 'USPS_GROUND_ADVANTAGE',
      priceType: 'COMMERCIAL',
      accountType: 'EPS',
    });
    // Rating must never request a payment authorisation; it spends nothing.
    expect(calls.some((call) => call.url.includes('payment-authorization'))).toBe(
      false,
    );
  });

  it('quotes retail and says so when no payment account is configured yet', async () => {
    credentials();
    routedFetch([tokenRoute, priceRoute]);
    const result = await uspsQuote(origin, destination, parcel);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warning).toContain('Retail');
  });

  it('discards a priced option for a mail class it did not ask for', async () => {
    credentials();
    routedFetch([
      tokenRoute,
      {
        match: '/prices/v3/total-rates/search',
        body: {
          rateOptions: [
            {
              totalBasePrice: 4.2,
              rates: [{ mailClass: 'MEDIA_MAIL', rateIndicator: 'SP' }],
            },
          ],
        },
      },
    ]);
    const result = await uspsQuote(origin, destination, parcel);
    expect(result.ok).toBe(false);
  });

  it('reports a rejected consumer key without pretending to have rates', async () => {
    credentials();
    routedFetch([{ match: '/oauth2/v3/token', status: 401, body: {} }]);
    const result = await uspsQuote(origin, destination, parcel);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('consumer key');
  });
});

describe('label purchase', () => {
  const labelId = 'sl_0123456789abcdef0123456789abcdef';
  /**
   * The vnd.usps.labels+json body is flat — LabelVendorResponse is an allOf
   * over LabelMetadata — and `labelAddress` is the standardised address, not a
   * metadata container. Shaped from the spec's own Base64EncodedImagesExample.
   */
  const labelRoute: Route = {
    match: '/labels/v3/label',
    body: {
      labelAddress: {
        firstName: 'ADA MARIE',
        lastName: 'LOVELACE',
        streetAddress: '2700 S JEFFERSON AVE',
        city: 'SAINT LOUIS',
        state: 'MO',
        ZIPCode: '63118',
      },
      routingInformation: '420631182628',
      trackingNumber: '9205590006662200704797',
      SKU: 'DPXX0XXXXC01270',
      postage: 8.72,
      zone: '08',
      weightUOM: 'lb',
      weight: 0.5,
      warnings: [
        {
          warningCode: '160423',
          warningDescription: 'ADVISORY - serial numbers in range are in use.',
        },
      ],
      labelImage: pdf,
    },
  };

  it('refuses to buy postage before the EPS account exists', async () => {
    credentials();
    routedFetch([tokenRoute]);
    env.DOCS = { put: vi.fn() };
    const result = await uspsPurchaseLabel(
      'usps-GA-SP-M-95242-63118-50-900-600-400-815',
      origin,
      destination,
      labelId,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.uncertain).toBe(false);
    expect(result.error).toContain('Enterprise Payment System');
  });

  it('buys one label, keys it for idempotency and stores the PDF privately', async () => {
    credentials({ USPS_EPS_ACCOUNT_NUMBER: '1000012345' });
    const put = vi.fn(async (_key: string, _bytes: Uint8Array) => undefined);
    env.DOCS = { put };
    const calls = routedFetch([tokenRoute, paymentRoute, labelRoute]);
    const result = await uspsPurchaseLabel(
      'usps-GA-SP-M-95242-63118-50-900-600-400-815',
      origin,
      destination,
      labelId,
      null,
      new Date('2026-09-15T12:00:00Z'),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.trackingNumber).toBe('9205590006662200704797');
    // Read from the flat body, and it is USPS's repriced figure (8.72) rather
    // than the 8.15 that was quoted. Reading postage from labelAddress, as an
    // earlier version did, silently yields nothing at all.
    expect(result.postageCents).toBe(872);
    expect(result.warnings).toEqual([
      '160423: ADVISORY - serial numbers in range are in use.',
    ]);
    expect(result.labelUrl).toBe(`r2:shipping-labels/2026/${labelId}.pdf`);

    expect(put).toHaveBeenCalledTimes(1);
    const [key, bytes] = put.mock.calls[0];
    expect(key).toBe(`shipping-labels/2026/${labelId}.pdf`);
    expect(Array.from(bytes.slice(0, 4))).toEqual([
      0x25, 0x50, 0x44, 0x46,
    ]);

    const label = calls.find((call) => call.url.endsWith('/labels/v3/label'))!;
    const headers = label.init.headers as Record<string, string>;
    expect(headers['X-Idempotency-Key']).toBe(
      '01234567-89ab-cdef-0123-456789abcdef',
    );
    expect(headers['X-Payment-Authorization-Token']).toBe('payment-token-value');
    const body = JSON.parse(String(label.init.body));
    expect(body.packageDescription).toMatchObject({
      mailClass: 'USPS_GROUND_ADVANTAGE',
      rateIndicator: 'SP',
      processingCategory: 'MACHINABLE',
      weight: 0.5,
      length: 9,
      width: 6,
      height: 4,
      mailingDate: '2026-09-15',
    });
    expect(body.toAddress).toMatchObject({
      firstName: 'Ada Marie',
      lastName: 'Lovelace',
      ZIPCode: '63118',
    });
  });

  it('refuses a rate quoted for a different route', async () => {
    credentials({ USPS_EPS_ACCOUNT_NUMBER: '1000012345' });
    env.DOCS = { put: vi.fn() };
    routedFetch([tokenRoute, paymentRoute, labelRoute]);
    const result = await uspsPurchaseLabel(
      'usps-GA-SP-M-95242-99999-50-900-600-400-815',
      origin,
      destination,
      labelId,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('no longer matches');
  });

  it('treats a label that is not a PDF as unresolved rather than bought', async () => {
    credentials({ USPS_EPS_ACCOUNT_NUMBER: '1000012345' });
    const put = vi.fn();
    env.DOCS = { put };
    routedFetch([
      tokenRoute,
      paymentRoute,
      {
        match: '/labels/v3/label',
        body: {
          trackingNumber: '9205590006662200704797',
          labelImage: Buffer.from('not a pdf').toString('base64'),
        },
      },
    ]);
    const result = await uspsPurchaseLabel(
      'usps-GA-SP-M-95242-63118-50-900-600-400-815',
      origin,
      destination,
      labelId,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.uncertain).toBe(true);
    expect(put).not.toHaveBeenCalled();
  });

  it('does not call USPS at all when the rate identifier is not ours', async () => {
    credentials({ USPS_EPS_ACCOUNT_NUMBER: '1000012345' });
    env.DOCS = { put: vi.fn() };
    const calls = routedFetch([tokenRoute, paymentRoute, labelRoute]);
    const result = await uspsPurchaseLabel(
      'shippo-rate-identifier',
      origin,
      destination,
      labelId,
    );
    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });
});

describe('label cancellation', () => {
  it('reports a cancelled label as settled', async () => {
    credentials({ USPS_EPS_ACCOUNT_NUMBER: '1000012345' });
    routedFetch([
      tokenRoute,
      paymentRoute,
      {
        match: '/labels/v3/label/',
        body: { trackingNumber: '9205590006662200704797', status: 'CANCELED' },
      },
    ]);
    const result = await uspsCancelLabel('9205590006662200704797');
    expect(result).toEqual({
      ok: true,
      status: 'success',
      reference: '9205590006662200704797',
    });
  });

  it('reports a manifested label as a pending dispute, never as money back', async () => {
    credentials({ USPS_EPS_ACCOUNT_NUMBER: '1000012345' });
    routedFetch([
      tokenRoute,
      paymentRoute,
      {
        match: '/labels/v3/label/',
        body: { status: 'DISPUTED', disputeId: '103789' },
      },
    ]);
    const result = await uspsCancelLabel('9205590006662200704797');
    expect(result).toEqual({ ok: true, status: 'pending', reference: '103789' });
  });

  it('refuses an answer USPS did not actually give', async () => {
    credentials({ USPS_EPS_ACCOUNT_NUMBER: '1000012345' });
    routedFetch([
      tokenRoute,
      paymentRoute,
      { match: '/labels/v3/label/', body: { status: 'PROCESSING' } },
    ]);
    const result = await uspsCancelLabel('9205590006662200704797');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.uncertain).toBe(true);
  });
});
