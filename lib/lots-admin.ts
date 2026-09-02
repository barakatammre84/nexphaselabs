import { asc, desc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { lotMovements, lotTests, lots, type Lot, type LotMovement, type LotTest } from '@/db/schema';
import { getProductByCode } from '@/lib/catalog-data';
import type { LotIntakeValidation } from '@/lib/lot-rules';
import type { StaffPrincipal } from '@/lib/staff-auth';

/**
 * Lot writes and staff-side reads. Every function here is reachable only
 * from staff-gated server actions and pages. The public lookup route never
 * imports this module.
 */

export const LOT_STATUSES = ['quarantine', 'released', 'on_hold', 'rejected', 'withdrawn', 'exhausted'] as const;
export type LotStatus = (typeof LOT_STATUSES)[number];

export const LOT_STATUS_LABEL: Record<LotStatus, string> = {
  quarantine: 'Quarantine',
  released: 'Released',
  on_hold: 'On hold',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
  exhausted: 'Exhausted',
};

function lotId(): string {
  return `lot_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
}

function movementId(): string {
  return `mov_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
}

/** "Name (staff id)" — a named person, resolvable to the account. */
export function recordedBy(staff: StaffPrincipal): string {
  return `${staff.name} (${staff.id})`;
}

export type CreateLotResult = { ok: true; lotNumber: string } | { ok: false; error: string };

/**
 * Receive a lot. Inserts the lot in quarantine and the receipt movement in
 * one batch. There is deliberately no `status` parameter.
 */
export async function createLot(
  validated: Extract<LotIntakeValidation, { ok: true }>['value'],
  staff: StaffPrincipal,
): Promise<CreateLotResult> {
  const db = getDb();
  const product = await getProductByCode(validated.productCode);
  if (!product) return { ok: false, error: `Product ${validated.productCode} is not in the catalog.` };
  if (product.visibility === 'withdrawn') {
    return { ok: false, error: `Product ${validated.productCode} is withdrawn; a new lot cannot be received against it.` };
  }

  const [existing] = await db.select({ id: lots.id }).from(lots).where(eq(lots.lotNumber, validated.lotNumber)).limit(1);
  if (existing) return { ok: false, error: `Lot ${validated.lotNumber} already exists.` };

  const now = new Date();
  const id = lotId();
  try {
    await db.batch([
      db.insert(lots).values({
        id,
        lotNumber: validated.lotNumber,
        productCode: product.code,
        productName: product.name,
        casNumber: product.casNumber,
        manufacturerName: validated.manufacturerName ?? null,
        manufacturerAddress: validated.manufacturerAddress ?? null,
        supplierName: validated.supplierName ?? null,
        countryOfOrigin: validated.countryOfOrigin ?? null,
        entryNumber: validated.entryNumber ?? null,
        manufactureDate: validated.manufactureDateValue,
        receivedAt: validated.receivedAtDate,
        quantityReceived: validated.quantityReceived,
        quantityRemaining: validated.quantityReceived,
        storageLocation: validated.storageLocation ?? null,
        storageCondition: validated.storageCondition ?? null,
        retestDate: validated.retestDateValue,
        // status is left to its default: 'quarantine'
        statusReason: 'Received; awaiting documents, testing and release.',
        createdAt: now,
        updatedAt: now,
      }),
      db.insert(lotMovements).values({
        id: movementId(),
        lotId: id,
        movementType: 'receipt',
        quantity: validated.quantityReceived,
        consigneeName: validated.supplierName ?? null,
        occurredAt: validated.receivedAtDate,
        recordedBy: recordedBy(staff),
        note: validated.note ?? null,
        createdAt: now,
      }),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/UNIQUE constraint failed/i.test(message)) return { ok: false, error: `Lot ${validated.lotNumber} already exists.` };
    throw error;
  }
  return { ok: true, lotNumber: validated.lotNumber };
}

export async function listLots(): Promise<Lot[]> {
  const db = getDb();
  return db.select().from(lots).orderBy(desc(lots.receivedAt), asc(lots.lotNumber));
}

export type LotDetail = { lot: Lot; tests: LotTest[]; movements: LotMovement[] };

export async function getLotDetail(lotNumber: string): Promise<LotDetail | null> {
  const db = getDb();
  const [lot] = await db.select().from(lots).where(eq(lots.lotNumber, lotNumber.toUpperCase())).limit(1);
  if (!lot) return null;
  const [tests, movements] = await Promise.all([
    db.select().from(lotTests).where(eq(lotTests.lotId, lot.id)).orderBy(asc(lotTests.createdAt)),
    db.select().from(lotMovements).where(eq(lotMovements.lotId, lot.id)).orderBy(asc(lotMovements.occurredAt)),
  ]);
  return { lot, tests, movements };
}
