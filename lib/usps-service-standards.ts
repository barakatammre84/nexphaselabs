import { env } from 'cloudflare:workers';
import { boundedJson } from '@/lib/provider-response';

/**
 * USPS Service Standards 3.0 — how many days USPS says a parcel should take.
 *
 * This exists because the price search does not answer the question. Measured
 * against the live API on 15 September 2026, every rate came back with no
 * commitment object at all, which left the storefront showing per-class numbers
 * this codebase had invented. Those were a reasonable guess and completely
 * unsourced, and a delivery estimate shown to a customer should not be a guess
 * dressed as a carrier promise.
 *
 * The API is already granted — it needs no USPS Ship enrolment and no payment
 * account — so this is sourced data available today.
 *
 * Failure is never allowed to break a quote. Every path returns null and the
 * caller keeps its own conservative default, because a shipping option with a
 * slightly pessimistic estimate is worth far more than no shipping option.
 */

type Cached = { days: number | null; expiresAt: number };
const cache = new Map<string, Cached>();
const CACHE_TTL_MS = 60 * 60_000;
/** Service standards are a function of geography, not of this order. */
const MAX_CACHE_ENTRIES = 500;

export function serviceStandardCacheKey(
  host: string,
  originZIPCode: string,
  destinationZIPCode: string,
  mailClass: string,
  day: string,
): string {
  return `${host}|${originZIPCode}|${destinationZIPCode}|${mailClass}|${day}`;
}

/** USPS states the standard as a string of days: "4". Anything else is refused. */
export function parseServiceStandard(value: unknown): number | null {
  const raw =
    typeof value === 'string'
      ? value.trim()
      : typeof value === 'number'
        ? String(value)
        : '';
  if (!/^\d{1,2}$/.test(raw)) return null;
  const days = Number(raw);
  return Number.isInteger(days) && days >= 1 && days <= 30 ? days : null;
}

export function serviceStandardFromPayload(
  payload: unknown,
  mailClass: string,
): number | null {
  const entries = Array.isArray(payload) ? payload : [];
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    // A standard for a class we did not ask about must not be applied to ours.
    if (typeof record.mailClass === 'string' && record.mailClass !== mailClass)
      continue;
    const days = parseServiceStandard(record.serviceStandard);
    if (days !== null) return days;
  }
  return null;
}

/**
 * Days USPS expects this lane to take, or null when it will not say.
 * `bearer` is reused from the caller's price search rather than fetched again.
 */
export async function uspsServiceStandardDays(
  host: string,
  bearer: string,
  originZIPCode: string,
  destinationZIPCode: string,
  mailClass: string,
  now = new Date(),
): Promise<number | null> {
  const key = serviceStandardCacheKey(
    host,
    originZIPCode,
    destinationZIPCode,
    mailClass,
    now.toISOString().slice(0, 10),
  );
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now.getTime()) return hit.days;

  let days: number | null = null;
  try {
    const url = new URL(`${host}/service-standards/v3/estimates`);
    url.searchParams.set('originZIPCode', originZIPCode);
    url.searchParams.set('destinationZIPCode', destinationZIPCode);
    url.searchParams.set('mailClass', mailClass);
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      headers: { Authorization: `Bearer ${bearer}`, Accept: 'application/json' },
    });
    if (response.ok)
      days = serviceStandardFromPayload(
        await boundedJson(response, 128 * 1024),
        mailClass,
      );
  } catch {
    days = null;
  }

  // A negative answer is cached too: USPS declining to commit on a lane is a
  // stable fact for the day, and re-asking on every quote wastes the quota.
  if (cache.size >= MAX_CACHE_ENTRIES) cache.clear();
  cache.set(key, { days, expiresAt: now.getTime() + CACHE_TTL_MS });
  return days;
}

/** Test seam: a module-level cache would otherwise leak between test cases. */
export function clearServiceStandardCache(): void {
  cache.clear();
}

/** Off unless explicitly enabled, so the extra call is a deliberate choice. */
export function serviceStandardsEnabled(): boolean {
  return env.USPS_SERVICE_STANDARDS !== 'false';
}
