import { afterEach, describe, expect, it, vi } from 'vitest';
const { env } = vi.hoisted(() => ({ env: {} as Record<string, unknown> }));
vi.mock('cloudflare:workers', () => ({ env }));
import {
  compareShippingRates,
  normalizeShippoRates,
  parcelError,
  usdCents,
} from '@/lib/shipping-rates';
import { quoteShipping, shippingConfiguration } from '@/lib/shipping-provider';
const address = {
  name: 'Synthetic',
  street1: '1 Test St',
  city: 'Test',
  state: 'CA',
  zip: '00000',
  country: 'US',
  is_residential: false,
};
const parcel = { length: 5, width: 5, height: 5, weight: 1 };
const policy = { services: [] as string[], maxEstimatedDays: null };
const raw = (changes = {}) => ({
  object_id: 'rate1',
  carrier_account: 'account1',
  provider: 'UPS',
  currency: 'USD',
  test: true,
  amount: '8.25',
  estimated_days: 3,
  servicelevel: { token: 'ups_ground', name: 'Ground' },
  ...changes,
});
const payload = (rates: unknown[]) => ({
  object_id: 'shipment1',
  test: true,
  rates,
});
afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of Object.keys(env)) delete env[k];
});
describe('UPS/FedEx eligible rate comparison', () => {
  it('selects the cheapest eligible returned UPS/FedEx quote and retains its account', () => {
    const rates = normalizeShippoRates(
      payload([
        raw(),
        raw({ object_id: 'r2', provider: 'FedEx', amount: '7.99' }),
      ]),
      ['account1'],
      true,
    );
    expect(compareShippingRates(rates, policy)[0]).toMatchObject({
      carrier: 'FedEx',
      cents: 799,
      accountId: 'account1',
    });
  });
  it.each([
    { currency: 'EUR' },
    { provider: 'USPS' },
    { carrier_account: 'other' },
    { test: false },
    { amount: '-1' },
    { amount: '0' },
    { amount: 'NaN' },
    { amount: '1.001' },
    { object_id: '../bad' },
  ])('rejects malformed or unapproved rates: %j', (changes) => {
    expect(
      normalizeShippoRates(payload([raw(changes)]), ['account1'], true),
    ).toEqual([]);
  });
  it('does not compare mixed environment results', () => {
    expect(
      normalizeShippoRates(
        { ...payload([raw()]), test: false },
        ['account1'],
        true,
      ),
    ).toEqual([]);
  });
  it('excludes unknown/slower transit when a maximum is required and honors service allowlists', () => {
    const rates = normalizeShippoRates(
      payload([
        raw(),
        raw({ object_id: 'unknown', estimated_days: null, amount: '1.00' }),
      ]),
      ['account1'],
      true,
    );
    expect(
      compareShippingRates(rates, { services: [], maxEstimatedDays: 2 }),
    ).toEqual([]);
    expect(
      compareShippingRates(rates, {
        services: ['fedex_2_day'],
        maxEstimatedDays: null,
      }),
    ).toEqual([]);
  });
  it('uses exact integer cents and rejects invalid parcel measurements', () => {
    expect(usdCents('1.01')).toBe(101);
    expect(usdCents(1.01)).toBeNull();
    expect(parcelError({ ...parcel, weight: NaN })).not.toBeNull();
    expect(parcelError({ ...parcel, length: 109 })).not.toBeNull();
  });
  it('never sends a live key from staging or unknown environments', async () => {
    Object.assign(env, {
      APP_ENV: 'staging',
      SHIPPING_PROVIDER: 'shippo',
      SHIPPO_API_KEY: 'shippo_live_synthetic',
      SHIPPO_CARRIER_ACCOUNTS: 'account1',
      SHIPPING_FROM_JSON: JSON.stringify(address),
    });
    vi.stubGlobal('fetch', vi.fn());
    expect((await quoteShipping(address, parcel, policy)).ok).toBe(false);
    env.APP_ENV = 'preview';
    expect(shippingConfiguration().issues.length).toBeGreaterThan(0);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('requests rates from explicit accounts without purchasing a label, and reports partial carrier errors', async () => {
    Object.assign(env, {
      APP_ENV: 'staging',
      SHIPPING_PROVIDER: 'shippo',
      SHIPPO_API_KEY: 'shippo_test_synthetic',
      SHIPPO_CARRIER_ACCOUNTS: 'account1',
      SHIPPING_FROM_JSON: JSON.stringify(address),
    });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json({
            ...payload([raw()]),
            messages: [{ text: 'Sensitive provider information' }],
          }),
        ),
    );
    expect(await quoteShipping(address, parcel, policy)).toMatchObject({
      ok: true,
      test: true,
      comparedCarriers: ['UPS'],
      warning: expect.stringContaining('may not include'),
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, input] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('https://api.goshippo.com/shipments/');
    expect(JSON.parse(input!.body as string)).toMatchObject({
      carrier_accounts: ['account1'],
      parcels: [{ mass_unit: 'lb', distance_unit: 'in' }],
    });
  });
  it('supports deterministic non-production rehearsal and refuses that provider in production', async () => {
    Object.assign(env, {
      APP_ENV: 'staging',
      SHIPPING_PROVIDER: 'simulated',
      SHIPPING_SIMULATION_ENABLED: 'true',
      SHIPPING_FROM_JSON: JSON.stringify(address),
    });
    vi.stubGlobal('fetch', vi.fn());
    expect(await quoteShipping(address, parcel, policy)).toMatchObject({
      ok: true,
      test: true,
      comparedCarriers: ['UPS', 'FedEx'],
    });
    expect(fetch).not.toHaveBeenCalled();
    env.APP_ENV = 'production';
    expect((await quoteShipping(address, parcel, policy)).ok).toBe(false);
  });
});
