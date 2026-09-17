import { and, desc, eq, ne, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { accounts, notifications, products, productVariants, stockWaitlist } from '@/db/schema';
import { getPublishedProductByCode } from '@/lib/catalog-data';
import { packAvailable } from '@/lib/storefront';

/**
 * Back-in-stock requests ("Tell me when it's available"; owner, 16 Sep 2026).
 *
 * A signed-in account asks once per pack size. When a released lot can supply that
 * pack size — normally the moment staff release it (app/manage/lots/actions.ts), otherwise
 * on the five-minute sweep — one notification row is written to the outbox and the
 * request is marked notified. It is never emailed again unless the customer asks again.
 * The notice says a lot was released and nothing else: no price, no claim, no reservation.
 */

export const WAITLIST_COPY = {
  joined: "You're on the list. We'll email you once when this pack size is released.",
  already: "You're already on the list for this pack size.",
  unknownPack: 'That pack size is not offered, so there is nothing to wait for.',
  signIn: 'Sign in to be told when a pack size is available.',
  removed: 'Removed from your waitlist.',
  unavailable: 'The waitlist is temporarily unavailable. Try again shortly.',
} as const;

/** Product codes checked per cron tick and requests read per product; both bound the tick. */
const PRODUCTS_PER_SWEEP = 50;
const REQUESTS_PER_PRODUCT = 200;

const SKU = /^[A-Z0-9][A-Z0-9-]{1,38}[A-Z0-9]$/;

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
}

export function normaliseSku(raw: string): string | null {
  const sku = raw.trim().toUpperCase();
  return SKU.test(sku) ? sku : null;
}

export type WaitlistJoin =
  | { ok: true; already: boolean; sku: string; productSlug: string }
  | { ok: false; error: string };

/** Records the request, or re-arms one that was notified or cancelled earlier. */
export async function joinWaitlist(accountId: string, skuRaw: string, now = new Date()): Promise<WaitlistJoin> {
  const sku = normaliseSku(skuRaw);
  if (!sku) return { ok: false, error: WAITLIST_COPY.unknownPack };
  const db = getDb();
  const [variant] = await db
    .select({ active: productVariants.active, productCode: products.code })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(eq(productVariants.sku, sku))
    .limit(1);
  if (!variant || !variant.active) return { ok: false, error: WAITLIST_COPY.unknownPack };
  // Only listed material takes requests; a draft product has no page to send anyone to.
  const product = await getPublishedProductByCode(variant.productCode);
  if (!product) return { ok: false, error: WAITLIST_COPY.unknownPack };

  const [existing] = await db
    .select({ id: stockWaitlist.id, status: stockWaitlist.status })
    .from(stockWaitlist)
    .where(and(eq(stockWaitlist.accountId, accountId), eq(stockWaitlist.sku, sku)))
    .limit(1);
  if (existing?.status === 'waiting') return { ok: true, already: true, sku, productSlug: product.slug };
  if (existing) {
    await db
      .update(stockWaitlist)
      .set({ status: 'waiting', updatedAt: now })
      .where(eq(stockWaitlist.id, existing.id));
  } else {
    await db.insert(stockWaitlist).values({
      id: newId('wl'),
      accountId,
      productCode: variant.productCode,
      sku,
      status: 'waiting',
      notifyCount: 0,
      createdAt: now,
      updatedAt: now,
    });
  }
  return { ok: true, already: false, sku, productSlug: product.slug };
}

/** The customer withdraws a request. Only their own rows, and the row is kept as cancelled. */
export async function leaveWaitlist(accountId: string, id: string, now = new Date()): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .update(stockWaitlist)
    .set({ status: 'cancelled', updatedAt: now })
    .where(
      and(eq(stockWaitlist.id, id), eq(stockWaitlist.accountId, accountId), ne(stockWaitlist.status, 'cancelled')),
    )
    .returning({ id: stockWaitlist.id });
  return rows.length > 0;
}

export type WaitlistEntry = {
  id: string;
  sku: string;
  productCode: string;
  productName: string;
  productSlug: string | null;
  pack: string;
  status: 'waiting' | 'notified';
  createdAt: Date;
  notifiedAt: Date | null;
};

