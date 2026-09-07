import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localD1 } from './helpers/local-d1';

const { env } = vi.hoisted(() => ({ env: {} as { DB?: D1Database } }));
vi.mock('cloudflare:workers', () => ({ env }));

import { getDb } from '@/db';
import { lots } from '@/db/schema';
import { searchReleasedLots } from '@/lib/lots-public';

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
});
