import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localD1 } from './helpers/local-d1';
import { checkDependencies } from '@/lib/health';
const { env } = vi.hoisted(() => ({ env: {} as { DB?: D1Database } }));
vi.mock('cloudflare:workers', () => ({ env }));
import { getDb } from '@/db';
import { lots, lotTests } from '@/db/schema';
import { addLotTest, attachLotDocument, getLot, setLotCost, setLotDisposition } from '@/lib/lots-admin';
import { lotFamilyIds } from '@/lib/lot-family';
import type { StaffPrincipal } from '@/lib/staff-auth';

let local: ReturnType<typeof localD1>;
const staff = { id: 'staff_test', name: 'Synthetic QC', role: 'qc' } as StaffPrincipal;
beforeEach(async () => {
  local = localD1();
  env.DB = local.binding;
  await getDb().insert(lots).values({
    id: 'lot_test', lotNumber: 'TEST-001', productCode: 'NPL-001', productName: 'Synthetic fixture',
    casNumber: '50-00-0', receivedAt: new Date(), quantityReceived: '10 mg', quantityRemaining: '10 mg',
    manufacturerName: 'Fixture manufacturer', manufacturerAddress: 'Fixture address', coaKey: 'lots/TEST-001/coa/test.pdf',
    identityConfirmed: true, purityResult: '99%',
  });
  await getDb().insert(lotTests).values([
    { id: 'test_identity', lotId: 'lot_test', testType: 'identity', method: 'MS', result: 'Conforms', passed: true },
    { id: 'test_purity', lotId: 'lot_test', testType: 'purity', method: 'HPLC', result: '99%', passed: true },
  ]);
});
afterEach(() => { local.sqlite.close(); delete env.DB; });

