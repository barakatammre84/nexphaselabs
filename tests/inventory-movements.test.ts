import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localD1 } from './helpers/local-d1';

const { env } = vi.hoisted(() => ({ env: {} as { DB?: D1Database } }));
vi.mock('cloudflare:workers', () => ({ env }));

import { getDb } from '@/db';
import { inventoryReservations } from '@/db/commerce-schema';
import { accounts, lots, orderItems, orders } from '@/db/schema';
import {
  recordInventoryMovement,
  validateInventoryMovement,
} from '@/lib/inventory-movements';
import type { StaffPrincipal } from '@/lib/staff-auth';

let local: ReturnType<typeof localD1>;
const now = new Date('2026-09-08T12:00:00Z');
const staff = {
  id: 'staff_ops',
  name: 'Synthetic operations',
  role: 'ops',
} as StaffPrincipal;

async function lot(status = 'released', quantity = '10 mg') {
  await getDb().insert(lots).values({
    id: 'lot_test',
    lotNumber: 'MOVEMENT-TEST',
    productCode: 'NPL-9999',
    productName: 'Synthetic',
    casNumber: '50-00-0',
    receivedAt: new Date('2026-09-01T00:00:00Z'),
    quantityReceived: quantity,
    quantityRemaining: quantity,
    status,
  });
  return (await getDb().select().from(lots))[0];
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(now);
  local = localD1();
  env.DB = local.binding;
});

afterEach(() => {
  local.sqlite.close();
  delete env.DB;
  vi.useRealTimers();
});

