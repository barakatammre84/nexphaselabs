import { afterEach, describe, expect, it, vi } from 'vitest';

const { env } = vi.hoisted(() => ({ env: {} as Record<string, unknown> }));
vi.mock('cloudflare:workers', () => ({ env }));
import { quoteTax, taxConfiguration } from '@/lib/tax-provider';

const address = {
  name: 'Test',
  street1: '1 Test St',
  city: 'Oakland',
  state: 'CA',
  zip: '94612',
  country: 'US',
  is_residential: false,
};
const input = {
  to: address,
  subtotalCents: 10000,
  shippingCents: 1000,
  lines: [
    {
      id: 'line',
      sku: 'TEST-1',
      description: 'Synthetic',
      quantity: 1,
      unitPriceCents: 10000,
    },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
  for (const key of Object.keys(env)) delete env[key];
});

describe('tax calculation boundary', () => {
  it('uses TaxJar calculate-only endpoint and accepts a bounded amount', async () => {
    Object.assign(env, {
      APP_ENV: 'staging',
      TAX_PROVIDER: 'taxjar',
      TAXJAR_API_KEY: 'synthetic_taxjar_key_123456',
      TAXJAR_SANDBOX: 'true',
      SHIPPO_ORIGINS_JSON: JSON.stringify([
        { id: 'oakland-1', label: 'Oakland', address },
      ]),
    });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ tax: { amount_to_collect: 9.08 } }), {
            status: 200,
          }),
        ),
    );
    expect(await quoteTax(input)).toEqual({
      ok: true,
      cents: 908,
      provider: 'taxjar',
      test: true,
    });
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe(
      'https://api.sandbox.taxjar.com/v2/taxes',
    );
    expect(
      JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string),
    ).toMatchObject({ from_city: 'Oakland', from_zip: '94612' });
  });

  it('refuses malformed or implausible provider amounts', async () => {
    Object.assign(env, {
      APP_ENV: 'production',
      TAX_PROVIDER: 'taxjar',
      TAXJAR_API_KEY: 'synthetic_taxjar_key_123456',
      SHIPPING_FROM_JSON: JSON.stringify(address),
    });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ tax: { amount_to_collect: 99 } }), {
            status: 200,
          }),
        ),
    );
    expect(await quoteTax(input)).toMatchObject({ ok: false });
  });

  it('never permits simulated tax or the sandbox in production', () => {
    Object.assign(env, {
      APP_ENV: 'production',
      TAX_PROVIDER: 'simulated',
      TAX_SIMULATED_RATE_BPS: '825',
    });
    expect(taxConfiguration()).toMatchObject({ ok: false });
    Object.assign(env, {
      TAX_PROVIDER: 'taxjar',
      TAXJAR_API_KEY: 'synthetic_taxjar_key_123456',
      TAXJAR_SANDBOX: 'true',
      SHIPPING_FROM_JSON: JSON.stringify(address),
    });
    expect(taxConfiguration()).toMatchObject({ ok: false });
  });
});

const cdtfaResponse = (rate: number, jurisdiction = 'OAKLAND') =>
  new Response(
    JSON.stringify({
      taxRateInfo: [
        { rate, jurisdiction, city: jurisdiction, county: 'ALAMEDA', tac: '01060D100000' },
      ],
      geocodeInfo: { confidence: 'High' },
    }),
    { status: 200 },
  );

describe('CDTFA California tax provider', () => {
  it('charges the destination district rate and works in production', async () => {
    Object.assign(env, {
      APP_ENV: 'production',
      TAX_PROVIDER: 'cdtfa',
      SHIPPING_FROM_JSON: JSON.stringify(address),
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(cdtfaResponse(0.1075)));
    expect(await quoteTax(input)).toEqual({
      ok: true,
      cents: 1075,
      provider: 'cdtfa',
      test: false,
      jurisdiction: 'OAKLAND',
      ratePpm: 107_500,
      tac: '01060D100000',
    });
    const url = String(vi.mocked(fetch).mock.calls[0][0]);
    expect(url).toContain('services.maps.cdtfa.ca.gov');
    expect(url).toContain('zip=94612');
  });

  it('charges nothing outside California and calls no service', async () => {
    Object.assign(env, {
      APP_ENV: 'production',
      TAX_PROVIDER: 'cdtfa',
      SHIPPING_FROM_JSON: JSON.stringify(address),
    });
    vi.stubGlobal('fetch', vi.fn());
    const result = await quoteTax({
      ...input,
      to: { ...address, state: 'TX', city: 'Houston', zip: '77002' },
    });
    expect(result).toMatchObject({ ok: true, cents: 0, jurisdiction: null });
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('leaves shipping untaxed by default and taxes it when told to', async () => {
    Object.assign(env, {
      APP_ENV: 'production',
      TAX_PROVIDER: 'cdtfa',
      SHIPPING_FROM_JSON: JSON.stringify(address),
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(cdtfaResponse(0.1075)));
    expect(await quoteTax(input)).toMatchObject({ cents: 1075 });
    Object.assign(env, { CDTFA_TAX_SHIPPING: 'true' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(cdtfaResponse(0.1075)));
    expect(await quoteTax(input)).toMatchObject({ cents: 1183 });
  });

  it('uses the statewide base rate without a lookup when configured', async () => {
    Object.assign(env, {
      APP_ENV: 'production',
      TAX_PROVIDER: 'cdtfa',
      CDTFA_DISTRICT_RATE: 'statewide',
      SHIPPING_FROM_JSON: JSON.stringify(address),
    });
    vi.stubGlobal('fetch', vi.fn());
    expect(await quoteTax(input)).toMatchObject({
      ok: true,
      cents: 725,
      jurisdiction: 'CALIFORNIA STATEWIDE BASE',
    });
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('fails closed on an implausible rate, an error status, and an empty result', async () => {
    Object.assign(env, {
      APP_ENV: 'production',
      TAX_PROVIDER: 'cdtfa',
      SHIPPING_FROM_JSON: JSON.stringify(address),
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(cdtfaResponse(0.95)));
    expect(await quoteTax(input)).toMatchObject({ ok: false });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('nope', { status: 503 })),
    );
    expect(await quoteTax(input)).toMatchObject({ ok: false });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ errors: [{ message: 'not found' }] }), {
          status: 200,
        }),
      ),
    );
    expect(await quoteTax(input)).toMatchObject({ ok: false });
  });

  it('refuses a tax origin outside California', () => {
    Object.assign(env, {
      APP_ENV: 'production',
      TAX_PROVIDER: 'cdtfa',
      SHIPPING_FROM_JSON: JSON.stringify({ ...address, state: 'TX', zip: '77002' }),
    });
    expect(taxConfiguration()).toMatchObject({ ok: false });
  });
});
