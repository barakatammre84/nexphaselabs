import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { localD1 } from './helpers/local-d1';

/**
 * Issuing a certificate against real SQLite and a stand-in bucket.
 *
 * The property worth pinning down here is that a lot's certificate history
 * follows the lot NUMBER. Corrections supersede the lot row and insert a new
 * one with a new id, so filing certificates against the row id would scatter
 * the history and let a reissue miss the document it replaces.
 */

const { env } = vi.hoisted(() => ({
  env: {} as { DB?: D1Database; DOCS?: R2Bucket },
}));
vi.mock('cloudflare:workers', () => ({ env }));

import { getDb } from '@/db';
import { lots, lotTests } from '@/db/schema';
import { issueCoa, previewCoa } from '@/lib/coa';
import { currentDocument, documentHistory } from '@/lib/issued-documents';
import { getLot } from '@/lib/lots-admin';
import type { StaffPrincipal } from '@/lib/staff-auth';

function memoryBucket() {
  const objects = new Map<string, Uint8Array>();
  return {
    objects,
    binding: {
      put: async (key: string, body: Uint8Array) => {
        objects.set(key, body);
        return {} as R2Object;
      },
      get: async (key: string) =>
        objects.has(key) ? ({ body: objects.get(key) } as unknown as R2ObjectBody) : null,
    } as unknown as R2Bucket,
  };
}

const staff = { id: 'stf_qc', name: 'Grace QC', role: 'qc' } as StaffPrincipal;
let local: ReturnType<typeof localD1>;
let bucket: ReturnType<typeof memoryBucket>;

beforeEach(async () => {
  local = localD1();
  bucket = memoryBucket();
  env.DB = local.binding;
  env.DOCS = bucket.binding;

  await getDb().insert(lots).values({
    id: 'lot_one',
    lotNumber: 'CERT-001',
    productCode: 'NPL-001',
    productName: 'Synthetic fixture',
    casNumber: '50-00-0',
    receivedAt: new Date('2026-08-01T00:00:00Z'),
    quantityReceived: '10 mg',
    quantityRemaining: '10 mg',
    manufacturerName: 'Fixture Manufacturing Co.',
    manufacturerAddress: '1 Fixture Road, Fixture City',
    identityConfirmed: true,
    purityResult: '99.1%',
    purityMethod: 'RP-HPLC',
    status: 'quarantine',
  });
  await getDb().insert(lotTests).values([
    {
      id: 'lt_identity',
      lotId: 'lot_one',
      testType: 'identity',
      method: 'LC-MS',
      result: 'Conforms',
      passed: true,
    },
    {
      id: 'lt_purity',
      lotId: 'lot_one',
      testType: 'purity',
      method: 'RP-HPLC',
      result: '99.1%',
      specification: 'NLT 98.0%',
      passed: true,
    },
  ]);
});

afterEach(() => {
  local.sqlite.close();
  delete env.DB;
  delete env.DOCS;
});

describe('previewCoa', () => {
  it('reports no blockers for a complete lot and names the number it would take', async () => {
    const preview = await previewCoa('CERT-001');
    expect(preview?.blockers).toEqual([]);
    expect(preview?.documentNumber).toBe('COA-CERT-001');
    expect(preview?.current).toBeNull();
  });

  it('stores nothing', async () => {
    await previewCoa('CERT-001');
    expect(bucket.objects.size).toBe(0);
    expect(await documentHistory('lot', 'CERT-001')).toHaveLength(0);
  });

  it('returns null for a lot that does not exist', async () => {
    expect(await previewCoa('NOPE-999')).toBeNull();
  });

  it('lists an unassessed result as a blocker', async () => {
    await getDb().insert(lotTests).values({
      id: 'lt_water',
      lotId: 'lot_one',
      testType: 'water',
      method: 'Karl Fischer',
      result: '3.1%',
      passed: null,
    });
    const preview = await previewCoa('CERT-001');
    expect(preview?.blockers.some((b) => b.includes('no pass or fail recorded'))).toBe(true);
  });
});

describe('issueCoa', () => {
  it('writes the PDF, records the issue and points the lot at it', async () => {
    const result = await issueCoa('CERT-001', staff);
    expect(result).toMatchObject({ ok: true, documentNumber: 'COA-CERT-001' });

    const stored = bucket.objects.get('issued/coa/COA-CERT-001.pdf');
    expect(stored).toBeDefined();
    expect(new TextDecoder().decode(stored!.slice(0, 5))).toBe('%PDF-');

    const lot = await getLot('CERT-001');
    expect(lot?.coaKey).toBe('issued/coa/COA-CERT-001.pdf');
  });

  it('files the certificate against the lot number, not the row id', async () => {
    await issueCoa('CERT-001', staff);
    const [record] = await documentHistory('lot', 'CERT-001');
    expect(record.subjectId).toBe('CERT-001');
  });

  it('refuses when a blocker stands, and takes no number', async () => {
    await getDb()
      .update(lots)
      .set({ manufacturerAddress: null })
      .where(eq(lots.id, 'lot_one'));
    const result = await issueCoa('CERT-001', staff);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toContain('16 CCR 1736.9(d)');
    // A refused attempt must not burn a certificate number.
    const preview = await previewCoa('CERT-001');
    expect(preview?.documentNumber).toBe('COA-CERT-001');
  });

  it('numbers a reissue and supersedes the previous certificate', async () => {
    await issueCoa('CERT-001', staff);
    const second = await issueCoa('CERT-001', staff, { reason: 'Purity restated' });
    expect(second).toMatchObject({ ok: true, documentNumber: 'COA-CERT-001-R1' });

    const history = await documentHistory('lot', 'CERT-001');
    expect(history).toHaveLength(2);
    expect(history.filter((d) => d.supersededById === null)).toHaveLength(1);

    const current = await currentDocument('coa', 'lot', 'CERT-001');
    expect(current?.documentNumber).toBe('COA-CERT-001-R1');

    const superseded = history.find((d) => d.documentNumber === 'COA-CERT-001')!;
    expect(superseded.supersedeReason).toBe('Purity restated');
    // Both files survive.
    expect(bucket.objects.has('issued/coa/COA-CERT-001.pdf')).toBe(true);
    expect(bucket.objects.has('issued/coa/COA-CERT-001-R1.pdf')).toBe(true);
  });

  it('leaves the lot pointing at the reissue', async () => {
    await issueCoa('CERT-001', staff);
    await issueCoa('CERT-001', staff, { reason: 'Corrected' });
    const lot = await getLot('CERT-001');
    expect(lot?.coaKey).toBe('issued/coa/COA-CERT-001-R1.pdf');
  });

  it('refuses a rejected lot', async () => {
    await getDb().update(lots).set({ status: 'rejected' }).where(eq(lots.id, 'lot_one'));
    const result = await issueCoa('CERT-001', staff);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.includes('rejected'))).toBe(true);
  });

  it('reports a missing lot rather than throwing', async () => {
    expect(await issueCoa('NOPE-999', staff)).toEqual({
      ok: false,
      errors: ['Lot not found.'],
    });
  });
});