/** Everything the account is waiting on or has been told about, newest first. */
export async function listWaitlistForAccount(accountId: string): Promise<WaitlistEntry[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: stockWaitlist.id,
      sku: stockWaitlist.sku,
      productCode: stockWaitlist.productCode,
      status: stockWaitlist.status,
      createdAt: stockWaitlist.createdAt,
      notifiedAt: stockWaitlist.notifiedAt,
      productName: products.name,
      productSlug: products.slug,
      quantity: productVariants.quantity,
      presentation: productVariants.presentation,
    })
    .from(stockWaitlist)
    .leftJoin(productVariants, eq(productVariants.sku, stockWaitlist.sku))
    .leftJoin(products, eq(products.id, productVariants.productId))
    .where(and(eq(stockWaitlist.accountId, accountId), ne(stockWaitlist.status, 'cancelled')))
    .orderBy(desc(stockWaitlist.createdAt));
  return rows.map((row) => ({
    id: row.id,
    sku: row.sku,
    productCode: row.productCode,
    productName: row.productName ?? row.productCode,
    productSlug: row.productSlug ?? null,
    pack: [row.quantity, row.presentation].filter(Boolean).join(' · ') || row.sku,
    status: row.status === 'notified' ? 'notified' : 'waiting',
    createdAt: row.createdAt,
    notifiedAt: row.notifiedAt ?? null,
  }));
}

/** Pack sizes the account is still waiting on, for the product page's button state. */
export async function waitlistedSkus(accountId: string): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select({ sku: stockWaitlist.sku })
    .from(stockWaitlist)
    .where(and(eq(stockWaitlist.accountId, accountId), eq(stockWaitlist.status, 'waiting')));
  return rows.map((row) => row.sku);
}

function noticeBody(recipientName: string | null, productName: string, pack: string): string {
  return [
    `Hello${recipientName ? ` ${recipientName}` : ''},`,
    '',
    `You asked to hear when ${productName} (${pack}) could be ordered again. A lot has been released and this pack size can be ordered now.`,
    '',
    'Material is supplied first come, first served; this notice does not reserve any.',
    'This is the only email you will receive about this pack size unless you ask again.',
    '',
    'Materials are for laboratory research use only; not for human or veterinary use.',
  ].join('\n');
}

/**
 * Writes one outbox row for every waiting request on `productCode` whose pack size a
 * released lot can now supply. Returns how many notices were queued. Claiming the
 * request (waiting → notified) happens before the outbox insert, so two callers — the
 * release action and the sweep — cannot both email the same request; an insert failure
 * hands the claim back for the next pass.
 */
export async function notifyWaitlist(productCode: string, now = new Date()): Promise<number> {
  const code = productCode.trim().toUpperCase();
  const db = getDb();
  const rows = await db
    .select({
      id: stockWaitlist.id,
      sku: stockWaitlist.sku,
      email: accounts.email,
      name: accounts.name,
      accountStatus: accounts.status,
      quantity: productVariants.quantity,
      presentation: productVariants.presentation,
      variantActive: productVariants.active,
    })
    .from(stockWaitlist)
    .innerJoin(accounts, eq(accounts.id, stockWaitlist.accountId))
    .innerJoin(productVariants, eq(productVariants.sku, stockWaitlist.sku))
    .where(and(eq(stockWaitlist.productCode, code), eq(stockWaitlist.status, 'waiting')))
    .limit(REQUESTS_PER_PRODUCT);
  if (rows.length === 0) return 0;
  const product = await getPublishedProductByCode(code);
  if (!product) return 0;

  const availability = new Map<string, boolean>();
  let queued = 0;
  for (const row of rows) {
    if (row.accountStatus !== 'active' || !row.variantActive) continue;
    let available = availability.get(row.sku);
    if (available === undefined) {
      available = await packAvailable(code, row.quantity, now);
      availability.set(row.sku, available);
    }
    if (!available) continue;

    const notificationId = newId('ntf');
    const claimed = await db
      .update(stockWaitlist)
      .set({
        status: 'notified',
        notifiedAt: now,
        notifyCount: sql`${stockWaitlist.notifyCount} + 1`,
        lastNotificationId: notificationId,
        updatedAt: now,
      })
      .where(and(eq(stockWaitlist.id, row.id), eq(stockWaitlist.status, 'waiting')))
      .returning({ id: stockWaitlist.id });
    if (claimed.length === 0) continue;

    const pack = [row.quantity, row.presentation].filter(Boolean).join(', ');
    try {
      await db.insert(notifications).values({
        id: notificationId,
        orderNumber: code,
        category: 'waitlist',
        actionPath: `/catalog/${product.slug}`,
        recipient: row.email,
        subject: `${product.name} ${row.quantity} can be ordered again — NexPhase Labs`,
        body: noticeBody(row.name, product.name, pack),
        status: 'pending',
        nextAttemptAt: now,
        createdAt: now,
      });
      queued += 1;
    } catch (error) {
      await db
        .update(stockWaitlist)
        .set({ status: 'waiting', lastNotificationId: null, updatedAt: now })
        .where(eq(stockWaitlist.id, row.id));
      throw error;
    }
  }
  return queued;
}

