import { env } from 'cloudflare:workers';
import { and, eq, gt } from 'drizzle-orm';
import { getDb } from '@/db';
import { checkoutQuotes } from '@/db/commerce-schema';
import type { Cart } from '@/lib/cart';
import { evaluateCoupon } from '@/lib/coupons';
import type { ShipTo } from '@/lib/orders';
import {
  quoteShipping,
  shippingConfiguration,
  type ShippingAddress,
} from '@/lib/shipping-provider';
import { parcelError, type Parcel } from '@/lib/shipping-rates';
import { STOREFRONT_COPY } from '@/lib/storefront-copy';
import { quoteTax, taxConfiguration } from '@/lib/tax-provider';
import { freeShippingProgress, freeShippingThresholdCents } from '@/lib/free-shipping';

export const CHECKOUT_QUOTE_MINUTES = 30;

/**
 * Whether an order needs a current delivery and tax quote before it is accepted. Production
 * never takes an order without its shipping and tax, so there an unset switch means required;
 * only an explicit "false" turns it off. Other environments keep it opt-in.
 */
export function checkoutQuotesRequired(): boolean {
  if (env.CHECKOUT_QUOTES_REQUIRED === 'true') return true;
  if (env.CHECKOUT_QUOTES_REQUIRED === 'false') return false;
  return env.APP_ENV === 'production';
}

/**
 * Whether a buyer can check out at all. Where an order needs a quote, that takes working
 * shipping and tax settings. Until both are set up, checkout could only answer with setting
 * names meant for staff, so buyers are told ordering is not open and /manage/readiness lists
 * what is missing.
 */
export function onlineOrderingOpen(): boolean {
  if (!checkoutQuotesRequired()) return true;
  return shippingConfiguration().issues.length === 0 && taxConfiguration().ok;
}

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function fingerprint(value: unknown): Promise<string> {
  return hex(
    await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(JSON.stringify(value)),
    ),
  );
}

export async function cartFingerprint(cart: Cart): Promise<string> {
  return fingerprint(
    cart.lines
      .map((line) => ({
        item: line.itemId,
        sku: line.variant.sku,
        quantity: line.quantity,
        price: line.unitPriceCents,
      }))
      .sort((a, b) => a.item.localeCompare(b.item)),
  );
}

export async function addressFingerprint(
  shipTo: ShipTo,
  contactEmail: string | null,
): Promise<string> {
  return fingerprint({
    email: contactEmail?.trim().toLowerCase() ?? null,
    name: shipTo.consigneeName.trim(),
    institution: shipTo.consigneeInstitution?.trim() ?? null,
    line1: shipTo.line1.trim(),
    line2: shipTo.line2?.trim() ?? null,
    city: shipTo.city.trim(),
    region: shipTo.region.trim().toUpperCase(),
    postalCode: shipTo.postalCode.trim(),
    country: shipTo.country.trim().toUpperCase(),
    phone: shipTo.phone?.trim() ?? null,
  });
}

type DefaultParcel = Parcel & { baseWeight: number; perPackWeight: number };

export function checkoutParcelForPacks(
  packs: number,
): { ok: true; parcel: Parcel } | { ok: false; error: string } {
  let value: Partial<DefaultParcel> | null = null;
  try {
    value = JSON.parse(
      env.SHIPPING_DEFAULT_PARCEL_JSON ?? 'null',
    ) as Partial<DefaultParcel> | null;
  } catch {
    return {
      ok: false,
      error: 'The standard checkout parcel profile is invalid.',
    };
  }
  if (
    !value ||
    !Number.isFinite(value.baseWeight) ||
    !Number.isFinite(value.perPackWeight) ||
    value.baseWeight! <= 0 ||
    value.perPackWeight! < 0
  )
    return {
      ok: false,
      error:
        'Configure the standard packed dimensions and weight before quoting checkout.',
    };
  const parcel = {
    length: Number(value.length),
    width: Number(value.width),
    height: Number(value.height),
    weight: Number(
      (value.baseWeight! + packs * value.perPackWeight!).toFixed(3),
    ),
  };
  const problem = parcelError(parcel);
  return problem ? { ok: false, error: problem } : { ok: true, parcel };
}

export function checkoutParcel(
  cart: Cart,
): { ok: true; parcel: Parcel } | { ok: false; error: string } {
  return checkoutParcelForPacks(
    cart.lines.reduce((total, line) => total + line.quantity, 0),
  );
}

export function shippingAddress(shipTo: ShipTo): ShippingAddress {
  return {
    name: shipTo.consigneeName,
    street1: shipTo.line1,
    ...(shipTo.line2 ? { street2: shipTo.line2 } : {}),
    city: shipTo.city,
    state: shipTo.region.toUpperCase(),
    zip: shipTo.postalCode,
    country: shipTo.country,
    ...(shipTo.phone ? { phone: shipTo.phone } : {}),
    is_residential: !shipTo.consigneeInstitution,
  };
}

export type CheckoutQuoteView = {
  id: string;
  carrier: 'USPS' | 'UPS' | 'FedEx';
  serviceName: string;
  shippingCents: number;
  taxCents: number;
  /** Promo code priced into this quote, if any; tax is on the reduced subtotal. */
  couponCode: string | null;
  discountCents: number;
  totalCents: number;
  estimatedDays: number | null;
  expiresAt: string;
  test: boolean;
};

