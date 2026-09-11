import { afterEach, describe, expect, it, vi } from 'vitest';
const { env } = vi.hoisted(() => ({ env: {} as Record<string, unknown> }));
vi.mock('cloudflare:workers', () => ({ env }));
import {
  compareShippingRates,
  normalizeShippoRates,
  parcelError,
  usdCents,
} from '@/lib/shipping-rates';
import {
  quoteShipping,
  reconcileShippingLabelRefund,
  requestShippingLabelRefund,
  safeLabelUrl,
  shippingConfiguration,
} from '@/lib/shipping-provider';
const address = {
  name: 'Synthetic',
  street1: '1 Test St',
  city: 'Test',
  state: 'CA',
  zip: '00000',
  country: 'US',
  phone: '5105550100',
  email: 'shipping@example.com',
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
describe('USPS/UPS/FedEx eligible rate comparison', () => {
  it('allows only Shippo-hosted label URLs', () => {
    expect(
      safeLabelUrl('https://shippo-delivery.s3.amazonaws.com/test-label.pdf'),
    ).toBe('https://shippo-delivery.s3.amazonaws.com/test-label.pdf');
    expect(safeLabelUrl('https://files.goshippo.com/test-label.pdf')).toBe(
      'https://files.goshippo.com/test-label.pdf',
    );
    expect(safeLabelUrl('https://example.com/test-label.pdf')).toBeNull();
    expect(safeLabelUrl('http://files.goshippo.com/test-label.pdf')).toBeNull();
  });
  it('selects the cheapest eligible returned USPS/UPS/FedEx quote and retains its account', () => {
    const rates = normalizeShippoRates(
      payload([
        raw(),
        raw({ object_id: 'r2', provider: 'FedEx', amount: '7.99' }),
        raw({
          object_id: 'r3',
          provider: 'USPS',
          amount: '6.75',
          servicelevel: {
            token: 'usps_ground_advantage',
            name: 'Ground Advantage',
          },
        }),
      ]),
      ['account1'],
      true,
    );
    expect(compareShippingRates(rates, policy)[0]).toMatchObject({
      carrier: 'USPS',
      cents: 675,
      accountId: 'account1',
    });
  });
  it.each([
    { currency: 'EUR' },
    { provider: 'DHL Express' },
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
  it('requires sender contact details before requesting carrier labels', () => {
    Object.assign(env, {
      APP_ENV: 'staging',
      SHIPPING_PROVIDER: 'shippo',
      SHIPPO_API_KEY: 'shippo_test_synthetic',
      SHIPPO_CARRIER_ACCOUNTS: 'account1',
      SHIPPING_FROM_JSON: JSON.stringify({
        ...address,
        phone: undefined,
        email: undefined,
      }),
    });
    expect(shippingConfiguration().issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining('sender phone'),
        expect.stringContaining('sender email'),
      ]),
    );
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
      vi.fn().mockResolvedValue(
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
  it('uses the selected named origin and enforces the approved service list', async () => {
    const second = { ...address, street1: '2 Test St', city: 'Berkeley' };
    Object.assign(env, {
      APP_ENV: 'staging',
      SHIPPING_PROVIDER: 'shippo',
      SHIPPO_API_KEY: 'shippo_test_synthetic',
      SHIPPO_CARRIER_ACCOUNTS: 'account1',
      SHIPPO_ORIGINS_JSON: JSON.stringify([
        { id: 'oakland-1', label: 'Oakland', address },
        { id: 'berkeley-1', label: 'Berkeley', address: second },
      ]),
      SHIPPING_ALLOWED_SERVICES: 'usps_ground_advantage',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json(
          payload([
            raw({
              object_id: 'ground',
              provider: 'USPS',
              amount: '6.25',
              servicelevel: {
                token: 'usps_ground_advantage',
                name: 'Ground Advantage',
              },
            }),
            raw({
              object_id: 'express',
              provider: 'USPS',
              amount: '26.25',
              servicelevel: {
                token: 'usps_priority_express',
                name: 'Priority Mail Express',
              },
            }),
          ]),
        ),
      ),
    );
    expect(
      await quoteShipping(address, parcel, policy, 'berkeley-1'),
    ).toMatchObject({
      ok: true,
      originId: 'berkeley-1',
      rates: [{ id: 'ground', service: 'usps_ground_advantage' }],
    });
    const [, input] = vi.mocked(fetch).mock.calls[0];
    expect(JSON.parse(input!.body as string).address_from).toMatchObject({
      street1: '2 Test St',
      city: 'Berkeley',
    });
    expect((await quoteShipping(address, parcel, policy, 'missing')).ok).toBe(
      false,
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects duplicate named-origin IDs before contacting Shippo', async () => {
    Object.assign(env, {
      APP_ENV: 'staging',
      SHIPPING_PROVIDER: 'shippo',
      SHIPPO_API_KEY: 'shippo_test_synthetic',
      SHIPPO_CARRIER_ACCOUNTS: 'account1',
      SHIPPO_ORIGINS_JSON: JSON.stringify([
        { id: 'duplicate', label: 'One', address },
        { id: 'duplicate', label: 'Two', address },
      ]),
    });
    vi.stubGlobal('fetch', vi.fn());
    expect(shippingConfiguration().issues).toEqual(
      expect.arrayContaining([expect.stringContaining('unique ID')]),
    );
    expect((await quoteShipping(address, parcel, policy)).ok).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
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
      comparedCarriers: ['UPS', 'FedEx', 'USPS'],
    });
    expect(fetch).not.toHaveBeenCalled();
    env.APP_ENV = 'production';
    expect((await quoteShipping(address, parcel, policy)).ok).toBe(false);
  });

  it('creates one refund request and reconciles the existing refund by ID', async () => {
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
        .mockResolvedValueOnce(
          Response.json(
            {
              object_id: 'refund1',
              transaction: 'transaction1',
              status: 'PENDING',
              test: true,
            },
            { status: 201 },
          ),
        )
        .mockResolvedValueOnce(
          Response.json({
            object_id: 'refund1',
            transaction: 'transaction1',
            status: 'SUCCESS',
            test: true,
          }),
        ),
    );
    expect(await requestShippingLabelRefund('transaction1')).toMatchObject({
      ok: true,
      status: 'pending',
      refundId: 'refund1',
    });
    expect(
      await reconcileShippingLabelRefund('transaction1', 'refund1'),
    ).toMatchObject({ ok: true, status: 'success', refundId: 'refund1' });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(vi.mocked(fetch).mock.calls[1][0]).toBe(
      'https://api.goshippo.com/refunds/refund1',
    );
  });

  it('recovers an uncertain refund by read-only transaction lookup without posting again', async () => {
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
        .mockRejectedValueOnce(new Error('timeout after provider commit'))
        .mockResolvedValueOnce(
          Response.json({
            next: null,
            previous: null,
            results: [
              {
                object_id: 'refund-recovered',
                transaction: 'transaction1',
                status: 'SUCCESS',
                test: true,
              },
            ],
          }),
        ),
    );
    expect(await requestShippingLabelRefund('transaction1')).toMatchObject({
      ok: false,
      uncertain: true,
    });
    expect(await reconcileShippingLabelRefund('transaction1')).toMatchObject({
      ok: true,
      status: 'success',
      refundId: 'refund-recovered',
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(vi.mocked(fetch).mock.calls[0][1]?.method).toBe('POST');
    expect(vi.mocked(fetch).mock.calls[1][1]?.method).toBeUndefined();
    expect(vi.mocked(fetch).mock.calls[1][0]).toBe(
      'https://api.goshippo.com/refunds/?results=100',
    );
  });
});
