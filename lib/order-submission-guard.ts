import { sql } from 'drizzle-orm';
import {
  accounts,
  accountSessions,
  cartItems,
  lots,
  organizations,
  products,
  productVariants,
} from '@/db/schema';
import { openCheckoutEnabled } from '@/lib/site-config';
import { RUO_VERSION, TERMS_VERSION } from '@/lib/policy';
import type { AccountPrincipal } from '@/lib/account-auth';
import type { Cart } from '@/lib/cart';
import type { ShipTo } from '@/lib/orders';

/** Recheck the reviewed customer/cart/offer in the very statement accepting the order. */
export function orderSubmissionGuard(
  account: AccountPrincipal,
  organizationId: string | null,
  shipTo: ShipTo,
  cart: Cart,
  now: Date,
) {
  const open = openCheckoutEnabled() && organizationId === null;
  const customer = open
    ? sql`${accounts.status} IN ('active', 'guest')`
    : sql`${accounts.status} = 'active'
    AND ${accounts.tier} = 'institutional' AND ${accounts.verificationStatus} = 'approved'`;
  const priceColumn = open
    ? sql`CASE WHEN ${accounts.tier} = 'institutional' AND ${accounts.verificationStatus} = 'approved' THEN ${productVariants.institutionalPriceCents} ELSE ${productVariants.listPriceCents} END`
    : productVariants.institutionalPriceCents;
  /**
   * The same volume price the cart showed, re-derived here from the catalog's
   * own ladder in the accepting statement. A cart cannot present a discount the
   * catalog does not carry, and a ladder edited between review and submission
   * makes the order fail rather than bill at the stale price.
   *
   * The break column is JSON on the variant; json_each yields one row per entry
   * and the deepest threshold at or below the ordered quantity wins. Rows whose
   * price for this tier is null, or not below the tier price, are ignored —
   * exactly what effectiveUnitPrice() does in TypeScript.
   */
  const breakPrice = open
    ? sql`CASE WHEN ${accounts.tier} = 'institutional' AND ${accounts.verificationStatus} = 'approved'
        THEN json_extract(brk.value, '$.institutionalPriceCents') ELSE json_extract(brk.value, '$.listPriceCents') END`
    : sql`json_extract(brk.value, '$.institutionalPriceCents')`;
  const effectivePrice = sql`COALESCE((
      SELECT ${breakPrice} FROM json_each(COALESCE(${productVariants.priceBreaks}, '[]')) AS brk
      WHERE json_extract(brk.value, '$.minQuantity') <= ${cartItems.quantity}
        AND ${breakPrice} IS NOT NULL AND ${breakPrice} < ${priceColumn}
      ORDER BY json_extract(brk.value, '$.minQuantity') DESC LIMIT 1
    ), ${priceColumn})`;
  return sql`${accounts.id} = ${account.id} AND ${customer}
    AND ${accounts.email} = ${account.email} AND ${accounts.name} = ${account.name}
    AND ${open ? sql`1 = 1` : sql`${accounts.termsVersion} = ${TERMS_VERSION} AND ${accounts.ruoVersion} = ${RUO_VERSION}`}
    AND EXISTS (SELECT 1 FROM ${accountSessions} WHERE ${accountSessions.id} = ${account.sessionId}
      AND ${accountSessions.accountId} = ${account.id} AND ${accountSessions.revokedAt} IS NULL
      AND ${accountSessions.expiresAt} > ${Math.floor(now.getTime() / 1000)})
    AND ${
      open
        ? sql`1 = 1`
        : sql`EXISTS (SELECT 1 FROM ${organizations} WHERE ${organizations.id} = ${organizationId}
      AND ${organizations.accountId} = ${account.id} AND ${organizations.verificationStatus} = 'approved'
      AND ${organizations.legalName} IS ${shipTo.consigneeInstitution}
      AND COALESCE(NULLIF(${organizations.receivingParty}, ''), ${accounts.name}) = ${shipTo.consigneeName}
      AND ${organizations.addressLine1} = ${shipTo.line1} AND ${organizations.addressLine2} IS ${shipTo.line2}
      AND ${organizations.city} = ${shipTo.city} AND ${organizations.region} = ${shipTo.region}
      AND ${organizations.postalCode} = ${shipTo.postalCode} AND ${organizations.country} = ${shipTo.country}
      AND ${organizations.phone} IS ${shipTo.phone})`
    }
    AND (SELECT count(*) FROM ${cartItems} WHERE ${cartItems.accountId} = ${account.id}) = ${cart.lines.length}
    AND NOT EXISTS (SELECT 1 FROM json_each(${JSON.stringify(
      cart.lines.map((line) => ({
        itemId: line.itemId,
        quantity: line.quantity,
        variantId: line.variant.id,
        productId: line.product.id,
        code: line.product.code,
        name: line.product.name,
        price: line.unitPriceCents,
        packSize: line.variant.quantity,
        sku: line.variant.sku,
        presentation: line.variant.presentation,
      })),
    )}) AS expected WHERE NOT EXISTS (SELECT 1 FROM ${cartItems}
      INNER JOIN ${productVariants} ON ${productVariants.id} = ${cartItems.variantId}
      INNER JOIN ${products} ON ${products.id} = ${productVariants.productId}
      WHERE ${cartItems.id} = json_extract(expected.value, '$.itemId') AND ${cartItems.accountId} = ${account.id}
        AND ${cartItems.quantity} = json_extract(expected.value, '$.quantity')
        AND ${productVariants.id} = json_extract(expected.value, '$.variantId')
        AND ${products.id} = json_extract(expected.value, '$.productId') AND ${products.visibility} = 'published'
        AND ${products.code} = json_extract(expected.value, '$.code') AND ${products.name} = json_extract(expected.value, '$.name')
        AND ${productVariants.active} = 1 AND ${effectivePrice} = json_extract(expected.value, '$.price')
        AND ${productVariants.quantity} = json_extract(expected.value, '$.packSize') AND ${productVariants.sku} = json_extract(expected.value, '$.sku')
        AND ${productVariants.presentation} = json_extract(expected.value, '$.presentation')
        AND EXISTS (SELECT 1 FROM ${lots} WHERE ${lots.productCode} = ${products.code}
          AND ${lots.status} = 'released' AND ${lots.supersededById} IS NULL)))`;
}