describe('fresh migrations and lot transaction invariants', () => {
  it('replays every migration into a fresh database matching all runtime columns', async () => {
    expect(await checkDependencies({ DB: local.binding, DOCS: { head: vi.fn().mockResolvedValue(null) } }))
      .toEqual({ ok: true, db: 'ok', docs: 'ok' });
  });
  it('rejects an empty database and a missing application column', async () => {
    const empty = localD1(false);
    expect((await checkDependencies({ DB: empty.binding, DOCS: { head: vi.fn().mockResolvedValue(null) } })).ok).toBe(false);
    empty.sqlite.close();
    local.sqlite.exec('ALTER TABLE lots RENAME COLUMN purity_result TO missing_purity');
    expect((await checkDependencies({ DB: local.binding, DOCS: { head: vi.fn().mockResolvedValue(null) } })).db).toBe('unavailable');
  });
  it('records a named release and its event together exactly once', async () => {
    const lot = (await getLot('TEST-001'))!;
    expect((await setLotDisposition(lot, 'release', null, staff)).ok).toBe(true);
    expect((await setLotDisposition(lot, 'release', null, staff)).ok).toBe(false);
    expect(local.sqlite.prepare('SELECT count(*) AS n FROM lot_status_events').get()!.n).toBe(1);
    expect((await getLot('TEST-001'))!.releasedBy).toContain('Synthetic QC');
  });
  it('rolls the release back when its audit insert fails', async () => {
    local.sqlite.exec("CREATE TRIGGER fail_audit BEFORE INSERT ON lot_status_events BEGIN SELECT RAISE(ABORT, 'test failure'); END");
    await expect(setLotDisposition((await getLot('TEST-001'))!, 'release', null, staff)).rejects.toThrow();
    expect((await getLot('TEST-001'))!.status).toBe('quarantine');
  });
  it('refuses release when another result arrives between review and commit', async () => {
    local.beforeNextBatch(() => local.sqlite.exec("INSERT INTO lot_tests (id, lot_id, test_type, method, result, passed) VALUES ('late', 'lot_test', 'purity', 'HPLC', 'Failed', 0)"));
    expect((await setLotDisposition((await getLot('TEST-001'))!, 'release', null, staff)).ok).toBe(false);
    expect((await getLot('TEST-001'))!.status).toBe('quarantine');
    expect(local.sqlite.prepare('SELECT count(*) AS n FROM lot_status_events').get()!.n).toBe(0);
  });
  it('refuses a stale corrected row and does not create a false event', async () => {
    local.beforeNextBatch(() => local.sqlite.exec("UPDATE lots SET superseded_by_id = 'replacement' WHERE id = 'lot_test'"));
    expect((await setLotDisposition((await getLot('TEST-001'))!, 'release', null, staff)).ok).toBe(false);
    expect(local.sqlite.prepare('SELECT status FROM lots').get()!.status).toBe('quarantine');
    expect(local.sqlite.prepare('SELECT count(*) AS n FROM lot_status_events').get()!.n).toBe(0);
  });
  it('requires hold before new test results and blocks release after failure', async () => {
    await setLotDisposition((await getLot('TEST-001'))!, 'release', null, staff);
    const value = { testType: 'purity' as const, analyte: null, method: 'HPLC', result: '80%', specification: '>95%', passed: false, testedBy: null, testedAtDate: null };
    await expect(addLotTest((await getLot('TEST-001'))!, value, staff)).rejects.toThrow('Hold');
    expect(local.sqlite.prepare('SELECT count(*) AS n FROM lot_tests').get()!.n).toBe(2);
    expect(await setLotDisposition((await getLot('TEST-001'))!, 'hold', 'Pending analytical testing', staff)).toEqual({ ok: true, status: 'on_hold' });
    await addLotTest((await getLot('TEST-001'))!, value, staff);
    expect((await getLot('TEST-001'))!.purityResult).toBe('80%');
    expect((await setLotDisposition((await getLot('TEST-001'))!, 'release', null, staff)).ok).toBe(false);
  });
  it('keeps document pointer and history consistent and rejects stale correction uploads', async () => {
    const stored = { key: 'lots/TEST-001/coa/new.pdf', contentType: 'application/pdf', size: 10, uploadedAt: new Date() };
    await attachLotDocument((await getLot('TEST-001'))!, 'coa', stored, 'test.pdf', staff);
    expect((await getLot('TEST-001'))!.coaKey).toBe(stored.key);
    const stale = (await getLot('TEST-001'))!;
    local.sqlite.exec("UPDATE lots SET superseded_by_id = 'replacement' WHERE id = 'lot_test'");
    await expect(attachLotDocument(stale, 'coa', { ...stored, key: 'lots/TEST-001/coa/stale.pdf' }, 'stale.pdf', staff)).rejects.toThrow('corrected');
    expect(local.sqlite.prepare('SELECT count(*) AS n FROM lot_documents').get()!.n).toBe(1);
    expect(local.sqlite.prepare('SELECT superseded_at FROM lot_documents').get()!.superseded_at).toBeNull();
  });
  it('does not record cost events for a stale cost change', async () => {
    const lot = (await getLot('TEST-001'))!;
    await setLotCost(lot, 123, 'Test cost', staff);
    await expect(setLotCost(lot, 456, 'Stale cost', staff)).rejects.toThrow('changed');
    expect((await getLot('TEST-001'))!.costCents).toBe(123);
    expect(local.sqlite.prepare('SELECT count(*) AS n FROM lot_status_events').get()!.n).toBe(1);
  });
  it('includes more than 50 correction versions and terminates on corrupt cycles', async () => {
    for (let i = 0; i < 55; i++) {
      local.sqlite.prepare("INSERT INTO lots (id, lot_number, product_code, product_name, cas_number, received_at, superseded_by_id) VALUES (?, 'TEST-001', 'NPL-001', 'Fixture', '50-00-0', 1, ?)")
        .run(`older_${i}`, i === 0 ? 'lot_test' : `older_${i - 1}`);
    }
    expect(await lotFamilyIds('lot_test')).toHaveLength(56);
    local.sqlite.exec("UPDATE lots SET superseded_by_id = 'older_54' WHERE id = 'lot_test'");
    expect(await lotFamilyIds('lot_test')).toHaveLength(56);
  });
});
