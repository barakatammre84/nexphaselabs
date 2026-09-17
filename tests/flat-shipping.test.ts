import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { env } = vi.hoisted(() => ({ env: {} as Record<string, unknown> }));
vi.mock('cloudflare:workers', () => ({ env }));

import { flatShippingRates, parseFlatRates } from '@/lib/flat-shipping';
import { onlineOrderingOpen } from '@/lib/checkout-quotes';
import { quoteShipping, shippingConfiguration } from '@/lib/shipping-provider';

const RATES = JSON.stringify([
  { service: 'expedited', name: 'Expedited (1-2 business days)', cents: 3500, days: 2 },
  { service: 'standard', name: 'Standard (2-5 business days)', cents: 1200, days: 5 },
]);
const ORIGIN = JSON.stringify({
  name: 'NexPhase Labs',
  street1: '1 Origin Way',
  city: 'Lodi',
  state: 'CA',
  zip: '95242',
  country: 'US',
  phone: '4159301422',
  email: 'orders@nexphaselabs.net',
  is_residential: false,
});
const TO = { name: 'Buyer', street1: '2 Bench Rd', city: 'Oakland', state: 'CA', zip: '94612', country: 'US', is_residential: true };
const PARCEL = { length: 8, width: 6, height: 4, weight: 1.2 };

beforeEach(() => {
  Object.assign(env, {
    APP_ENV: 'production',
    SHIPPING_PROVIDER: 'flat',
    LIVE_SHIPPING_ENABLED: 'true',
    SHIPPING_FLAT_RATES_JSON: RATES,
    SHIPPING_FROM_JSON: ORIGIN,
    SHIPPO_ORIGINS_JSON: JSON.stringify([{ id: 'primary', label: 'Lodi location', address: JSON.parse(ORIGIN) }]),
    CHECKOUT_QUOTES_REQUIRED: 'true',
    TAX_PROVIDER: 'cdtfa',
    CDTFA_DISTRICT_RATE: 'destination',
  });
});
afterEach(() => {
  for (const key of Object.keys(env)) delete env[key];
});

describe('the flat rate table', () => {
  it('reads a table, cheapest first', () => {
    const { rates, issues } = parseFlatRates(RATES);
    expect(issues).toEqual([]);
    expect(rates.map((r) => r.service)).toEqual(['standard', 'expedited']);
    expect(rates[0]).toEqual({ service: 'standard', name: 'Standard (2-5 business days)', cents: 1200, days: 5 });
  });

  it('refuses a table it cannot trust rather than quoting a wrong price', () => {
    const cases: [string, string][] = [
      ['', 'Configure the flat shipping rates (SHIPPING_FLAT_RATES_JSON).'],
      ['not json', 'SHIPPING_FLAT_RATES_JSON is not valid JSON.'],
      ['[]', 'SHIPPING_FLAT_RATES_JSON must list between one and six rates.'],
      ['{"service":"standard"}', 'SHIPPING_FLAT_RATES_JSON must list between one and six rates.'],
    ];
    for (const [raw, expected] of cases) expect(parseFlatRates(raw).issues[0]).toBe(expected);

    expect(parseFlatRates('[{"service":"Bad Code","name":"x","cents":1}]').issues[0]).toContain('unique lowercase service code');
    expect(parseFlatRates('[{"service":"standard","name":"","cents":1}]').issues[0]).toContain('needs a name');
    expect(parseFlatRates('[{"service":"standard","name":"x","cents":-1}]').issues[0]).toContain('whole amount in cents');
    expect(parseFlatRates('[{"service":"standard","name":"x","cents":12.5}]').issues[0]).toContain('whole amount in cents');
    expect(parseFlatRates('[{"service":"standard","name":"x","cents":100,"days":99}]').issues[0]).toContain('transit estimate');
    // A duplicate service code would make two rates indistinguishable on the quote.
    expect(parseFlatRates('[{"service":"s","name":"a","cents":1},{"service":"s","name":"b","cents":2}]').issues[0]).toContain('unique');
  });

  it('allows free delivery as a deliberate choice', () => {
    const { rates, issues } = parseFlatRates('[{"service":"standard","name":"Standard","cents":0,"days":3}]');
    expect(issues).toEqual([]);
    expect(rates[0]).toMatchObject({ cents: 0, days: 3 });
  });

  it('insists on a transit estimate, because checkout filters out rates that have none', () => {
    // compareShippingRates drops a null estimate when maxEstimatedDays is set, and checkout always
    // sets it. A table without transit times would quietly vanish at checkout.
    expect(parseFlatRates('[{"service":"standard","name":"Standard","cents":1200}]').issues[0]).toContain('transit estimate');
    expect(parseFlatRates('[{"service":"standard","name":"Standard","cents":1200,"days":null}]').issues[0]).toContain('transit estimate');
  });

  it('turns the table into quotable rates without contacting anybody', () => {
    const rates = flatShippingRates(1.2);
    expect(rates.map((r) => r.cents)).toEqual([1200, 3500]);
    expect(rates[0]).toMatchObject({ carrier: 'USPS', currency: 'USD', test: false, accountId: 'flat' });
    // Stable across identical parcels, so re-quoting an unchanged cart does not churn ids.
    expect(flatShippingRates(1.2)[0].id).toBe(rates[0].id);
  });
});

describe('ordering on flat rates', () => {
  it('opens ordering with no carrier credential at all', async () => {
    // This is the point of the provider: production was closed for want of one USPS secret.
    expect(env.USPS_CLIENT_SECRET).toBeUndefined();
    expect(env.SHIPPO_API_KEY).toBeUndefined();
    expect(shippingConfiguration().issues).toEqual([]);
    expect(onlineOrderingOpen()).toBe(true);

    const quote = await quoteShipping(TO, PARCEL, { services: [], maxEstimatedDays: null });
    expect(quote.ok).toBe(true);
    if (!quote.ok) return;
    expect(quote.provider).toBe('flat');
    expect(quote.rates.map((r) => r.serviceName)).toEqual(['Standard (2-5 business days)', 'Expedited (1-2 business days)']);
    expect(quote.warning).toBeNull();
    expect(quote.originLabel).toBeTruthy();
  });

  it('closes ordering again when the table is missing or wrong', async () => {
    env.SHIPPING_FLAT_RATES_JSON = '';
    expect(shippingConfiguration().issues[0]).toContain('SHIPPING_FLAT_RATES_JSON');
    expect(onlineOrderingOpen()).toBe(false);
    const quote = await quoteShipping(TO, PARCEL, { services: [], maxEstimatedDays: null });
    expect(quote.ok).toBe(false);
  });

  it('still honours the approved-service policy', async () => {
    const quote = await quoteShipping(TO, PARCEL, { services: ['standard'], maxEstimatedDays: null });
    expect(quote.ok && quote.rates.map((r) => r.service)).toEqual(['standard']);
  });
});
