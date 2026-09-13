/** Provider-independent comparison. Quoted postage, not a guaranteed final carrier invoice. */
export type ShippingRate = {
  id: string; shipmentId: string; accountId: string; carrier: 'USPS' | 'UPS' | 'FedEx';
  service: string; serviceName: string; cents: number; currency: 'USD';
  estimatedDays: number | null; test: boolean;
};
export type RatePolicy = { services: string[]; maxEstimatedDays: number | null };
export type Parcel = { length: number; width: number; height: number; weight: number };

export function parcelError(parcel: Parcel): string | null {
  if (Object.values(parcel).some(v => !Number.isFinite(v) || v <= 0)) return 'Enter positive packed dimensions and weight.';
  if ([parcel.length, parcel.width, parcel.height].some(v => v > 108) || parcel.weight > 150)
    return 'This parcel needs a separate oversized or freight review.';
  return null;
}

export function usdCents(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d{1,7}(?:\.\d{1,2})?$/.test(value)) return null;
  const [dollars, fraction = ''] = value.split('.');
  const cents = Number(dollars) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

const record = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const identifier = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,120}$/.test(v);

/** Reject unknown carriers, wrong accounts/mode/currency and malformed amounts. */
export function normalizeShippoRates(payload: unknown, accounts: string[], test: boolean): ShippingRate[] {
  const shipment = record(payload);
  if (!identifier(shipment.object_id) || shipment.test !== test || !Array.isArray(shipment.rates)) return [];
  const results = new Map<string, ShippingRate>();
  for (const raw of shipment.rates) {
    const rate = record(raw); const service = record(rate.servicelevel);
    const cents = usdCents(rate.amount);
    const carrier = rate.provider === 'USPS' ? 'USPS' : rate.provider === 'UPS' ? 'UPS' : rate.provider === 'FedEx' ? 'FedEx' : null;
    if (!carrier || cents === null || rate.currency !== 'USD' || rate.test !== test
      || !identifier(rate.object_id) || !identifier(rate.carrier_account) || !accounts.includes(rate.carrier_account)
      || !identifier(service.token) || typeof service.name !== 'string' || !service.name.trim()) continue;
    const estimatedDays = typeof rate.estimated_days === 'number' && Number.isInteger(rate.estimated_days) && rate.estimated_days >= 0
      ? rate.estimated_days : null;
    results.set(rate.object_id, { id: rate.object_id, shipmentId: shipment.object_id, accountId: rate.carrier_account,
      carrier, service: service.token, serviceName: service.name.slice(0, 120), cents, currency: 'USD', estimatedDays, test });
  }
  return [...results.values()];
}

export function compareShippingRates(rates: ShippingRate[], policy: RatePolicy): ShippingRate[] {
  if (policy.maxEstimatedDays !== null && (!Number.isInteger(policy.maxEstimatedDays) || policy.maxEstimatedDays < 1)) return [];
  return rates.filter(rate => (policy.services.length === 0 || policy.services.includes(rate.service))
    && (policy.maxEstimatedDays === null || (rate.estimatedDays !== null && rate.estimatedDays <= policy.maxEstimatedDays)))
    .sort((a, b) => a.cents - b.cents || (a.estimatedDays ?? Infinity) - (b.estimatedDays ?? Infinity) || a.id.localeCompare(b.id));
}
