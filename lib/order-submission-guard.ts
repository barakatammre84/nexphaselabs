import { sql } from 'drizzle-orm';
import { accounts, accountSessions, cartItems, lots, organizations, products, productVariants } from '@/db/schema';
import { RUO_VERSION, TERMS_VERSION } from '@/lib/policy';
import type { AccountPrincipal } from '@/lib/account-auth';
import type { Cart } from '@/lib/cart';
import type { ShipTo } from '@/lib/orders';

/** Recheck the reviewed customer/cart/offer in the very statement accepting the order. */
export function orderSubmissionGuard(account: AccountPrincipal, organizationId: string, shipTo: ShipTo, cart: Cart, now: Date) {
  return sql`${accounts.id} = ${account.id} AND ${accounts.status} = 'active'
    AND ${accounts.tier} = 'institutional' AND ${accounts.verificationStatus} = 'approved'
    AND ${accounts.email} = ${account.email} AND ${accounts.name} = ${account.name}
    AND ${accounts.termsVersion} = ${TERMS_VERSION} AND ${accounts.ruoVersion} = ${RUO_VERSION}
    AND EXISTS (SELECT 1 FROM ${accountSessions} WHERE ${accountSessions.id} = ${account.sessionId}
      AND ${accountSessions.accountId} = ${account.id} AND ${accountSessions.revokedAt} IS NULL
      AND ${accountSessions.expiresAt} > ${Math.floor(now.getTime() / 1000)})
    AND EXISTS (SELECT 1 FROM ${organizations} WHERE ${organizations.id} = ${organizationId}
      AND ${organizations.accountId} = ${account.id} AND ${organizations.verificationStatus} = 'approved'
      AND ${organizations.legalName} IS ${shipTo.consigneeInstitution}
      AND COALESCE(NULLIF(${organizations.receivingParty}, ''), ${accounts.name}) = ${shipTo.consigneeName}
      AND ${organizations.addressLine1} = ${shipTo.line1} AND ${organizations.addressLine2} IS ${shipTo.line2}
      AND ${organizations.city} = ${shipTo.city} AND ${organizations.region} = ${shipTo.region}
      AND ${organizations.postalCode} = ${shipTo.postalCode} AND ${organizations.country} = ${shipTo.country}
      AND ${organizations.phone} IS ${shipTo.phone})
    AND (SELECT count(*) FROM ${cartItems} WHERE ${cartItems.accountId} = ${account.id}) = ${cart.lines.length}
    AND NOT EXISTS (SELECT 1 FROM json_each(${JSON.stringify(cart.lines.map((line) => ({
      itemId: line.itemId, quantity: line.quantity, variantId: line.variant.id,
      productId: line.product.id, code: line.product.code, name: line.product.name,
      price: line.unitPriceCents, packSize: line.variant.quantity, sku: line.variant.sku, presentation: line.variant.presentation,
    })))}) AS expected WHERE NOT EXISTS (SELECT 1 FROM ${cartItems}
      INNER JOIN ${productVariants} ON ${productVariants.id} = ${cartItems.variantId}
      INNER JOIN ${products} ON ${products.id} = ${productVariants.productId}
      WHERE ${cartItems.id} = json_extract(expected.value, '$.itemId') AND ${cartItems.accountId} = ${account.id}
        AND ${cartItems.quantity} = json_extract(expected.value, '$.quantity')
        AND ${productVariants.id} = json_extract(expected.value, '$.variantId')
        AND ${products.id} = json_extract(expected.value, '$.productId') AND ${products.visibility} = 'published'
        AND ${products.code} = json_extract(expected.value, '$.code') AND ${products.name} = json_extract(expected.value, '$.name')
        AND ${productVariants.active} = 1 AND ${productVariants.institutionalPriceCents} = json_extract(expected.value, '$.price')
        AND ${productVariants.quantity} = json_extract(expected.value, '$.packSize') AND ${productVariants.sku} = json_extract(expected.value, '$.sku')
        AND ${productVariants.presentation} = json_extract(expected.value, '$.presentation')
        AND EXISTS (SELECT 1 FROM ${lots} WHERE ${lots.productCode} = ${products.code}
          AND ${lots.status} = 'released' AND ${lots.supersededById} IS NULL)))`;
}
