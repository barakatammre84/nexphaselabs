import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { accountAddresses, type AccountAddress } from '@/db/schema';
import type { ShipTo } from '@/lib/orders';

/**
 * Saved delivery addresses.
 *
 * Chapter 10 §10.2 names this as the main friction in a repeat purchase — the
 * address is captured per order and never reused, so a returning researcher
 * retypes it every time, and §10.4 makes it the dependency for reorder.
 *
 * Two boundaries worth stating, because both are easy to erode later:
 *
 *  - **This is a convenience, not a record.** The order carries its own
 *    immutable copy of where material went. Editing a saved address changes
 *    nothing that has shipped, and the recall query reads orders, never this
 *    table.
 *  - **Nothing is hard-deleted.** Removing an address archives it, so an order
 *    placed against it can still be explained.
 *
 * Guests have no account to save against; this is for signed-in customers only.
 */

export const MAX_SAVED_ADDRESSES = 12;

export type SavedAddress = {
  id: string;
  label: string | null;
  isDefault: boolean;
  lastUsedAt: Date | null;
  shipTo: ShipTo;
};

export type AddressInput = ShipTo & { label?: string | null };

export type AddressResult = { ok: true; id: string } | { ok: false; error: string };

const id = () => `adr_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;

function toSaved(row: AccountAddress): SavedAddress {
  return {
    id: row.id,
    label: row.label,
    isDefault: row.isDefault,
    lastUsedAt: row.lastUsedAt,
    shipTo: {
      consigneeName: row.consigneeName,
      consigneeInstitution: row.consigneeInstitution,
      line1: row.line1,
      line2: row.line2,
      city: row.city,
      region: row.region,
      postalCode: row.postalCode,
      country: row.country,
      phone: row.phone,
    },
  };
}

/**
 * The same rules the checkout applies, so an address cannot be saved that
 * checkout would then refuse. Kept here rather than imported from the checkout
 * validator because that one reads a FormData; this one takes the parsed value.
 */
export function addressIssues(input: AddressInput): string[] {
  const issues: string[] = [];
  const required: [keyof ShipTo, string][] = [
    ['consigneeName', 'Recipient name'],
    ['line1', 'Street address'],
    ['city', 'City'],
    ['region', 'State'],
    ['postalCode', 'ZIP code'],
  ];
  for (const [field, label] of required) {
    if (!String(input[field] ?? '').trim()) issues.push(`${label} is required.`);
  }
  if ((input.country ?? '').toUpperCase() !== 'US') {
    issues.push('Shipping is currently available within the United States.');
  }
  const values = Object.values(input as Record<string, unknown>);
  if (values.some((value) => typeof value === 'string' && [...value].some((c) => c.charCodeAt(0) < 32))) {
    issues.push('Remove line breaks or control characters from the address.');
  }
  if ((input.label ?? '').length > 40) issues.push('A label may be at most 40 characters.');
  return issues;
}

export async function listAddresses(accountId: string): Promise<SavedAddress[]> {
  const rows = await getDb()
    .select()
    .from(accountAddresses)
    .where(and(eq(accountAddresses.accountId, accountId), isNull(accountAddresses.archivedAt)))
    .orderBy(desc(accountAddresses.isDefault), desc(accountAddresses.lastUsedAt), asc(accountAddresses.createdAt));
  return rows.map(toSaved);
}

export async function getAddress(accountId: string, addressId: string): Promise<SavedAddress | null> {
  const [row] = await getDb()
    .select()
    .from(accountAddresses)
    .where(
      and(
        eq(accountAddresses.id, addressId),
        eq(accountAddresses.accountId, accountId),
        isNull(accountAddresses.archivedAt),
      ),
    )
    .limit(1);
  return row ? toSaved(row) : null;
}

/** True when an identical address is already saved, so the same one is not stored twice. */
function sameAddress(a: ShipTo, b: ShipTo): boolean {
  const key = (value: ShipTo) =>
    [value.consigneeName, value.consigneeInstitution, value.line1, value.line2, value.city, value.region, value.postalCode, value.country]
      .map((part) => (part ?? '').trim().toLowerCase())
      .join('|');
  return key(a) === key(b);
}

export async function saveAddress(
  accountId: string,
  input: AddressInput,
  { makeDefault = false }: { makeDefault?: boolean } = {},
): Promise<AddressResult> {
  const issues = addressIssues(input);
  if (issues.length) return { ok: false, error: issues.join(' ') };

  const existing = await listAddresses(accountId);
  const duplicate = existing.find((saved) => sameAddress(saved.shipTo, input));
  if (duplicate) {
    // Saving the same address again is not an error; it is the common case of
    // ordering twice to the same bench.
    if (makeDefault) await setDefaultAddress(accountId, duplicate.id);
    await touchAddress(accountId, duplicate.id);
    return { ok: true, id: duplicate.id };
  }
  if (existing.length >= MAX_SAVED_ADDRESSES) {
    return {
      ok: false,
      error: `You can keep ${MAX_SAVED_ADDRESSES} saved addresses. Remove one before adding another.`,
    };
  }

  const now = new Date();
  const addressId = id();
  const first = existing.length === 0;
  await getDb().insert(accountAddresses).values({
    id: addressId,
    accountId,
    label: (input.label ?? '').trim() || null,
    consigneeName: input.consigneeName.trim(),
    consigneeInstitution: (input.consigneeInstitution ?? '').trim() || null,
    line1: input.line1.trim(),
    line2: (input.line2 ?? '').trim() || null,
    city: input.city.trim(),
    region: input.region.trim(),
    postalCode: input.postalCode.trim(),
    country: input.country.toUpperCase(),
    phone: (input.phone ?? '').trim() || null,
    isDefault: first || makeDefault,
    createdAt: now,
    updatedAt: now,
  });
  if (makeDefault && !first) await setDefaultAddress(accountId, addressId);
  return { ok: true, id: addressId };
}

export async function setDefaultAddress(accountId: string, addressId: string): Promise<AddressResult> {
  const db = getDb();
  const [updated] = await db.batch([
    db
      .update(accountAddresses)
      .set({ isDefault: true, updatedAt: new Date() })
      .where(
        and(
          eq(accountAddresses.id, addressId),
          eq(accountAddresses.accountId, accountId),
          isNull(accountAddresses.archivedAt),
        ),
      )
      .returning({ id: accountAddresses.id }),
    db
      .update(accountAddresses)
      .set({ isDefault: false })
      .where(
        and(
          eq(accountAddresses.accountId, accountId),
          sql`${accountAddresses.id} <> ${addressId}`,
        ),
      ),
  ]);
  return (updated as { id: string }[]).length
    ? { ok: true, id: addressId }
    : { ok: false, error: 'That address is not on this account.' };
}

/** Archive, never delete: an order placed against it must stay explicable. */
export async function archiveAddress(accountId: string, addressId: string): Promise<AddressResult> {
  const rows = await getDb()
    .update(accountAddresses)
    .set({ archivedAt: new Date(), isDefault: false, updatedAt: new Date() })
    .where(
      and(
        eq(accountAddresses.id, addressId),
        eq(accountAddresses.accountId, accountId),
        isNull(accountAddresses.archivedAt),
      ),
    )
    .returning({ id: accountAddresses.id });
  return rows.length ? { ok: true, id: addressId } : { ok: false, error: 'That address is not on this account.' };
}

async function touchAddress(accountId: string, addressId: string) {
  await getDb()
    .update(accountAddresses)
    .set({ lastUsedAt: new Date() })
    .where(and(eq(accountAddresses.id, addressId), eq(accountAddresses.accountId, accountId)));
}

/**
 * Remember the address an order was sent to, if the customer asked for it.
 * Called after the order is accepted, never before: a saved address must not be
 * a side effect of an attempt that failed.
 */
export async function rememberOrderAddress(
  accountId: string,
  shipTo: ShipTo,
  label?: string | null,
): Promise<void> {
  const result = await saveAddress(accountId, { ...shipTo, label: label ?? null });
  if (result.ok) await touchAddress(accountId, result.id);
}
