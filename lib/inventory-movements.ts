import { and, eq, isNull, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import {
  lotMovements,
  lots,
  lotStatusEvents,
  type Lot,
} from '@/db/schema';
import { unreservedStockGuard } from '@/lib/inventory-reservations';
import { isMassUnit, sumQuantities } from '@/lib/lot-quantities';
import {
  finerThanMicrogram,
  normalizeQuantity,
  parseQuantity,
} from '@/lib/lot-rules';
import { recordedBy } from '@/lib/lots-admin';
import { quantitiesComparable, adjustQuantity } from '@/lib/procurement-quantities';
import type { StaffPrincipal } from '@/lib/staff-auth';
import { randomToken } from '@/lib/staff-auth-core';

export const INVENTORY_MOVEMENT_TYPES = [
  'sample',
  'destruction',
  'adjustment',
] as const;
export type InventoryMovementType =
  (typeof INVENTORY_MOVEMENT_TYPES)[number];
export type InventoryDirection = 'increase' | 'decrease';

export type InventoryMovementInput = {
  movementType: string;
  direction?: string | null;
  quantity: string;
  occurredOn: string;
  reason: string;
  witnessOne?: string | null;
  witnessTwo?: string | null;
};

export type ValidInventoryMovement = {
  movementType: InventoryMovementType;
  direction: InventoryDirection;
  quantity: string;
  occurredAt: Date;
  reason: string;
  witnessOne: string | null;
  witnessTwo: string | null;
};

export type InventoryMovementValidation =
  | { ok: true; value: ValidInventoryMovement }
  | { ok: false; errors: string[] };

export type InventoryMovementResult =
  | { ok: true; remaining: string }
  | { ok: false; error: string };

export function validateInventoryMovement(
  raw: InventoryMovementInput,
  lot: Pick<Lot, 'receivedAt' | 'quantityRemaining' | 'status'>,
  now = new Date(),
): InventoryMovementValidation {
  const errors: string[] = [];
  const movementType = (raw.movementType ?? '').trim();
  if (!(INVENTORY_MOVEMENT_TYPES as readonly string[]).includes(movementType)) {
    errors.push('Choose sample, destruction, or adjustment.');
  }
  const requestedDirection = (raw.direction ?? '').trim();
  const direction: InventoryDirection =
    movementType === 'adjustment' && requestedDirection === 'increase'
      ? 'increase'
      : 'decrease';
  if (
    movementType === 'adjustment' &&
    requestedDirection !== 'increase' &&
    requestedDirection !== 'decrease'
  ) {
    errors.push('Choose whether the adjustment increases or decreases stock.');
  }

  const parsed = parseQuantity((raw.quantity ?? '').trim());
  const current = lot.quantityRemaining
    ? parseQuantity(lot.quantityRemaining)
    : null;
  let quantity = (raw.quantity ?? '').trim();
  if (!parsed || parsed.amount <= 0) {
    errors.push('Quantity must be greater than zero and include a unit.');
  } else if (finerThanMicrogram(parsed.amount, parsed.unit)) {
    errors.push('Quantity cannot be finer than one microgram.');
  } else {
    quantity = normalizeQuantity(parsed.amount, parsed.unit);
    if (!current || !quantitiesComparable(lot.quantityRemaining ?? '', quantity)) {
      errors.push('Quantity must use the same mass or count unit family as this lot.');
    }
    if (!isMassUnit(parsed.unit) && !Number.isInteger(parsed.amount)) {
      errors.push('A count adjustment must be a whole number.');
    }
  }

  const occurredOn = (raw.occurredOn ?? '').trim();
  let occurredAt: Date | null = null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)) {
    errors.push('Movement date must be YYYY-MM-DD.');
  } else {
    occurredAt = new Date(`${occurredOn}T00:00:00Z`);
    if (
      Number.isNaN(occurredAt.getTime()) ||
      occurredAt.toISOString().slice(0, 10) !== occurredOn
    ) {
      errors.push('Movement date is not a real date.');
    } else {
      if (occurredOn > now.toISOString().slice(0, 10)) {
        errors.push('Movement date cannot be in the future.');
      }
      if (occurredOn < lot.receivedAt.toISOString().slice(0, 10)) {
        errors.push('Movement date cannot be before the lot was received.');
      }
    }
  }

  const reason = (raw.reason ?? '').trim().replace(/\s+/g, ' ');
  if (reason.length < 10 || reason.length > 500) {
    errors.push('Reason must be 10–500 characters.');
  }
  const witnessOne = (raw.witnessOne ?? '').trim().replace(/\s+/g, ' ') || null;
  const witnessTwo = (raw.witnessTwo ?? '').trim().replace(/\s+/g, ' ') || null;
  if (movementType === 'destruction') {
    if (!witnessOne || !witnessTwo) {
      errors.push('Destruction requires two named witnesses.');
    } else if (witnessOne.toLowerCase() === witnessTwo.toLowerCase()) {
      errors.push('The two destruction witnesses must be different people.');
    }
  }
  if ((witnessOne?.length ?? 0) > 120 || (witnessTwo?.length ?? 0) > 120) {
    errors.push('Witness names must be 120 characters or fewer.');
  }
  if (direction === 'increase' && (lot.status === 'released' || lot.status === 'exhausted')) {
    errors.push(
      lot.status === 'released'
        ? 'Put a released lot on hold before increasing its quantity.'
        : 'An exhausted lot cannot be reopened by an adjustment; escalate for a controlled correction.',
    );
  }
  if (lot.status === 'exhausted' && direction === 'decrease') {
    errors.push('An exhausted lot has no stock to remove.');
  }

  if (errors.length || !parsed || !current || !occurredAt) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    value: {
      movementType: movementType as InventoryMovementType,
      direction,
      quantity,
      occurredAt,
      reason,
      witnessOne: movementType === 'destruction' ? witnessOne : null,
      witnessTwo: movementType === 'destruction' ? witnessTwo : null,
    },
  };
}

