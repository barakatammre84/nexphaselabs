import { desc, eq, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import {
  accountEvents,
  accounts,
  chemicalClassRevisions,
  lotMovements,
  lotStatusEvents,
  lots,
  orderEvents,
  orders,
  organizations,
  productRevisions,
  purchaseOrderEvents,
  purchaseOrders,
  staffEvents,
  staffUsers,
  supplierEvents,
  suppliers,
  verificationEvents,
} from '@/db/schema';
import { canFulfil, canManageStaff, type StaffPrincipal } from '@/lib/staff-auth';

/**
 * One timeline across every append-only history table. Read-only; each
 * domain is queried separately (with its own limit) and merged by time. The
 * staff domain (sign-ins, resets, role changes) is offered only to admins.
 */

export const ACTIVITY_DOMAINS = ['lots', 'orders', 'verification', 'accounts', 'catalog', 'procurement', 'staff'] as const;
export type ActivityDomain = (typeof ACTIVITY_DOMAINS)[number];
export const DOMAIN_LABEL: Record<ActivityDomain, string> = {
  lots: 'Lots',
  orders: 'Orders',
  verification: 'Verification',
  accounts: 'Customer accounts',
  catalog: 'Catalog',
  procurement: 'Procurement',
  staff: 'Staff',
};

/**
 * The domains a role may read — the same predicates that gate the pages the
 * rows link to: customer accounts and staff for admins only, procurement for
 * fulfilment roles.
 */
export function domainsForRole(staff: StaffPrincipal): ActivityDomain[] {
  return ACTIVITY_DOMAINS.filter((d) => (d === 'staff' || d === 'accounts' ? canManageStaff(staff) : d === 'procurement' ? canFulfil(staff) : true));
}

export type ActivityRow = { id: string; at: Date; domain: ActivityDomain; subject: string; href: string; action: string; actor: string; note: string | null };

export async function activityTimeline(domains: ActivityDomain[], limit = 100, perDomain = 60): Promise<ActivityRow[]> {
  const db = getDb();
  const want = new Set(domains);
  const jobs: Promise<ActivityRow[]>[] = [];

  if (want.has('lots')) {
    jobs.push(
      db
        .select({ e: lotStatusEvents, lotNumber: lots.lotNumber })
        .from(lotStatusEvents)
        .innerJoin(lots, eq(lotStatusEvents.lotId, lots.id))
        .orderBy(desc(lotStatusEvents.createdAt))
        .limit(perDomain)
        .then((rows) =>
          rows.map(({ e, lotNumber }) => ({
            id: e.id,
            at: e.createdAt,
            domain: 'lots' as const,
            subject: lotNumber,
            href: `/manage/lots/${encodeURIComponent(lotNumber)}`,
            action: e.kind === 'cost' ? 'landed cost' : e.kind === 'correction' ? 'record corrected' : `${e.fromStatus} → ${e.toStatus}`,
            actor: e.decidedBy,
            note: e.reason,
          })),
        ),
    );
    jobs.push(
      db
        .select({ m: lotMovements, lotNumber: lots.lotNumber })
        .from(lotMovements)
        .innerJoin(lots, eq(lotMovements.lotId, lots.id))
        .orderBy(desc(lotMovements.createdAt))
        .limit(perDomain)
        .then((rows) =>
          rows.map(({ m, lotNumber }) => ({
            id: m.id,
            at: m.createdAt,
            domain: 'lots' as const,
            subject: lotNumber,
            href: `/manage/lots/${encodeURIComponent(lotNumber)}`,
            action: `${m.movementType} ${m.quantity}`,
            actor: m.recordedBy,
            note: [m.consigneeName, m.trackingNumber ? `tracking ${m.trackingNumber}` : null, m.note].filter(Boolean).join(' · ') || null,
          })),
        ),
    );
  }
  if (want.has('orders')) {
    jobs.push(
      db
        .select({ e: orderEvents, orderNumber: orders.orderNumber })
        .from(orderEvents)
        .innerJoin(orders, eq(orderEvents.orderId, orders.id))
        .orderBy(desc(orderEvents.createdAt))
        .limit(perDomain)
        .then((rows) =>
          rows.map(({ e, orderNumber }) => ({
            id: e.id,
            at: e.createdAt,
            domain: 'orders' as const,
            subject: orderNumber,
            href: `/manage/orders/${orderNumber}`,
            action: e.fromStatus === e.toStatus ? e.toStatus : `${e.fromStatus} → ${e.toStatus}`,
            actor: e.actor,
            note: e.note,
          })),
        ),
    );
  }
  if (want.has('verification')) {
    jobs.push(
      db
        .select({ e: verificationEvents, legalName: organizations.legalName, orgId: organizations.id })
        .from(verificationEvents)
        .innerJoin(organizations, eq(verificationEvents.organizationId, organizations.id))
        .orderBy(desc(verificationEvents.createdAt))
        .limit(perDomain)
        .then((rows) =>
          rows.map(({ e, legalName, orgId }) => ({
            id: e.id,
            at: e.createdAt,
            domain: 'verification' as const,
            subject: legalName,
            href: `/manage/verification/${orgId}`,
            action: `${e.fromStatus} → ${e.toStatus}`,
            actor: e.decidedBy,
            note: e.note,
          })),
        ),
    );
  }
  if (want.has('accounts')) {
    jobs.push(
      db
        .select({ e: accountEvents, email: accounts.email, accountId: accounts.id })
        .from(accountEvents)
        .innerJoin(accounts, eq(accountEvents.accountId, accounts.id))
        .orderBy(desc(accountEvents.createdAt))
        .limit(perDomain)
        .then((rows) =>
          rows.map(({ e, email, accountId }) => ({
            id: e.id,
            at: e.createdAt,
            domain: 'accounts' as const,
            subject: email,
            href: `/manage/accounts/${accountId}`,
            action: e.action.replace(/_/g, ' '),
            actor: e.actor,
            note: e.detail,
          })),
        ),
    );
  }
  if (want.has('catalog')) {
    jobs.push(
      db
        .select()
        .from(productRevisions)
        .orderBy(desc(productRevisions.createdAt))
        .limit(perDomain)
        .then((rows) =>
          rows.map((r) => ({
            id: r.id,
            at: r.createdAt,
            domain: 'catalog' as const,
            subject: r.productCode,
            href: `/manage/products/${r.productCode}`,
            action: `product ${r.action}`,
            actor: r.changedByName,
            note: r.note,
          })),
        ),
    );
    jobs.push(
      db
        .select()
        .from(chemicalClassRevisions)
        .orderBy(desc(chemicalClassRevisions.createdAt))
        .limit(perDomain)
        .then((rows) =>
          rows.map((r) => ({
            id: r.id,
            at: r.createdAt,
            domain: 'catalog' as const,
            subject: `class ${r.classId}`,
            href: `/manage/classes/${r.classId}`,
            action: `class ${r.action}`,
            actor: r.changedBy,
            note: r.note,
          })),
        ),
    );
  }
  if (want.has('procurement')) {
    jobs.push(
      db
        .select({ e: purchaseOrderEvents, poNumber: purchaseOrders.poNumber })
        .from(purchaseOrderEvents)
        .innerJoin(purchaseOrders, eq(purchaseOrderEvents.purchaseOrderId, purchaseOrders.id))
        .orderBy(desc(purchaseOrderEvents.createdAt))
        .limit(perDomain)
        .then((rows) =>
          rows.map(({ e, poNumber }) => ({
            id: e.id,
            at: e.createdAt,
            domain: 'procurement' as const,
            subject: poNumber,
            href: `/manage/procurement/orders/${poNumber}`,
            action: `${e.fromStatus} → ${e.toStatus}`,
            actor: e.actor,
            note: e.note,
          })),
        ),
    );
    jobs.push(
      db
        .select({ e: supplierEvents, name: suppliers.name, supplierId: suppliers.id })
        .from(supplierEvents)
        .innerJoin(suppliers, eq(supplierEvents.supplierId, suppliers.id))
        .orderBy(desc(supplierEvents.createdAt))
        .limit(perDomain)
        .then((rows) =>
          rows.map(({ e, name, supplierId }) => ({
            id: e.id,
            at: e.createdAt,
            domain: 'procurement' as const,
            subject: name,
            href: `/manage/procurement/suppliers/${supplierId}`,
            action: `supplier ${e.action}`,
            actor: e.actor,
            note: e.detail,
          })),
        ),
    );
  }
  if (want.has('staff')) {
    jobs.push(
      db
        .select({ e: staffEvents, name: staffUsers.name, userId: staffUsers.id })
        .from(staffEvents)
        .innerJoin(staffUsers, eq(staffEvents.userId, staffUsers.id))
        .orderBy(desc(staffEvents.createdAt))
        .limit(perDomain)
        .then((rows) =>
          rows.map(({ e, name, userId }) => ({
            id: e.id,
            at: e.createdAt,
            domain: 'staff' as const,
            subject: name,
            href: `/manage/staff/${userId}`,
            action: e.action.replace(/_/g, ' '),
            actor: e.actor,
            note: e.detail,
          })),
        ),
    );
  }
  const all = (await Promise.all(jobs)).flat();
  all.sort((a, b) => b.at.getTime() - a.at.getTime() || a.id.localeCompare(b.id));
  return all.slice(0, limit);
}

/* ------------------------------------------------------------------------ */
/* Queue counts                                                              */
/* ------------------------------------------------------------------------ */

export type QueueCounts = {
  verificationsWaiting: number;
  ordersAwaitingPayment: number;
  ordersToFulfil: number;
  ordersFulfilling: number;
  refundsDue: number;
  lotsInQuarantine: number;
  lotsOnHold: number;
  openPurchaseOrders: number;
  staffOnOneTimePassword: number;
};

export async function queueCounts(): Promise<QueueCounts> {
  const db = getDb();
  const [row] = await db.all<Record<keyof QueueCounts, number>>(sql`
    SELECT
      (SELECT count(*) FROM organizations WHERE verification_status = 'submitted') AS verificationsWaiting,
      (SELECT count(*) FROM orders WHERE status = 'awaiting_payment') AS ordersAwaitingPayment,
      (SELECT count(*) FROM orders WHERE status = 'paid') AS ordersToFulfil,
      (SELECT count(*) FROM orders WHERE status = 'fulfilling') AS ordersFulfilling,
      (SELECT count(*) FROM orders WHERE payment_status = 'refund_due') AS refundsDue,
      (SELECT count(*) FROM lots WHERE status = 'quarantine' AND superseded_by_id IS NULL) AS lotsInQuarantine,
      (SELECT count(*) FROM lots WHERE status = 'on_hold' AND superseded_by_id IS NULL) AS lotsOnHold,
      (SELECT count(*) FROM purchase_orders WHERE status IN ('sent', 'partially_received')) AS openPurchaseOrders,
      (SELECT count(*) FROM staff_users WHERE active = 1 AND must_change_password = 1) AS staffOnOneTimePassword
  `);
  const n = (v: unknown) => Number(v ?? 0);
  return {
    verificationsWaiting: n(row?.verificationsWaiting),
    ordersAwaitingPayment: n(row?.ordersAwaitingPayment),
    ordersToFulfil: n(row?.ordersToFulfil),
    ordersFulfilling: n(row?.ordersFulfilling),
    refundsDue: n(row?.refundsDue),
    lotsInQuarantine: n(row?.lotsInQuarantine),
    lotsOnHold: n(row?.lotsOnHold),
    openPurchaseOrders: n(row?.openPurchaseOrders),
    staffOnOneTimePassword: n(row?.staffOnOneTimePassword),
  };
}
