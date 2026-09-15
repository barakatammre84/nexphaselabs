import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localD1 } from './helpers/local-d1';

const { env } = vi.hoisted(() => ({ env: {} as Record<string, unknown> }));
vi.mock('cloudflare:workers', () => ({ env }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

import { seedCommerceFixture, syntheticOrder } from './helpers/commerce-fixture';
import { reservationEligibility } from '@/lib/inventory-reservations';
import { validateLotCorrection } from '@/lib/lot-rules';
import { correctLot, getLot, lotToIntakeInput } from '@/lib/lots-admin';
import type { StaffPrincipal } from '@/lib/staff-auth';

/**
 * Correcting a released lot writes a new lot row and supersedes the old one. Stock
 * already reserved for open orders used to stay on the superseded row, so those
 * orders could not ship; and a correction could raise the sellable quantity of a
 * released lot without the hold an inventory movement requires.
 */

const staff = { id: 'staff_qc', name: 'Synthetic QC', role: 'qc' } as StaffPrincipal;
let local: ReturnType<typeof localD1>;

beforeEach(async () => {
  local = localD1();
  Object.assign(env, {
    DB: local.binding,
    APP_ENV: 'staging',
    OPEN_CHECKOUT_ENABLED: 'true',
    INVENTORY_RESERVATION_MINUTES: '30',
    PUBLIC_ORIGIN: 'https://staging.example.invalid',
  });
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('No external calls')));
  await seedCommerceFixture();
  // A released lot keeps its manufacturer on record (16 CCR 1736.9(d)); the shared fixture omits it.
  local.sqlite
    .prepare("UPDATE lots SET manufacturer_name = 'Synthetic Manufacturer', manufacturer_address = '1 Synthesis Way, Test City' WHERE id = 'l'")
    .run();
});

afterEach(() => {
  vi.unstubAllGlobals();
  local.sqlite.close();
  for (const key of Object.keys(env)) delete env[key];
});

describe('correcting a released lot', () => {
  it('moves the reservations of open orders to the corrected record', async () => {
    const order = await syntheticOrder(1);
    expect((await reservationEligibility(order.detail.order.id)).tracked).toBe(true);

    const lot = await getLot('SYNTHETIC-LOT');
    if (!lot) throw new Error('fixture lot missing');
    const validated = validateLotCorrection(lotToIntakeInput(lot), { storageLocation: 'Freezer B' }, 'Storage location typo at receipt');
    if (!validated.ok) throw new Error(JSON.stringify(validated));
    const corrected = await correctLot(lot, validated, staff);
    if (!corrected.ok) throw new Error(corrected.error);

    const held = local.sqlite.prepare('SELECT lot_id FROM inventory_reservations').all() as { lot_id: string }[];
    expect(held.length).toBeGreaterThan(0);
    expect(held.every((row) => row.lot_id === corrected.newId)).toBe(true);
    expect(await reservationEligibility(order.detail.order.id)).toMatchObject({ tracked: true, valid: true });
  });

  it('refuses to change the received quantity of a released lot until it is on hold', async () => {
    const lot = await getLot('SYNTHETIC-LOT');
    if (!lot) throw new Error('fixture lot missing');
    const validated = validateLotCorrection(lotToIntakeInput(lot), { quantityReceived: '100 mg' }, 'Receiving scale misread');
    if (!validated.ok) throw new Error(JSON.stringify(validated));

    expect(await correctLot(lot, validated, staff)).toMatchObject({ ok: false });
    expect(local.sqlite.prepare('SELECT count(*) AS n FROM lots').get()).toEqual({ n: 1 });
    expect(local.sqlite.prepare("SELECT quantity_remaining FROM lots WHERE id = 'l'").get()).toEqual({
      quantity_remaining: '10 mg',
    });
  });
});