/** The cron pass: every product with a waiting request, bounded per tick. */
export async function sweepWaitlist(now = new Date()): Promise<{ ok: true; products: number; queued: number }> {
  const db = getDb();
  const codes = await db
    .selectDistinct({ productCode: stockWaitlist.productCode })
    .from(stockWaitlist)
    .where(eq(stockWaitlist.status, 'waiting'))
    .limit(PRODUCTS_PER_SWEEP);
  let queued = 0;
  for (const { productCode } of codes) queued += await notifyWaitlist(productCode, now);
  return { ok: true, products: codes.length, queued };
}

export type WaitlistSummaryRow = {
  productCode: string;
  productName: string;
  sku: string;
  pack: string;
  waiting: number;
  notified: number;
  latestAt: Date | null;
};

/** Counts per material and pack size for the staff desk; cancelled requests are left out. */
export async function waitlistSummary(): Promise<WaitlistSummaryRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      productCode: stockWaitlist.productCode,
      sku: stockWaitlist.sku,
      status: stockWaitlist.status,
      count: sql<number>`count(*)`,
      latest: sql<number | null>`max(${stockWaitlist.createdAt})`,
      productName: products.name,
      quantity: productVariants.quantity,
      presentation: productVariants.presentation,
    })
    .from(stockWaitlist)
    .leftJoin(productVariants, eq(productVariants.sku, stockWaitlist.sku))
    .leftJoin(products, eq(products.id, productVariants.productId))
    .where(ne(stockWaitlist.status, 'cancelled'))
    .groupBy(
      stockWaitlist.productCode,
      stockWaitlist.sku,
      stockWaitlist.status,
      products.name,
      productVariants.quantity,
      productVariants.presentation,
    );
  const merged = new Map<string, WaitlistSummaryRow>();
  for (const row of rows) {
    const key = `${row.productCode}|${row.sku}`;
    const entry = merged.get(key) ?? {
      productCode: row.productCode,
      productName: row.productName ?? row.productCode,
      sku: row.sku,
      pack: [row.quantity, row.presentation].filter(Boolean).join(' · ') || row.sku,
      waiting: 0,
      notified: 0,
      latestAt: null,
    };
    if (row.status === 'waiting') entry.waiting += Number(row.count);
    else if (row.status === 'notified') entry.notified += Number(row.count);
    if (row.latest !== null) {
      // Timestamps are stored as unix seconds; a value that large is already milliseconds.
      const ms = Number(row.latest) > 1e12 ? Number(row.latest) : Number(row.latest) * 1000;
      if (!entry.latestAt || entry.latestAt.getTime() < ms) entry.latestAt = new Date(ms);
    }
    merged.set(key, entry);
  }
  return [...merged.values()].sort((a, b) => b.waiting - a.waiting || a.productCode.localeCompare(b.productCode));
}
