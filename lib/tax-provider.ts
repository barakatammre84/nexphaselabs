import { env } from 'cloudflare:workers';
import { boundedJson } from '@/lib/provider-response';
import {
  addressError,
  configuredBusinessOrigin,
  type ShippingAddress,
} from '@/lib/shipping-provider';

export type TaxLine = {
  id: string;
  sku: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
};

export type TaxQuoteInput = {
  to: ShippingAddress;
  subtotalCents: number;
  shippingCents: number;
  lines: TaxLine[];
};

type TaxConfiguration =
  | { ok: true; provider: 'simulated'; rateBps: number; test: true }
  | {
      ok: true;
      provider: 'taxjar';
      key: string;
      url: string;
      test: boolean;
      from: ShippingAddress;
    }
  | {
      ok: true;
      provider: 'cdtfa';
      from: ShippingAddress;
      districtRate: 'destination' | 'statewide';
      taxShipping: boolean;
      test: boolean;
    }
  | { ok: false; error: string };

export function taxConfiguration(): TaxConfiguration {
  const testEnvironment =
    env.APP_ENV === 'staging' || env.APP_ENV === 'development';
  if (env.TAX_PROVIDER === 'simulated') {
    const rateBps = Number(env.TAX_SIMULATED_RATE_BPS);
    if (!testEnvironment)
      return {
        ok: false,
        error: 'Simulated tax is refused outside development and staging.',
      };
    if (!Number.isInteger(rateBps) || rateBps < 0 || rateBps > 2_000)
      return {
        ok: false,
        error: 'Configure a simulated tax rate from 0 to 2,000 basis points.',
      };
    return { ok: true, provider: 'simulated', rateBps, test: true };
  }
  if (env.TAX_PROVIDER === 'cdtfa') {
    const from = configuredBusinessOrigin();
    if (!from)
      return { ok: false, error: 'Configure a complete tax origin address.' };
    if (from.state !== 'CA')
      return {
        ok: false,
        error: 'The CDTFA provider requires a California tax origin.',
      };
    return {
      ok: true,
      provider: 'cdtfa',
      from,
      districtRate:
        env.CDTFA_DISTRICT_RATE === 'statewide' ? 'statewide' : 'destination',
      taxShipping: env.CDTFA_TAX_SHIPPING === 'true',
      test: testEnvironment,
    };
  }
  if (env.TAX_PROVIDER !== 'taxjar')
    return { ok: false, error: 'Tax calculation is not configured.' };
  const key = env.TAXJAR_API_KEY ?? '';
  if (!/^[A-Za-z0-9_-]{20,200}$/.test(key))
    return { ok: false, error: 'A TaxJar API key is required.' };
  const sandbox = env.TAXJAR_SANDBOX === 'true';
  if (!testEnvironment && sandbox)
    return { ok: false, error: 'The TaxJar sandbox is refused in production.' };
  const from = configuredBusinessOrigin();
  if (!from)
    return { ok: false, error: 'Configure a complete tax origin address.' };
  return {
    ok: true,
    provider: 'taxjar',
    key,
    test: sandbox,
    url: sandbox
      ? 'https://api.sandbox.taxjar.com/v2/taxes'
      : 'https://api.taxjar.com/v2/taxes',
    from,
  };
}

/**
 * California's own rate service. Free, public, no key. Covers California only:
 * a destination in any other state gets no tax here, because the business has
 * no nexus there. Registering in a second state means replacing this provider,
 * not extending it.
 */
const CDTFA_RATE_URL =
  'https://services.maps.cdtfa.ca.gov/api/taxrate/GetRateByAddress';
/** Statewide floor. Every California address is at least this. */
const CALIFORNIA_BASE_RATE = 0.0725;
/** Nothing in California is near this. A higher answer means a broken response. */
const CALIFORNIA_MAXIMUM_RATE = 0.115;

