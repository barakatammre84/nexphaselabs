import { env } from 'cloudflare:workers';

/** Stable Analytics Engine schema; change the index when column meanings change. */
export const COMMERCE_EVENT_NAMES = [
  'cart_item_added',
  'cart_quantity_updated',
  'cart_item_removed',
  'order_submitted',
  'newsletter_request_accepted',
  'newsletter_confirmed',
  'newsletter_unsubscribed',
] as const;

export type CommerceEventName = (typeof COMMERCE_EVENT_NAMES)[number];
type CommerceEventSource = 'storefront' | 'sign_up' | 'account' | 'footer';
type CommerceEventFields = { quantity?: number; source?: CommerceEventSource };

const SOURCES: readonly string[] = ['storefront', 'sign_up', 'account', 'footer'];
let warned = false;

function warnUnavailable(): void {
  if (warned) return;
  warned = true;
  // Never log the provider error or caller fields: they may contain customer data.
  console.warn('[commerce-analytics] Event collection unavailable; commerce is unaffected.');
}

/**
 * Best-effort anonymous operation counts, NOT a financial ledger or a customer funnel.
 * Call only after a successful state change, never on a retry/no-op/duplicate result.
 *
 * Analytics Engine writes are non-blocking and managed by the Workers runtime. There
 * is no network request, public ingestion endpoint, browser tracker, or D1 fallback.
 * Extra fields are deliberately ignored; only these fixed columns leave the app.
 */
export function recordCommerceEvent(
  name: CommerceEventName,
  fields: CommerceEventFields = {},
): void {
  try {
    if (env.COMMERCE_ANALYTICS_ENABLED !== 'true') return;
    if (!(COMMERCE_EVENT_NAMES as readonly string[]).includes(name)) return;
    const source = fields.source ?? 'storefront';
    const quantity = fields.quantity ?? 0;
    if (!SOURCES.includes(source) || !Number.isSafeInteger(quantity) || quantity < 0) return;
    if (!env.COMMERCE_EVENTS) {
      warnUnavailable();
      return;
    }
    const result = env.COMMERCE_EVENTS.writeDataPoint({
      indexes: ['commerce_v1'],
      blobs: [name, source],
      doubles: [1, quantity],
    });
    // The production API returns void; also contain unexpected thenable rejections.
    void Promise.resolve(result).catch(warnUnavailable);
  } catch {
    warnUnavailable();
  }
}