describe('non-sale inventory movements', () => {
  it('validates dates, comparable quantities, adjustment direction and destruction witnesses', async () => {
    const current = await lot('on_hold');
    expect(
      validateInventoryMovement(
        { movementType: 'sample', quantity: '1 vial', occurredOn: '2026-09-08', reason: 'Analytical laboratory sample' },
        current,
        now,
      ).ok,
    ).toBe(false);
    expect(
      validateInventoryMovement(
        { movementType: 'adjustment', direction: '', quantity: '1 mg', occurredOn: '2026-09-08', reason: 'Count sheet variance reviewed' },
        current,
        now,
      ).ok,
    ).toBe(false);
    expect(
      validateInventoryMovement(
        { movementType: 'destruction', quantity: '1 mg', occurredOn: '2026-09-08', reason: 'Damaged container destroyed', witnessOne: 'Same', witnessTwo: 'same' },
        current,
        now,
      ).ok,
    ).toBe(false);
    expect(
      validateInventoryMovement(
        { movementType: 'sample', quantity: '1 mg', occurredOn: '2026-09-09', reason: 'Analytical laboratory sample' },
        current,
        now,
      ).ok,
    ).toBe(false);
  });

  it('records a sample and balance in one transaction', async () => {
    const current = await lot();
    const validated = validateInventoryMovement(
      { movementType: 'sample', quantity: '2 mg', occurredOn: '2026-09-08', reason: 'Sent to independent laboratory' },
      current,
      now,
    );
    if (!validated.ok) throw new Error(JSON.stringify(validated.errors));
    expect((await recordInventoryMovement(current, validated.value, staff, now)).ok).toBe(true);
    expect(local.sqlite.prepare('SELECT quantity_remaining FROM lots').get()!.quantity_remaining).toBe('8 mg');
    const movement = local.sqlite.prepare('SELECT * FROM lot_movements').get()!;
    expect(movement.movement_type).toBe('sample');
    expect(movement.direction).toBe('decrease');
    expect(movement.recorded_by).toContain(staff.name);
  });

  it('allows an increase only while the lot is not sellable', async () => {
    const current = await lot('on_hold');
    const validated = validateInventoryMovement(
      { movementType: 'adjustment', direction: 'increase', quantity: '500 ug', occurredOn: '2026-09-08', reason: 'Scale transcription variance reconciled' },
      current,
      now,
    );
    if (!validated.ok) throw new Error(JSON.stringify(validated.errors));
    expect((await recordInventoryMovement(current, validated.value, staff, now)).ok).toBe(true);
    expect(local.sqlite.prepare('SELECT quantity_remaining FROM lots').get()!.quantity_remaining).toBe('10.5 mg');
    const released = { ...current, status: 'released' };
    expect(
      validateInventoryMovement(
        { movementType: 'adjustment', direction: 'increase', quantity: '1 mg', occurredOn: '2026-09-08', reason: 'Scale transcription variance reconciled' },
        released,
        now,
      ).ok,
    ).toBe(false);
  });

  it('requires two different witnesses and records them for destruction', async () => {
    const current = await lot('on_hold');
    const validated = validateInventoryMovement(
      { movementType: 'destruction', quantity: '1 mg', occurredOn: '2026-09-08', reason: 'Container was damaged during handling', witnessOne: 'Witness One', witnessTwo: 'Witness Two' },
      current,
      now,
    );
    if (!validated.ok) throw new Error(JSON.stringify(validated.errors));
    await recordInventoryMovement(current, validated.value, staff, now);
    const movement = local.sqlite.prepare('SELECT * FROM lot_movements').get()!;
    expect(movement.witness_one).toBe('Witness One');
    expect(movement.witness_two).toBe('Witness Two');
  });

  it('marks a released lot exhausted when a movement reaches zero', async () => {
    const current = await lot('released', '2 mg');
    const validated = validateInventoryMovement(
      { movementType: 'sample', quantity: '2 mg', occurredOn: '2026-09-08', reason: 'Final retained analytical sample' },
      current,
      now,
    );
    if (!validated.ok) throw new Error(JSON.stringify(validated.errors));
    await recordInventoryMovement(current, validated.value, staff, now);
    const saved = local.sqlite.prepare('SELECT status, quantity_remaining FROM lots').get()!;
    expect(saved).toMatchObject({ status: 'exhausted', quantity_remaining: '0 mg' });
    expect(local.sqlite.prepare('SELECT count(*) AS n FROM lot_status_events').get()!.n).toBe(1);
  });

  it('does not consume stock reserved for accepted orders', async () => {
    const current = await lot();
    await getDb().insert(accounts).values({ id: 'account', email: 'buyer@example.invalid', name: 'Buyer', passwordHash: 'unused', tier: 'institutional' });
    await getDb().insert(orders).values({ id: 'order', orderNumber: 'ORDER-1', accountId: 'account', status: 'paid', subtotalCents: 100, totalCents: 100, priceTier: 'institutional', consigneeName: 'Buyer', shipToLine1: '1 Test', shipToCity: 'Test', shipToRegion: 'CA', shipToPostalCode: '00000', shipToCountry: 'US', submittedAt: now });
    await getDb().insert(orderItems).values({ id: 'item', orderId: 'order', productId: 'product', productCode: 'NPL-9999', productName: 'Synthetic', variantId: 'variant', sku: 'NPL-9999-5MG', packSize: '5 mg', presentation: 'powder', quantity: 1, unitPriceCents: 100, lineTotalCents: 100 });
    await getDb().insert(inventoryReservations).values({ orderId: 'order', itemId: 'item', lotId: current.id, units: 5_000, unit: 'ug', expiresAt: new Date('2026-09-09T00:00:00Z') });
    const validated = validateInventoryMovement(
      { movementType: 'sample', quantity: '6 mg', occurredOn: '2026-09-08', reason: 'Large analytical sample request' },
      current,
      now,
    );
    if (!validated.ok) throw new Error(JSON.stringify(validated.errors));
    expect((await recordInventoryMovement(current, validated.value, staff, now)).ok).toBe(false);
    expect(local.sqlite.prepare('SELECT quantity_remaining FROM lots').get()!.quantity_remaining).toBe('10 mg');
    expect(local.sqlite.prepare('SELECT count(*) AS n FROM lot_movements').get()!.n).toBe(0);
  });

  it('rolls back the balance when the movement ledger write fails and rejects stale balances', async () => {
    const current = await lot();
    const validated = validateInventoryMovement(
      { movementType: 'sample', quantity: '1 mg', occurredOn: '2026-09-08', reason: 'Analytical laboratory sample' },
      current,
      now,
    );
    if (!validated.ok) throw new Error(JSON.stringify(validated.errors));
    local.sqlite.exec("CREATE TRIGGER fail_movement BEFORE INSERT ON lot_movements BEGIN SELECT RAISE(ABORT, 'audit failure'); END");
    await expect(recordInventoryMovement(current, validated.value, staff, now)).rejects.toThrow();
    expect(local.sqlite.prepare('SELECT quantity_remaining FROM lots').get()!.quantity_remaining).toBe('10 mg');
    local.sqlite.exec('DROP TRIGGER fail_movement');
    local.beforeNextBatch(() => local.sqlite.prepare("UPDATE lots SET quantity_remaining = '9 mg'").run());
    expect((await recordInventoryMovement(current, validated.value, staff, now)).ok).toBe(false);
    expect(local.sqlite.prepare('SELECT count(*) AS n FROM lot_movements').get()!.n).toBe(0);
  });
});
