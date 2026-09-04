import { openCheckoutEnabled } from '@/lib/site-config';
import { sql } from 'drizzle-orm';
import { accounts, organizations, type Order } from '@/db/schema';

/** Institutional approval is required when material actually leaves the business. */
export function orderCustomerEligible(
  order: Pick<Order, 'accountId' | 'organizationId'>,
) {
  if (openCheckoutEnabled() && !order.organizationId)
    return sql`EXISTS (SELECT 1 FROM ${accounts} WHERE ${accounts.id} = ${order.accountId} AND ${accounts.status} IN ('active', 'guest'))`;
  return sql`EXISTS (SELECT 1 FROM ${accounts}
    INNER JOIN ${organizations} ON ${organizations.accountId} = ${accounts.id}
    WHERE ${accounts.id} = ${order.accountId} AND ${accounts.status} = 'active'
      AND ${accounts.tier} = 'institutional' AND ${accounts.verificationStatus} = 'approved'
      AND ${organizations.id} = ${order.organizationId} AND ${organizations.verificationStatus} = 'approved')`;
}
