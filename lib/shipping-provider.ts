import { env } from 'cloudflare:workers';
import { flatShippingIssues, flatShippingRates } from '@/lib/flat-shipping';
import {
  compareShippingRates,
  normalizeShippoRates,
  parcelError,
  type Parcel,
  type RatePolicy,
} from '@/lib/shipping-rates';
import { boundedJson } from '@/lib/provider-response';
import {
  uspsCancelLabel,
  uspsConfiguration,
  uspsPurchaseLabel,
  uspsQuote,
} from '@/lib/usps-provider';

export type ShippingAddress = {
  name: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone?: string;
  email?: string;
  is_residential: boolean;
};
export type ShippingOrigin = {
  id: string;
  label: string;
  address: ShippingAddress;
  active?: boolean;
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
  for (const key of ['street2', 'phone', 'email'] as const) {
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

function configuredOrigins(simulated: boolean, issues: string[]) {
  const origins: ShippingOrigin[] = [];
  const rawOrigins = env.SHIPPO_ORIGINS_JSON;
  if (rawOrigins) {
    try {
      const parsed = JSON.parse(rawOrigins) as unknown;
      if (!Array.isArray(parsed) || parsed.length > 10)
        throw new Error('invalid origin collection');
      for (const value of parsed) {
        if (!value || typeof value !== 'object' || Array.isArray(value))
          throw new Error('invalid origin');
        const candidate = value as Record<string, unknown>;
        if (candidate.active === false) continue;
        if (
          typeof candidate.id !== 'string' ||
          !/^[a-z0-9][a-z0-9-]{0,39}$/.test(candidate.id) ||
          typeof candidate.label !== 'string' ||
          !candidate.label.trim() ||
          candidate.label.length > 80 ||
          !candidate.address ||
          typeof candidate.address !== 'object' ||
          Array.isArray(candidate.address)
        )
          throw new Error('invalid origin');
        origins.push({
          id: candidate.id,
          label: candidate.label.trim(),
          address: candidate.address as ShippingAddress,
        });
      }
    } catch {
      issues.push('The named ship-from location configuration is invalid.');
    }
  } else {
    let address: ShippingAddress | null = null;
    try {
      // `||` as in scripts/shippo-verify.mjs: an empty SHIPPO_FROM_JSON is unset, not unparseable.
      address = JSON.parse(
        env.SHIPPO_FROM_JSON || env.SHIPPING_FROM_JSON || 'null',
      ) as ShippingAddress | null;
    } catch {
      /* reported below */
    }
    if (address)
      origins.push({
        id: 'primary',
        label: `${address.city || 'Primary'} location`,
        address,
      });
  }
  if (!origins.length)
    issues.push('Configure at least one active ship-from location.');
  if (new Set(origins.map((origin) => origin.id)).size !== origins.length)
    issues.push('Every ship-from location must have a unique ID.');
  for (const origin of origins) {
    if (addressError(origin.address)) {
      issues.push(`Complete the address for ${origin.label}.`);
      continue;
    }
    if (!simulated) {
      const phoneDigits = (origin.address.phone ?? '').replace(/\D/g, '');
      if (phoneDigits.length < 8 || phoneDigits.length > 15)
        issues.push(
          `Configure a valid sender phone number for ${origin.label}.`,
        );
      const email = origin.address.email ?? '';
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        issues.push(
          `Configure a valid sender email address for ${origin.label}.`,
        );
    }
  }
  return origins;
}

export function shippingConfiguration(requestedOriginId?: string) {
  const issues: string[] = [];
  const test = env.APP_ENV === 'staging' || env.APP_ENV === 'development';
  if (!test && env.APP_ENV !== 'production')
    issues.push('Shipping is disabled in this environment.');
  const simulated = env.SHIPPING_PROVIDER === 'simulated';
  if (simulated && (!test || env.SHIPPING_SIMULATION_ENABLED !== 'true'))
    issues.push(
      'Simulated shipping is allowed only in development or staging with explicit enablement.',
    );
  /** Postage bought straight from USPS, with no reseller in the record. */
  const direct = env.SHIPPING_PROVIDER === 'usps';
  /** Published flat rates, with no carrier credential to fail at checkout (lib/flat-shipping.ts). */
  const flat = env.SHIPPING_PROVIDER === 'flat';
  if (!simulated && !direct && !flat && env.SHIPPING_PROVIDER !== 'shippo')
    issues.push('Shipping provider is not configured.');
  const key = env.SHIPPO_API_KEY ?? '';
  if (
    !simulated &&
    !direct &&
    !flat &&
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
    !direct &&
    !flat &&
    (!accounts.length ||
      accounts.length > 10 ||
      accounts.some((v) => !/^[a-zA-Z0-9_-]{1,120}$/.test(v)))
  )
    issues.push(
      'Configure one or more approved USPS, UPS, or FedEx carrier account IDs.',
    );
  // Direct USPS replaces the reseller key and carrier accounts with our own
  // CRID, Mailer ID and Enterprise Payment System account.
  if (direct) issues.push(...uspsConfiguration().issues);
  if (flat) issues.push(...flatShippingIssues());
  const allowedServices = (env.SHIPPING_ALLOWED_SERVICES ?? '')
    .split(',')
    .map((service) => service.trim())
    .filter(Boolean);
  if (
    allowedServices.length > 40 ||
    allowedServices.some((service) => !/^[a-z0-9_]{1,80}$/.test(service))
  )
    issues.push('The approved shipping-service list is invalid.');
  const origins = configuredOrigins(simulated, issues);
  const origin = requestedOriginId
    ? origins.find((candidate) => candidate.id === requestedOriginId)
    : origins[0];
  if (requestedOriginId && !origin)
    issues.push('Choose an active ship-from location.');
  return {
    issues,
    test,
    simulated,
    direct,
    flat,
    accounts,
    allowedServices,
    origins,
    originId: origin?.id ?? null,
    originLabel: origin?.label ?? null,
    from: origin?.address ?? null,
    key,
  };
}

export function shippingOriginOptions() {
  return shippingConfiguration().origins.map(({ id, label }) => ({
    id,
    label,
  }));
}

/** Default operating origin for non-shipping providers such as tax calculation. */
export function configuredBusinessOrigin(): ShippingAddress | null {
  try {
    if (env.SHIPPO_ORIGINS_JSON) {
      const values = JSON.parse(env.SHIPPO_ORIGINS_JSON) as unknown;
      if (!Array.isArray(values)) return null;
      for (const value of values) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
        const candidate = value as Record<string, unknown>;
        if (candidate.active === false) continue;
        const address = candidate.address as ShippingAddress | undefined;
        if (address && !addressError(address)) return address;
      }
      return null;
    }
    const address = JSON.parse(
      env.SHIPPO_FROM_JSON || env.SHIPPING_FROM_JSON || 'null',
    ) as ShippingAddress | null;
    return address && !addressError(address) ? address : null;
  } catch {
    return null;
  }
}

/** No label-purchase endpoint is called. Customer PII and credentials are not logged. */
export async function quoteShipping(
  to: ShippingAddress,
  parcel: Parcel,
  policy: RatePolicy,
  originId?: string,
) {
  const configuration = shippingConfiguration(originId);
  const inputIssue = addressError(to) ?? parcelError(parcel);
  if (inputIssue || configuration.issues.length)
    return {
      ok: false as const,
      error: inputIssue ?? configuration.issues.join(' '),
    };
  if (configuration.flat) {
    // An origin is still required: it is what the parcel is sent from and what the label says.
    if (!configuration.originId || !configuration.originLabel)
      return { ok: false as const, error: 'Choose an active ship-from location.' };
    const rates = compareShippingRates(flatShippingRates(parcel.weight), policy);
    if (!rates.length) return { ok: false as const, error: 'No flat shipping rate matches this order.' };
    return {
      ok: true as const,
      rates,
      originId: configuration.originId,
      originLabel: configuration.originLabel,
      test: false,
      provider: 'flat' as const,
      warning: null,
      comparedCarriers: [...new Set(rates.map((rate) => rate.carrier))],
      quotedAt: new Date().toISOString(),
    };
  }
  if (configuration.simulated) {
    const pounds = Math.max(1, Math.ceil(parcel.weight));
    const rates = compareShippingRates(
      [
        {
          id: `sim-usps-ground-${pounds}`,
          shipmentId: `sim-shipment-${pounds}`,
          accountId: 'sim-usps',
          carrier: 'USPS',
          service: 'usps_ground_advantage',
          serviceName: 'Ground Advantage',
          cents: 900 + pounds * 60,
          currency: 'USD',
          estimatedDays: 5,
          test: true,
        },
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
      {
        ...policy,
        services: configuration.allowedServices.length
          ? policy.services.length
            ? policy.services.filter((service) =>
                configuration.allowedServices.includes(service),
              )
            : configuration.allowedServices
          : policy.services,
      },
    );
    return {
      ok: true as const,
      rates,
      originId: configuration.originId!,
      originLabel: configuration.originLabel!,
      test: true,
      provider: 'simulated' as const,
      warning:
        'Synthetic staging rates. Connect approved USPS, UPS and FedEx accounts before launch.',
      comparedCarriers: [...new Set(rates.map((rate) => rate.carrier))],
      quotedAt: new Date().toISOString(),
    };
  }
  if (configuration.direct) {
    const quoted = await uspsQuote(configuration.from!, to, parcel);
    if (!quoted.ok) return quoted;
    const rates = compareShippingRates(quoted.rates, {
      ...policy,
      services: configuration.allowedServices.length
        ? policy.services.length
          ? policy.services.filter((service) =>
              configuration.allowedServices.includes(service),
            )
          : configuration.allowedServices
        : policy.services,
    });
    if (!rates.length)
      return {
        ok: false as const,
        error:
          'USPS priced this parcel but no service met the approved service and delivery-time policy.',
      };
    return {
      ok: true as const,
      rates,
      originId: configuration.originId!,
      originLabel: configuration.originLabel!,
      test: quoted.test,
      provider: 'usps' as const,
      warning: quoted.warning,
      comparedCarriers: ['USPS'],
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
      {
        ...policy,
        services: configuration.allowedServices.length
          ? policy.services.length
            ? policy.services.filter((service) =>
                configuration.allowedServices.includes(service),
              )
            : configuration.allowedServices
          : policy.services,
      },
    );
    if (!rates.length)
      return {
        ok: false as const,
        error:
          // Carrier-neutral: checkout shows this, and SHIPPING_ALLOWED_SERVICES decides which carriers apply.
          'No eligible rate was returned from the configured carrier accounts. Check the accounts, package details, and service requirements.',
      };
    return {
      ok: true as const,
      rates,
      originId: configuration.originId!,
      originLabel: configuration.originLabel!,
      test: configuration.test,
      provider: 'shippo' as const,
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

export function safeLabelUrl(value: unknown): string | null {
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
  context?: {
    /** Required for direct USPS: the full consignee address is restated on the label. */
    to?: ShippingAddress;
    /** The durable label-claim row id, reused as the USPS idempotency key. */
    labelId?: string;
    originId?: string;
    institution?: string | null;
  },
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
      postageCents: null,
      warnings: [] as string[],
      test: true,
    };
  }
  if (configuration.direct) {
    const to = context?.to;
    const labelId = context?.labelId;
    if (!to || !labelId)
      return {
        ok: false as const,
        uncertain: false,
        error:
          'A USPS label needs the destination address and a durable label claim. No postage was bought.',
      };
    const origin = shippingConfiguration(context?.originId);
    if (origin.issues.length || !origin.from)
      return {
        ok: false as const,
        uncertain: false,
        error:
          origin.issues.join(' ') || 'No ship-from location is configured.',
      };
    const bought = await uspsPurchaseLabel(
      rateId,
      origin.from,
      to,
      labelId,
      context?.institution ?? null,
    );
    if (!bought.ok)
      return {
        ok: false as const,
        uncertain: bought.uncertain,
        error: bought.error,
      };
    return {
      ok: true as const,
      // USPS has no transaction object; the tracking number is the handle for
      // reprinting, cancelling and refunding the same label.
      transactionId: bought.trackingNumber,
      trackingNumber: bought.trackingNumber,
      labelUrl: bought.labelUrl,
      // USPS reprices at label time, so this is the figure EPS is charged.
      postageCents: bought.postageCents,
      warnings: bought.warnings,
      test: bought.test,
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
      // Shippo bills the rate it sold; there is no separate carrier reprice.
      postageCents: null,
      warnings: [] as string[],
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

type RefundResult =
  | {
      ok: true;
      status: 'success' | 'pending';
      refundId: string;
      test: boolean;
    }
  | {
      ok: false;
      uncertain: boolean;
      refundId?: string;
      error: string;
    };

function providerIdentifier(value: unknown): string | null {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,120}$/.test(value)
    ? value
    : null;
}

function normalizeRefund(
  value: unknown,
  configuration: ReturnType<typeof shippingConfiguration>,
  transactionId: string,
): RefundResult {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return {
      ok: false,
      uncertain: true,
      error: 'Carrier refund response was invalid. Reconcile it in Shippo.',
    };
  const refund = value as Record<string, unknown>;
  const refundId = providerIdentifier(refund.object_id);
  if (
    !refundId ||
    refund.transaction !== transactionId ||
    refund.test !== configuration.test
  )
    return {
      ok: false,
      uncertain: true,
      error:
        'Carrier refund identity could not be confirmed. Reconcile it in Shippo.',
    };
  if (refund.status === 'SUCCESS')
    return {
      ok: true,
      status: 'success',
      refundId,
      test: configuration.test,
    };
  if (refund.status === 'PENDING' || refund.status === 'QUEUED')
    return {
      ok: true,
      status: 'pending',
      refundId,
      test: configuration.test,
    };
  return {
    ok: false,
    uncertain: false,
    refundId,
    error:
      'Shippo did not accept the label refund. Review the carrier response.',
  };
}

/** Creates one Shippo refund request for a purchased but unused label. */
export async function requestShippingLabelRefund(
  transactionId: string,
): Promise<RefundResult> {
  const configuration = shippingConfiguration();
  if (configuration.issues.length)
    return {
      ok: false,
      uncertain: false,
      error: configuration.issues.join(' '),
    };
  if (!providerIdentifier(transactionId))
    return {
      ok: false,
      uncertain: false,
      error: 'The carrier transaction reference is invalid.',
    };
  if (configuration.simulated)
    return {
      ok: true,
      status: 'success',
      refundId: `sim-refund-${transactionId.slice(-24)}`,
      test: true,
    };
  if (configuration.direct) {
    const cancelled = await uspsCancelLabel(transactionId);
    return cancelled.ok
      ? {
          ok: true,
          status: cancelled.status,
          refundId: cancelled.reference,
          test: configuration.test,
        }
      : {
          ok: false,
          uncertain: cancelled.uncertain,
          error: cancelled.error,
        };
  }
  try {
    const response = await fetch('https://api.goshippo.com/refunds/', {
      method: 'POST',
      signal: AbortSignal.timeout(20_000),
      headers: {
        Authorization: `ShippoToken ${configuration.key}`,
        'Content-Type': 'application/json',
        'SHIPPO-API-VERSION': '2018-02-08',
      },
      body: JSON.stringify({ transaction: transactionId, async: false }),
    });
    if (!response.ok)
      return {
        ok: false,
        uncertain: response.status >= 500,
        error: `Carrier refund request returned ${response.status}. Reconcile the transaction in Shippo before another action.`,
      };
    return normalizeRefund(
      await boundedJson(response),
      configuration,
      transactionId,
    );
  } catch {
    return {
      ok: false,
      uncertain: true,
      error:
        'Carrier refund outcome is uncertain. Do not retry; reconcile it in Shippo.',
    };
  }
}

/** Reads the existing refund; this never creates another provider request. */
export async function reconcileShippingLabelRefund(
  transactionId: string,
  refundId?: string | null,
): Promise<RefundResult> {
  const configuration = shippingConfiguration();
  if (configuration.issues.length)
    return {
      ok: false,
      uncertain: false,
      error: configuration.issues.join(' '),
    };
  if (
    !providerIdentifier(transactionId) ||
    (refundId !== undefined && refundId !== null && !providerIdentifier(refundId))
  )
    return {
      ok: false,
      uncertain: false,
      error: 'The carrier refund reference is invalid.',
    };
  if (configuration.simulated)
    return {
      ok: true,
      status: 'success',
      refundId: refundId ?? `sim-refund-${transactionId.slice(-24)}`,
      test: true,
    };
  if (configuration.direct)
    // USPS exposes no read endpoint for a refund dispute. Reporting it as
    // unresolved keeps a disputed label out of the shipped path instead of
    // inventing a settlement we cannot see.
    return {
      ok: false,
      uncertain: true,
      ...(refundId ? { refundId } : {}),
      error:
        'USPS refund status cannot be read from here. Check the dispute in the USPS Business Customer Gateway and record the outcome by hand.',
    };
  try {
    const response = await fetch(
      refundId
        ? `https://api.goshippo.com/refunds/${encodeURIComponent(refundId)}`
        : 'https://api.goshippo.com/refunds/?results=100',
      {
        signal: AbortSignal.timeout(15_000),
        headers: {
          Authorization: `ShippoToken ${configuration.key}`,
          'SHIPPO-API-VERSION': '2018-02-08',
        },
      },
    );
    if (!response.ok)
      return {
        ok: false,
        uncertain: response.status >= 500,
        ...(refundId ? { refundId } : {}),
        error: `Carrier refund status returned ${response.status}. Check Shippo before another action.`,
      };
    const payload = await boundedJson(response);
    if (refundId)
      return normalizeRefund(payload, configuration, transactionId);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload))
      return {
        ok: false,
        uncertain: true,
        error: 'Carrier refund list was invalid. Check Shippo.',
      };
    const results = (payload as Record<string, unknown>).results;
    if (!Array.isArray(results))
      return {
        ok: false,
        uncertain: true,
        error: 'Carrier refund list was invalid. Check Shippo.',
      };
    const matches = results.filter(
      (value) =>
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        (value as Record<string, unknown>).transaction === transactionId,
    );
    if (matches.length !== 1)
      return {
        ok: false,
        uncertain: matches.length > 1,
        error:
          matches.length > 1
            ? 'More than one carrier refund matched this transaction. Review it in Shippo.'
            : 'No existing carrier refund was found. Do not submit another request until Shippo is reviewed.',
      };
    return normalizeRefund(matches[0], configuration, transactionId);
  } catch {
    return {
      ok: false,
      uncertain: true,
      ...(refundId ? { refundId } : {}),
      error: 'Carrier refund status could not be confirmed. Check Shippo.',
    };
  }
}

/** The name recorded on a quote or a label, so a stored row says which rail priced it. */
export function shippingProviderName(): 'simulated' | 'usps' | 'shippo' | 'flat' {
  const configuration = shippingConfiguration();
  if (configuration.simulated) return 'simulated';
  if (configuration.flat) return 'flat';
  if (configuration.direct) return 'usps';
  return 'shippo';
}
