import { env } from 'cloudflare:workers';
import {
  compareShippingRates,
  normalizeShippoRates,
  parcelError,
  type Parcel,
  type RatePolicy,
} from '@/lib/shipping-rates';
import { boundedJson } from '@/lib/provider-response';

export type ShippingAddress = {
  name: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone?: string;
  is_residential: boolean;
};
export function addressError(address: ShippingAddress): string | null {
  const hasControl = (value: string) =>
    [...value].some((character) => character.charCodeAt(0) < 32);
  if (!address || typeof address !== 'object')
    return 'A complete US shipping address is required.';
  for (const key of ['name', 'street1', 'city', 'state', 'zip'] as const) {
    if (
      typeof address[key] !== 'string' ||
      !address[key].trim() ||
      address[key].length > 160 ||
      hasControl(address[key])
    )
      return 'A complete US shipping address is required.';
  }
  for (const key of ['street2', 'phone'] as const) {
    if (
      address[key] !== undefined &&
      (typeof address[key] !== 'string' ||
        address[key]!.length > 160 ||
        hasControl(address[key]!))
    )
      return 'Invalid optional address field.';
  }
  if (
    address.country !== 'US' ||
    !/^[A-Z]{2}$/.test(address.state) ||
    !/^\d{5}(?:-\d{4})?$/.test(address.zip) ||
    typeof address.is_residential !== 'boolean'
  )
    return 'Use a US address, two-letter state, ZIP code and residential/commercial designation.';
  return null;
}

export function shippingConfiguration() {
  const issues: string[] = [];
  const test = env.APP_ENV === 'staging' || env.APP_ENV === 'development';
  if (!test && env.APP_ENV !== 'production')
    issues.push('Shipping is disabled in this environment.');
  const simulated = env.SHIPPING_PROVIDER === 'simulated';
  if (simulated && (!test || env.SHIPPING_SIMULATION_ENABLED !== 'true'))
    issues.push(
      'Simulated shipping is allowed only in development or staging with explicit enablement.',
    );
  if (!simulated && env.SHIPPING_PROVIDER !== 'shippo')
    issues.push('Shipping provider is not configured.');
  const key = env.SHIPPO_API_KEY ?? '';
  if (
    !simulated &&
    !(test ? /^shippo_test_[A-Za-z0-9]+$/ : /^shippo_live_[A-Za-z0-9]+$/).test(
      key,
    )
  )
    issues.push(
      test
        ? 'A Shippo TEST key is required; live keys are refused here.'
        : 'A Shippo live key is required.',
    );
  if (!test && env.LIVE_SHIPPING_ENABLED !== 'true')
    issues.push('Live shipping has not been enabled.');
  const accounts = (env.SHIPPO_CARRIER_ACCOUNTS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (
    !simulated &&
    (!accounts.length ||
      accounts.length > 10 ||
      accounts.some((v) => !/^[a-zA-Z0-9_-]{1,120}$/.test(v)))
  )
    issues.push('Configure the UPS/FedEx carrier account IDs to compare.');
  let from: ShippingAddress | null = null;
  try {
    from = JSON.parse(
      env.SHIPPING_FROM_JSON ?? 'null',
    ) as ShippingAddress | null;
  } catch {
    /* reported below */
  }
  if (!from || addressError(from))
    issues.push('Configure a complete ship-from address.');
  return { issues, test, simulated, accounts, from, key };
}

/** No label-purchase endpoint is called. Customer PII and credentials are not logged. */
export async function quoteShipping(
  to: ShippingAddress,
  parcel: Parcel,
  policy: RatePolicy,
) {
  const configuration = shippingConfiguration();
  const inputIssue = addressError(to) ?? parcelError(parcel);
  if (inputIssue || configuration.issues.length)
    return {
      ok: false as const,
      error: inputIssue ?? configuration.issues.join(' '),
    };
  if (configuration.simulated) {
    const pounds = Math.max(1, Math.ceil(parcel.weight));
    const rates = compareShippingRates(
      [
        {
          id: `sim-ups-ground-${pounds}`,
          shipmentId: `sim-shipment-${pounds}`,
          accountId: 'sim-ups',
          carrier: 'UPS',
          service: 'ups_ground',
          serviceName: 'Ground',
          cents: 845 + pounds * 55,
          currency: 'USD',
          estimatedDays: 5,
          test: true,
        },
        {
          id: `sim-fedex-ground-${pounds}`,
          shipmentId: `sim-shipment-${pounds}`,
          accountId: 'sim-fedex',
          carrier: 'FedEx',
          service: 'fedex_ground',
          serviceName: 'Ground',
          cents: 875 + pounds * 50,
          currency: 'USD',
          estimatedDays: 5,
          test: true,
        },
        {
          id: `sim-ups-2day-${pounds}`,
          shipmentId: `sim-shipment-${pounds}`,
          accountId: 'sim-ups',
          carrier: 'UPS',
          service: 'ups_2_day',
          serviceName: '2nd Day Air',
          cents: 1_745 + pounds * 85,
          currency: 'USD',
          estimatedDays: 2,
          test: true,
        },
        {
          id: `sim-fedex-2day-${pounds}`,
          shipmentId: `sim-shipment-${pounds}`,
          accountId: 'sim-fedex',
          carrier: 'FedEx',
          service: 'fedex_2_day',
          serviceName: '2Day',
          cents: 1_695 + pounds * 90,
          currency: 'USD',
          estimatedDays: 2,
          test: true,
        },
      ],
      policy,
    );
    return {
      ok: true as const,
      rates,
      test: true,
      warning:
        'Synthetic staging rates. Connect the approved UPS and FedEx accounts before launch.',
      comparedCarriers: [...new Set(rates.map((rate) => rate.carrier))],
      quotedAt: new Date().toISOString(),
    };
  }
  try {
    const response = await fetch('https://api.goshippo.com/shipments/', {
      method: 'POST',
      signal: AbortSignal.timeout(15_000),
      headers: {
        Authorization: `ShippoToken ${configuration.key}`,
        'Content-Type': 'application/json',
        'SHIPPO-API-VERSION': '2018-02-08',
      },
      body: JSON.stringify({
        address_from: configuration.from,
        address_to: to,
        parcels: [{ ...parcel, distance_unit: 'in', mass_unit: 'lb' }],
        carrier_accounts: configuration.accounts,
        async: false,
      }),
    });
    if (!response.ok)
      return {
        ok: false as const,
        error: `Shipping provider returned ${response.status}. No label was purchased.`,
      };
    const payload = (await boundedJson(response)) as { messages?: unknown[] };
    const rates = compareShippingRates(
      normalizeShippoRates(payload, configuration.accounts, configuration.test),
      policy,
    );
    if (!rates.length)
      return {
        ok: false as const,
        error:
          'No eligible UPS/FedEx rates were returned. Check accounts, package details and service requirements.',
      };
    return {
      ok: true as const,
      rates,
      test: configuration.test,
      warning:
        Array.isArray(payload.messages) && payload.messages.length
          ? 'Some carrier requests reported an issue. These results may not include every configured account.'
          : null,
      comparedCarriers: [...new Set(rates.map((r) => r.carrier))],
      quotedAt: new Date().toISOString(),
    };
  } catch {
    return {
      ok: false as const,
      error:
        'Shipping quote could not be confirmed. Try again; no label was purchased.',
    };
  }
}

function safeLabelUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2_000) return null;
  try {
    const url = new URL(value);
    const allowed =
      url.protocol === 'https:' &&
      (url.hostname === 'shippo-delivery.s3.amazonaws.com' ||
        url.hostname.endsWith('.shippo.com') ||
        url.hostname.endsWith('.goshippo.com'));
    return allowed ? url.href : null;
  } catch {
    return null;
  }
}

