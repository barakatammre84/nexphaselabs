import type { ShipTo } from '@/lib/orders';

export type CheckoutDetails = { contactEmail: string; shipTo: ShipTo };
export function validateCheckout(
  form: FormData,
): { ok: true; details: CheckoutDetails } | { ok: false; error: string } {
  const value = (name: string, max = 160) =>
    String(form.get(name) ?? '')
      .trim()
      .slice(0, max);
  const contactEmail = value('email', 254).toLowerCase();
  if (!/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(contactEmail))
    return {
      ok: false,
      error: 'Enter an email address for your order updates.',
    };
  const shipTo: ShipTo = {
    consigneeName: value('name'),
    consigneeInstitution: value('company') || null,
    line1: value('line1'),
    line2: value('line2') || null,
    city: value('city'),
    region: value('region', 80),
    postalCode: value('postalCode', 24),
    country: value('country', 2).toUpperCase(),
    phone: value('phone', 40) || null,
  };
  if (
    !shipTo.consigneeName ||
    !shipTo.line1 ||
    !shipTo.city ||
    !shipTo.region ||
    !shipTo.postalCode
  )
    return {
      ok: false,
      error: 'Complete the recipient name and delivery address.',
    };
  if (shipTo.country !== 'US')
    return {
      ok: false,
      error: 'Shipping is currently available within the United States.',
    };
  if (Object.values(shipTo).some((v) => v && [...v].some(character => character.charCodeAt(0) < 32)))
    return {
      ok: false,
      error:
        'Remove line breaks or control characters from the delivery fields.',
    };
  return { ok: true, details: { contactEmail, shipTo } };
}