export async function createCheckoutQuotes(
  accountId: string,
  cart: Cart,
  shipTo: ShipTo,
  contactEmail: string | null,
  couponCode: string | null = null,
): Promise<
  | { ok: true; quotes: CheckoutQuoteView[]; warning: string | null }
  | { ok: false; error: string }
> {
  if (!onlineOrderingOpen()) {
    // The buyer is told ordering is not open; which settings are missing is for staff.
    const tax = taxConfiguration();
    console.warn(
      '[checkout-quote] online ordering is not open:',
      [...shippingConfiguration().issues, ...(tax.ok ? [] : [tax.error])].join(' '),
    );
    return { ok: false, error: STOREFRONT_COPY.orderingNotOpen };
  }
  if (!cart.orderable || cart.lines.length === 0)
    return {
      ok: false,
      error: 'Add available, priced materials before comparing delivery.',
    };
  const packed = checkoutParcel(cart);
  if (!packed.ok) return packed;
  // A promo code is priced in here so shipping tax and the total already reflect it.
  const coupon = couponCode ? await evaluateCoupon(couponCode, accountId, cart.subtotalCents) : null;
  if (coupon && !coupon.ok) return coupon;
  const discountCents = coupon?.ok ? coupon.discountCents : 0;
  // Free delivery (lib/free-shipping.ts): the cheapest eligible rate is offered at no charge
  // once the materials subtotal, after any promo code, reaches the staff-set threshold.
  const freeShipping = freeShippingProgress(cart.subtotalCents - discountCents, await freeShippingThresholdCents())?.qualifies ?? false;
  const to = shippingAddress(shipTo);
  const shipping = await quoteShipping(to, packed.parcel, {
    services: [],
    maxEstimatedDays: 10,
  });
  if (!shipping.ok) return shipping;
  const candidates = shipping.rates
    .slice(0, 4)
    .map((rate, index) => (freeShipping && index === 0 ? { ...rate, cents: 0 } : rate));
  const withTax = await Promise.all(
    candidates.map(async (rate) => ({
      rate,
      tax: await quoteTax({
        to,
        subtotalCents: cart.subtotalCents - discountCents,
        shippingCents: rate.cents,
        lines: cart.lines.map((line) => ({
          id: line.itemId,
          sku: line.variant.sku,
          description: `${line.product.name} ${line.variant.quantity}`,
          quantity: line.quantity,
          unitPriceCents: line.unitPriceCents!,
        })),
      }),
    })),
  );
  const taxFailure = withTax.find((item) => !item.tax.ok);
  if (taxFailure && !taxFailure.tax.ok) return taxFailure.tax;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CHECKOUT_QUOTE_MINUTES * 60_000);
  const [cartHash, addressHash] = await Promise.all([
    cartFingerprint(cart),
    addressFingerprint(shipTo, contactEmail),
  ]);
  const provider = shippingConfiguration().simulated ? 'simulated' : 'shippo';
  const rows = withTax.map(({ rate, tax }) => ({
    id: `cq_${crypto.randomUUID().replace(/-/g, '')}`,
    accountId,
    cartFingerprint: cartHash,
    addressFingerprint: addressHash,
    originId: shipping.originId,
    originLabel: shipping.originLabel,
    provider,
    shipmentId: rate.shipmentId,
    rateId: rate.id,
    carrier: rate.carrier,
    service: rate.service,
    serviceName: rate.serviceName,
    shippingCents: rate.cents,
    taxCents: tax.ok ? tax.cents : 0,
    couponCode: coupon?.ok ? coupon.coupon.code : null,
    discountCents,
    currency: 'USD',
    estimatedDays: rate.estimatedDays,
    test: shipping.test || (tax.ok && tax.test),
    expiresAt,
    createdAt: now,
  }));
  if (!rows.length)
    return {
      ok: false,
      // Carrier-neutral: which carriers and services are approved is configuration.
      error: 'No eligible delivery options were returned.',
    };
  await getDb().insert(checkoutQuotes).values(rows);
  return {
    ok: true,
    quotes: rows.map((row) => ({
      id: row.id,
      carrier: row.carrier,
      serviceName: row.serviceName,
      shippingCents: row.shippingCents,
      taxCents: row.taxCents,
      couponCode: row.couponCode,
      discountCents: row.discountCents,
      totalCents: cart.subtotalCents - row.discountCents + row.shippingCents + row.taxCents,
      estimatedDays: row.estimatedDays,
      expiresAt: row.expiresAt.toISOString(),
      test: row.test,
    })),
    warning: shipping.warning,
  };
}

export async function acceptedCheckoutQuote(
  id: string,
  accountId: string,
  cart: Cart,
  shipTo: ShipTo,
  contactEmail: string | null,
  now = new Date(),
) {
  if (!/^cq_[a-f0-9]{32}$/.test(id)) return null;
  const [row] = await getDb()
    .select()
    .from(checkoutQuotes)
    .where(
      and(
        eq(checkoutQuotes.id, id),
        eq(checkoutQuotes.accountId, accountId),
        gt(checkoutQuotes.expiresAt, now),
      ),
    )
    .limit(1);
  if (!row || row.currency !== 'USD') return null;
  const [cartHash, addressHash] = await Promise.all([
    cartFingerprint(cart),
    addressFingerprint(shipTo, contactEmail),
  ]);
  return row.cartFingerprint === cartHash &&
    row.addressFingerprint === addressHash
    ? row
    : null;
}
