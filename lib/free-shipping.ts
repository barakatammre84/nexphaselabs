import { readSettings, SHIPPING_SETTING_KEYS } from '@/lib/settings';

export { freeShippingLine, freeShippingProgress, type FreeShippingProgress } from '@/lib/free-shipping-rules';

/** The staff-set threshold in cents, or null when free shipping is off or the value is not a positive integer. */
export async function freeShippingThresholdCents(): Promise<number | null> {
  const raw = (await readSettings())[SHIPPING_SETTING_KEYS.freeShippingThresholdCents];
  if (!raw) return null;
  const cents = Number(raw);
  return Number.isInteger(cents) && cents > 0 ? cents : null;
}