function nextQuantity(
  current: string,
  movement: ValidInventoryMovement,
): string | null {
  if (movement.direction === 'increase') {
    return sumQuantities([current, movement.quantity]);
  }
  const quantity = parseQuantity(movement.quantity);
  if (!quantity) return null;
  return adjustQuantity(
    current,
    movement.quantity,
    normalizeQuantity(0, quantity.unit),
  );
}

/**
 * Record a non-sale movement and the resulting on-hand balance atomically.
 * Active order reservations are protected from negative adjustments, samples,
 * and destruction.
 */
export async function recordInventoryMovement(
  lot: Lot,
  movement: ValidInventoryMovement,
  staff: StaffPrincipal,
  now = new Date(),
): Promise<InventoryMovementResult> {
  const current = lot.quantityRemaining;
  if (!current) return { ok: false, error: 'This lot has no recorded quantity on hand.' };
  const remaining = nextQuantity(current, movement);
  if (!remaining) {
    return { ok: false, error: `Lot has ${current}; the movement cannot be reconciled without negative stock.` };
  }
  const marker = `mov_${randomToken().slice(0, 24)}`;
  const by = recordedBy(staff);
  const reachesZero = parseQuantity(remaining)?.amount === 0;
  const exhaustsReleased = reachesZero && lot.status === 'released';
  const reservationGuard =
    movement.direction === 'decrease'
      ? unreservedStockGuard(
          [{ lotId: lot.id, remaining }],
          '__non_order_inventory_movement__',
          now,
        )
      : sql`1 = 1`;
  const db = getDb();
  const movementNote = `${movement.direction === 'increase' ? 'Stock increase' : 'Stock decrease'}: ${movement.reason}`;
  const [changed] = await db.batch([
    db
      .update(lots)
      .set({
        quantityRemaining: remaining,
        lastMovementId: marker,
        ...(exhaustsReleased
          ? {
              status: 'exhausted',
              statusReason: `Quantity reached zero after ${movement.movementType}.`,
            }
          : {}),
        updatedAt: now,
      })
      .where(
        and(
          eq(lots.id, lot.id),
          isNull(lots.supersededById),
          eq(lots.status, lot.status),
          sql`${lots.quantityRemaining} IS ${current}`,
          sql`${lots.lastMovementId} IS ${lot.lastMovementId}`,
          movement.direction === 'increase'
            ? sql`${lots.status} NOT IN ('released','exhausted')`
            : reservationGuard,
        ),
      )
      .returning({ id: lots.id }),
    db.insert(lotMovements).select(
      db
        .select({
          id: sql<string>`${marker}`.as('id'),
          lotId: lots.id,
          movementType: sql<string>`${movement.movementType}`.as('movement_type'),
          direction: sql<string>`${movement.direction}`.as('direction'),
          quantity: sql<string>`${movement.quantity}`.as('quantity'),
          accountId: sql<null>`NULL`.as('account_id'),
          consigneeName: sql<null>`NULL`.as('consignee_name'),
          consigneeInstitution: sql<null>`NULL`.as('consignee_institution'),
          shipToAddress: sql<null>`NULL`.as('ship_to_address'),
          carrier: sql<null>`NULL`.as('carrier'),
          trackingNumber: sql<null>`NULL`.as('tracking_number'),
          witnessOne: sql<string | null>`${movement.witnessOne}`.as('witness_one'),
          witnessTwo: sql<string | null>`${movement.witnessTwo}`.as('witness_two'),
          occurredAt: sql<number>`${Math.floor(movement.occurredAt.getTime() / 1000)}`.as('occurred_at'),
          recordedBy: sql<string>`${by}`.as('recorded_by'),
          note: sql<string>`${movementNote}`.as('note'),
          createdAt: sql<number>`${Math.floor(now.getTime() / 1000)}`.as('created_at'),
        })
        .from(lots)
        .where(and(eq(lots.id, lot.id), eq(lots.lastMovementId, marker))),
    ),
    ...(exhaustsReleased
      ? [
          db.insert(lotStatusEvents).select(
            db
              .select({
                id: sql<string>`${`evt_${randomToken().slice(0, 24)}`}`.as('id'),
                lotId: lots.id,
                fromStatus: sql<string>`'released'`.as('from_status'),
                toStatus: sql<string>`'exhausted'`.as('to_status'),
                reason: sql<string>`${`Quantity reached zero after ${movement.movementType}: ${movement.reason}`}`.as('reason'),
                decidedBy: sql<string>`${by}`.as('decided_by'),
                kind: sql<string>`'disposition'`.as('kind'),
                createdAt: sql<number>`${Math.floor(now.getTime() / 1000)}`.as('created_at'),
              })
              .from(lots)
              .where(and(eq(lots.id, lot.id), eq(lots.lastMovementId, marker))),
          ),
        ]
      : []),
  ] as unknown as Parameters<typeof db.batch>[0]);
  if (!changed || (changed as unknown[]).length === 0) {
    return {
      ok: false,
      error:
        'The lot, quantity, disposition, or reserved stock changed while you were recording this movement. Reload and reconcile before trying again.',
    };
  }
  return { ok: true, remaining };
}
