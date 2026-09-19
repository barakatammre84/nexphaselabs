import { describe, expect, it, vi } from 'vitest';
import { checkDependencies, checkMigrationState, MIGRATION_HISTORY_PROBE, SCHEMA_PROBES } from '@/lib/health';

function database(batch = vi.fn().mockResolvedValue(SCHEMA_PROBES.map(() => ({ success: true })))) {
  return { prepare: vi.fn((query: string) => ({ query })), batch } as unknown as Pick<D1Database, 'prepare' | 'batch'>;
}

describe('deployment dependency health', () => {
  it('probes every table and explicit columns without reading rows', () => {
    expect(SCHEMA_PROBES.length).toBeGreaterThanOrEqual(50);
    expect(SCHEMA_PROBES.every((query) => query.endsWith('LIMIT 0'))).toBe(true);
    expect(SCHEMA_PROBES.some((query) => query.includes('"lots"."superseded_by_id"'))).toBe(true);
    expect(SCHEMA_PROBES.some((query) => query.includes('"orders"."refund_due_cents"'))).toBe(true);
    expect(SCHEMA_PROBES.some((query) => query.includes('"payment_attempts"."state"'))).toBe(true);
    expect(SCHEMA_PROBES.some((query) => query.includes('"shipping_labels"."provider_ref"'))).toBe(true);
    expect(SCHEMA_PROBES.some((query) => query.includes('"operational_controls"."evidence_url"'))).toBe(true);
  });
  it('accepts an accessible bucket even when the probe object is absent', async () => {
    const head = vi.fn().mockResolvedValue(null);
    expect(await checkDependencies({ DB: database(), DOCS: { head } })).toEqual({ ok: true, db: 'ok', docs: 'ok' });
    expect(head).toHaveBeenCalledWith('_health/readiness-probe');
  });
  it('fails when bindings, schema or documents are unavailable', async () => {
    expect((await checkDependencies({})).ok).toBe(false);
    const DOCS = { head: vi.fn().mockResolvedValue(null) };
    expect(await checkDependencies({ DB: database(vi.fn().mockRejectedValue(new Error('missing column'))), DOCS }))
      .toEqual({ ok: false, db: 'unavailable', docs: 'ok' });
    expect(await checkDependencies({ DB: database(), DOCS: { head: vi.fn().mockRejectedValue(new Error('bucket denied')) } }))
      .toEqual({ ok: false, db: 'ok', docs: 'unavailable' });
    expect((await checkDependencies({ DB: database(vi.fn().mockResolvedValue([{ success: false }])), DOCS })).ok).toBe(false);
  });

  it('proves staging D1 has exactly the build migration history', async () => {
    const all = vi.fn().mockResolvedValue({
      results: [{ name: '0000_wild_living_lightning.sql' }, { name: '0001_fast_spyke.sql' }],
    });
    const DB = { prepare: vi.fn(() => ({ all })) } as unknown as Pick<D1Database, 'prepare'>;
    expect(await checkMigrationState(DB, ['0000_wild_living_lightning', '0001_fast_spyke'])).toEqual({
      ok: true,
      expected: ['0000_wild_living_lightning', '0001_fast_spyke'],
      applied: ['0000_wild_living_lightning', '0001_fast_spyke'],
    });
    expect(DB.prepare).toHaveBeenCalledWith(MIGRATION_HISTORY_PROBE);
    expect(
      await checkMigrationState(DB, ['0000_wild_living_lightning', '0001_fast_spyke', '0002_pending']),
    ).toMatchObject({ ok: false, applied: ['0000_wild_living_lightning', '0001_fast_spyke'] });
  });

  it('fails closed when the migration history table cannot be read', async () => {
    const DB = { prepare: vi.fn(() => ({ all: vi.fn().mockRejectedValue(new Error('missing table')) })) } as unknown as Pick<
      D1Database,
      'prepare'
    >;
    expect(await checkMigrationState(DB, ['0000_wild_living_lightning'])).toEqual({
      ok: false,
      expected: ['0000_wild_living_lightning'],
      applied: null,
    });
  });
});
