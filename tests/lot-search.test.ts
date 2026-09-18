import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { localD1 } from './helpers/local-d1';

const { env } = vi.hoisted(() => ({ env: {} as { DB?: D1Database } }));
vi.mock('cloudflare:workers', () => ({ env }));

import { getDb } from '@/db';
import { lots, lotTests } from '@/db/schema';
import { getPublicLot, searchReleasedLots } from '@/lib/lots-public';
import { listLots } from '@/lib/lots-admin';

let local: ReturnType<typeof localD1>;

beforeEach(async () => {
  local = localD1();
  env.DB = local.binding;

  await getDb()
    .insert(lots)
    .values([
      {
        id: 'released_current',
        lotNumber: 'LIVE-001',
        productCode: 'NPL-001',
        productName: 'Alpha material',
        casNumber: '50-00-0',
        accessionNumber: 'ACC-2026-001',
        analyticalLab: 'Synthetic Analytical Lab',
        testingStandard: 'Fixture panel v1',
        status: 'released',
        receivedAt: new Date(),
      },
      {
        id: 'quarantined',
        lotNumber: 'HIDDEN-001',
        productCode: 'NPL-002',
        productName: 'Hidden material',
        casNumber: '60-00-0',
        accessionNumber: 'ACC-HIDDEN',
        status: 'quarantine',
        receivedAt: new Date(),
      },
      {
        id: 'released_superseded',
        lotNumber: 'OLD-001',
        productCode: 'NPL-003',
        productName: 'Historical material',
        casNumber: '70-00-0',
        accessionNumber: 'ACC-OLD',
        status: 'released',
        receivedAt: new Date(),
        supersededById: 'released_current',
      },
    ]);
});

afterEach(() => {
  local.sqlite.close();
  delete env.DB;
});

describe('public released-lot search', () => {
  it('searches lot, accession, product code, and product name case-insensitively', async () => {
    for (const query of ['live-001', 'acc-2026', 'npl-001', 'alpha']) {
      expect(
        (await searchReleasedLots(query)).map((hit) => hit.lotNumber),
      ).toEqual(['LIVE-001']);
    }
  });

  it('never exposes quarantined or superseded lot records', async () => {
    expect(await searchReleasedLots('hidden')).toEqual([]);
    expect(await searchReleasedLots('acc-old')).toEqual([]);
  });

  it('treats SQL wildcard characters as literal search text', async () => {
    expect(await searchReleasedLots('A%')).toEqual([]);
    expect(await searchReleasedLots('A_')).toEqual([]);
  });
  it('paginates and searches the staff lot queue server-side', async () => {
    for (let i = 0; i < 53; i += 1) {
      await getDb().insert(lots).values({
        id: `queue_${i}`, lotNumber: `QUEUE-${String(i).padStart(3, '0')}`,
        productCode: 'NPL-Q', productName: i === 51 ? 'Target material' : 'Queue material',
        casNumber: '80-00-0', receivedAt: new Date(1700000000000 + i * 1000),
      });
    }
    const first = await listLots();
    const second = await listLots({ page: 2 });
    expect(first.rows).toHaveLength(50);
    expect(first.hasNext).toBe(true);
    expect(second.rows).toHaveLength(5);
    expect((await listLots({ query: 'target' })).rows.map((row) => row.lotNumber)).toEqual(['QUEUE-051']);
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    await getDb().update(lots).set({ assignedTo: 'staff_quality', assignedName: 'Quality Team', serviceDueAt: tomorrow }).where(eq(lots.lotNumber, 'QUEUE-051'));
    expect((await listLots({ owner: 'quality' })).rows.map((row) => row.lotNumber)).toEqual(['QUEUE-051']);
    expect((await listLots({ due: 'upcoming' })).rows.map((row) => row.lotNumber)).toEqual(['QUEUE-051']);
  });
});

describe('the public lot record', () => {
  it('never publishes an endotoxin result, though staff recorded one', async () => {
    await getDb().insert(lotTests).values([
      { id: 'test_identity', lotId: 'released_current', testType: 'identity', method: 'ESI-MS', result: 'Conforms', passed: true },
      { id: 'test_endotoxin', lotId: 'released_current', testType: 'endotoxin', method: 'LAL', result: 'Below 1 EU/mg', passed: true },
    ]);
    const lot = await getPublicLot('LIVE-001');
    expect(lot?.tests.map((result) => result.testType)).toEqual(['identity']);
  });
});