type CdtfaRate =
  | { ok: true; rate: number; jurisdiction: string; tac: string | null }
  /**
   * CDTFA could not place the address on the map. Distinct from a service
   * failure because it is not transient and will never succeed on retry —
   * most often a PO Box, which CDTFA rejects outright ("Invalid value: 'PO
   * Box'"). A California customer using a PO Box is an ordinary customer, so
   * this must not be treated as an error that blocks checkout.
   */
  | { ok: false; geocodeFailed: true }
  | { ok: false; geocodeFailed?: false; error: string };

async function cdtfaRate(to: ShippingAddress): Promise<CdtfaRate> {
  const query = new URLSearchParams({
    address: to.street1,
    city: to.city,
    zip: to.zip.slice(0, 5),
  });
  try {
    const response = await fetch(`${CDTFA_RATE_URL}?${query.toString()}`, {
      signal: AbortSignal.timeout(12_000),
      headers: { Accept: 'application/json' },
    });
    if (response.status === 400) {
      // A 400 carries a field-level complaint. An address or city CDTFA cannot
      // parse is a permanent condition for this address, not an outage.
      const body = await response.text().catch(() => '');
      if (/\"field\"\s*:\s*\"(Address|City)\"/i.test(body))
        return { ok: false, geocodeFailed: true };
      return {
        ok: false,
        error:
          'The California tax rate service rejected that address. Check the address before submitting the order.',
      };
    }
    if (!response.ok)
      return {
        ok: false,
        error: `The California tax rate service returned ${response.status}. The order was not submitted.`,
      };
    const payload = await boundedJson(response);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload))
      return {
        ok: false,
        error:
          'The California tax rate service returned an unreadable response. The order was not submitted.',
      };
    const info = (payload as { taxRateInfo?: unknown }).taxRateInfo;
    /**
     * Deliberately NOT treated as un-geocodable. A 200 with no rate is an
     * unexplained answer, and quietly charging the statewide floor on an
     * unexplained answer is how a business under-collects without noticing.
     * Only CDTFA explicitly rejecting the address earns the fallback.
     */
    if (!Array.isArray(info) || info.length === 0)
      return {
        ok: false,
        error:
          'No California tax rate was found for that address. Check the address before submitting the order.',
      };
    const first = info[0] as Record<string, unknown>;
    const rate = typeof first.rate === 'number' ? first.rate : Number.NaN;
    if (
      !Number.isFinite(rate) ||
      rate < CALIFORNIA_BASE_RATE ||
      rate > CALIFORNIA_MAXIMUM_RATE
    )
      return {
        ok: false,
        error:
          'The California tax rate service returned an implausible rate. The order was not submitted.',
      };
    return {
      ok: true,
      rate,
      jurisdiction:
        typeof first.jurisdiction === 'string'
          ? first.jurisdiction.slice(0, 120)
          : 'UNKNOWN',
      tac: typeof first.tac === 'string' ? first.tac.slice(0, 40) : null,
    };
  } catch {
    return {
      ok: false,
      error:
        'The California tax rate could not be confirmed. Try again before submitting the order.',
    };
  }
}

function dollars(cents: number): number {
  return Number((cents / 100).toFixed(2));
}

function taxCents(payload: unknown, maximumCents: number): number | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    return null;
  const tax = (payload as { tax?: unknown }).tax;
  if (!tax || typeof tax !== 'object' || Array.isArray(tax)) return null;
  const raw = (tax as { amount_to_collect?: unknown }).amount_to_collect;
  const value =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string' && /^\d+(?:\.\d{1,2})?$/.test(raw)
        ? Number(raw)
        : NaN;
  const cents = Math.round(value * 100);
  return Number.isSafeInteger(cents) && cents >= 0 && cents <= maximumCents
    ? cents
    : null;
}

