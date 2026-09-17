import { env } from 'cloudflare:workers';
import type { ShippingRate } from '@/lib/shipping-rates';

/**
 * Published flat-rate shipping (owner, 17 Sep 2026).
 *
 * The carrier APIs are a dependency the storefront does not actually need on day one. Labels are
 * bought by hand at the counter or on the carrier's own site, so live rating only decides what to
 * charge the customer, and a published flat rate decides that just as well without a credential.
 *
 * It exists because ordering was closed in production for want of one USPS secret. A rate table
 * nobody has to authenticate against cannot fail at checkout, which is worth more than a rate
 * quoted to the cent.
 *
 * Configured as SHIPPING_FLAT_RATES_JSON, alongside the origin and parcel JSON already used:
 *   [{"service":"standard","name":"Standard (2-5 business days)","cents":1200,"days":5},
 *    {"service":"expedited","name":"Expedited (1-2 business days)","cents":3500,"days":2}]
 */
export type FlatRate = { service: string; name: string; cents: number; days: number };

const SERVICE = /^[a-z0-9_]{2,40}$/;

export function parseFlatRates(raw: string | undefined): { rates: FlatRate[]; issues: string[] } {
  const issues: string[] = [];
  const text = (raw ?? '').trim();
  if (!text) return { rates: [], issues: ['Configure the flat shipping rates (SHIPPING_FLAT_RATES_JSON).'] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { rates: [], issues: ['SHIPPING_FLAT_RATES_JSON is not valid JSON.'] };
  }
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > 6)
    return { rates: [], issues: ['SHIPPING_FLAT_RATES_JSON must list between one and six rates.'] };

  const rates: FlatRate[] = [];
  const seen = new Set<string>();
  for (const entry of parsed) {
    const row = entry as Record<string, unknown>;
    const service = String(row.service ?? '').trim().toLowerCase();
    const name = String(row.name ?? '').trim().slice(0, 80);
    const cents = Number(row.cents);
    const days = Number(row.days);
    if (!SERVICE.test(service) || seen.has(service)) {
      issues.push(`Flat rate "${service || '(unnamed)'}" needs a unique lowercase service code.`);
      continue;
    }
    if (!name) {
      issues.push(`Flat rate "${service}" needs a name to show the customer.`);
      continue;
    }
    // Zero is allowed: a supplier may choose to carry delivery on every order.
    if (!Number.isInteger(cents) || cents < 0 || cents > 100_000) {
      issues.push(`Flat rate "${service}" needs a whole amount in cents between 0 and 100000.`);
      continue;
    }
    // Required, not optional. Checkout asks for rates with maxEstimatedDays set, and
    // compareShippingRates drops any rate with no estimate when a maximum is given — so a table
    // written without transit times would vanish at checkout and close the shop, which is the
    // exact failure this module exists to prevent.
    if (!Number.isInteger(days) || days < 1 || days > 30) {
      issues.push(`Flat rate "${service}" needs a transit estimate between 1 and 30 days.`);
      continue;
    }
    seen.add(service);
    rates.push({ service, name, cents, days });
  }
  if (!rates.length && !issues.length) issues.push('Configure at least one flat shipping rate.');
  // Cheapest first, so the free-shipping rule and the checkout default agree on which one leads.
  rates.sort((a, b) => a.cents - b.cents || a.service.localeCompare(b.service));
  return { rates, issues };
}

export function flatShippingIssues(): string[] {
  return parseFlatRates(env.SHIPPING_FLAT_RATES_JSON).issues;
}

/**
 * The rate table as quotes. `shipmentId` and `id` are derived from the parcel and the service so
 * that re-quoting an unchanged cart is stable, and so a quote cannot be confused with a carrier's.
 */
export function flatShippingRates(parcelWeight: number): ShippingRate[] {
  const { rates } = parseFlatRates(env.SHIPPING_FLAT_RATES_JSON);
  const pounds = Math.max(1, Math.ceil(parcelWeight));
  return rates.map((rate) => ({
    id: `flat-${rate.service}-${pounds}`,
    shipmentId: `flat-shipment-${pounds}`,
    accountId: 'flat',
    carrier: 'USPS' as const,
    service: rate.service,
    serviceName: rate.name,
    cents: rate.cents,
    currency: 'USD' as const,
    estimatedDays: rate.days,
    test: false,
  }));
}
