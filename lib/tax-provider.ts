import { env } from 'cloudflare:workers';
import { boundedJson } from '@/lib/provider-response';
import { addressError, type ShippingAddress } from '@/lib/shipping-provider';

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
  | { ok: false; error: string };

function configuredOrigin(): ShippingAddress | null {
  try {
    const value = JSON.parse(
      env.SHIPPING_FROM_JSON ?? 'null',
    ) as ShippingAddress | null;
    return value && !addressError(value) ? value : null;
  } catch {
    return null;
  }
}

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
  if (env.TAX_PROVIDER !== 'taxjar')
    return { ok: false, error: 'Tax calculation is not configured.' };
  const key = env.TAXJAR_API_KEY ?? '';
  if (!/^[A-Za-z0-9_-]{20,200}$/.test(key))
    return { ok: false, error: 'A TaxJar API key is required.' };
  const sandbox = env.TAXJAR_SANDBOX === 'true';
  if (!testEnvironment && sandbox)
    return { ok: false, error: 'The TaxJar sandbox is refused in production.' };
  const from = configuredOrigin();
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