/** Calculate only. Recording the final transaction happens after real payment settlement. */
export async function quoteTax(input: TaxQuoteInput) {
  const configuration = taxConfiguration();
  if (!configuration.ok) return configuration;
  if (
    addressError(input.to) ||
    !Number.isInteger(input.subtotalCents) ||
    input.subtotalCents < 0 ||
    !Number.isInteger(input.shippingCents) ||
    input.shippingCents < 0 ||
    input.lines.length === 0
  )
    return {
      ok: false as const,
      error: 'Tax could not be calculated for this order.',
    };
  if (configuration.provider === 'simulated') {
    return {
      ok: true as const,
      cents: Math.round(
        ((input.subtotalCents + input.shippingCents) * configuration.rateBps) /
          10_000,
      ),
      provider: configuration.provider,
      test: true,
    };
  }
  if (configuration.provider === 'cdtfa') {
    // California treats separately stated actual delivery cost by common
    // carrier as non-taxable. CDTFA_TAX_SHIPPING=true reverses that.
    const taxableCents =
      input.subtotalCents +
      (configuration.taxShipping ? input.shippingCents : 0);
    if (input.to.state !== 'CA')
      return {
        ok: true as const,
        cents: 0,
        provider: configuration.provider,
        test: configuration.test,
        jurisdiction: null,
        ratePpm: 0,
        tac: null,
      };
    if (configuration.districtRate === 'statewide')
      return {
        ok: true as const,
        cents: Math.round(taxableCents * CALIFORNIA_BASE_RATE),
        provider: configuration.provider,
        test: configuration.test,
        jurisdiction: 'CALIFORNIA STATEWIDE BASE',
        ratePpm: Math.round(CALIFORNIA_BASE_RATE * 1_000_000),
        tac: null,
      };
    const rate = await cdtfaRate(input.to);
    /**
     * An address CDTFA will not geocode falls back to the statewide base rate
     * rather than refusing the sale. The jurisdiction says so on the order, so
     * the handful of affected orders are identifiable and correctable at filing
     * time — and a PO Box customer can still buy. Blocking checkout over a
     * district increment would be the worse error.
     */
    if (!rate.ok && rate.geocodeFailed)
      return {
        ok: true as const,
        cents: Math.round(taxableCents * CALIFORNIA_BASE_RATE),
        provider: configuration.provider,
        test: configuration.test,
        jurisdiction: 'CALIFORNIA STATEWIDE BASE (ADDRESS NOT GEOCODED)',
        ratePpm: Math.round(CALIFORNIA_BASE_RATE * 1_000_000),
        tac: null,
      };
    if (!rate.ok) return { ok: false as const, error: rate.error };
    return {
      ok: true as const,
      cents: Math.round(taxableCents * rate.rate),
      provider: configuration.provider,
      test: configuration.test,
      jurisdiction: rate.jurisdiction,
      ratePpm: Math.round(rate.rate * 1_000_000),
      tac: rate.tac,
    };
  }
  try {
    const response = await fetch(configuration.url, {
      method: 'POST',
      signal: AbortSignal.timeout(12_000),
      headers: {
        Authorization: `Bearer ${configuration.key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from_country: configuration.from.country,
        from_zip: configuration.from.zip,
        from_state: configuration.from.state,
        from_city: configuration.from.city,
        from_street: configuration.from.street1,
        to_country: input.to.country,
        to_zip: input.to.zip,
        to_state: input.to.state,
        to_city: input.to.city,
        to_street: input.to.street1,
        amount: dollars(input.subtotalCents),
        shipping: dollars(input.shippingCents),
        line_items: input.lines.map((line) => ({
          id: line.id,
          quantity: line.quantity,
          product_identifier: line.sku,
          description: line.description.slice(0, 255),
          unit_price: dollars(line.unitPriceCents),
        })),
      }),
    });
    if (!response.ok)
      return {
        ok: false as const,
        error: `Tax provider returned ${response.status}. The order was not submitted.`,
      };
    const payload = await boundedJson(response);
    const cents = taxCents(
      payload,
      Math.ceil((input.subtotalCents + input.shippingCents) * 0.3),
    );
    if (cents === null)
      return {
        ok: false as const,
        error:
          'Tax provider returned an invalid amount. The order was not submitted.',
      };
    return {
      ok: true as const,
      cents,
      provider: configuration.provider,
      test: configuration.test,
    };
  } catch {
    return {
      ok: false as const,
      error:
        'Tax could not be confirmed. Try again before submitting the order.',
    };
  }
}