/** Purchasing is separate from quoting and is called only after a durable order-level claim. */
export async function purchaseShippingLabel(
  rateId: string,
  orderNumber: string,
) {
  const configuration = shippingConfiguration();
  if (configuration.issues.length)
    return {
      ok: false as const,
      uncertain: false,
      error: configuration.issues.join(' '),
    };
  if (!/^[a-zA-Z0-9_-]{1,120}$/.test(rateId))
    return {
      ok: false as const,
      uncertain: false,
      error: 'The selected carrier rate is invalid.',
    };
  if (configuration.simulated) {
    const suffix = orderNumber
      .replace(/[^A-Z0-9]/gi, '')
      .slice(-12)
      .toUpperCase();
    return {
      ok: true as const,
      transactionId: `sim-label-${suffix}`,
      trackingNumber: `TEST${suffix}`,
      labelUrl: null,
      test: true,
    };
  }
  try {
    const response = await fetch('https://api.goshippo.com/transactions/', {
      method: 'POST',
      signal: AbortSignal.timeout(20_000),
      headers: {
        Authorization: `ShippoToken ${configuration.key}`,
        'Content-Type': 'application/json',
        'SHIPPO-API-VERSION': '2018-02-08',
      },
      body: JSON.stringify({
        rate: rateId,
        label_file_type: 'PDF',
        async: false,
      }),
    });
    if (!response.ok)
      return {
        ok: false as const,
        uncertain: response.status >= 500,
        error: `Label provider returned ${response.status}. Check the provider dashboard before trying anything else.`,
      };
    const value = await boundedJson(response);
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return {
        ok: false as const,
        uncertain: true,
        error:
          'Label provider response was invalid. Reconcile it in the provider dashboard.',
      };
    const transaction = value as Record<string, unknown>;
    const transactionId =
      typeof transaction.object_id === 'string' &&
      /^[a-zA-Z0-9_-]{1,120}$/.test(transaction.object_id)
        ? transaction.object_id
        : null;
    const trackingNumber =
      typeof transaction.tracking_number === 'string' &&
      /^[a-zA-Z0-9 -]{4,120}$/.test(transaction.tracking_number)
        ? transaction.tracking_number.trim()
        : null;
    const labelUrl = safeLabelUrl(transaction.label_url);
    if (
      transaction.status !== 'SUCCESS' ||
      transaction.test !== configuration.test ||
      !transactionId ||
      !trackingNumber ||
      !labelUrl
    )
      return {
        ok: false as const,
        uncertain: true,
        error:
          'Label purchase was not confirmed. Reconcile it in the provider dashboard.',
      };
    return {
      ok: true as const,
      transactionId,
      trackingNumber,
      labelUrl,
      test: configuration.test,
    };
  } catch {
    return {
      ok: false as const,
      uncertain: true,
      error:
        'Label purchase outcome is uncertain. Do not retry; reconcile it in the provider dashboard.',
    };
  }
}
