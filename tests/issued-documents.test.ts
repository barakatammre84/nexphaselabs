import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localD1 } from './helpers/local-d1';

/**
 * The issued-document store against real SQLite.
 *
 * These cover the three properties the store exists to guarantee and that no
 * pure test can reach: numbers are claimed atomically and handed back on
 * failure, a document's bytes are hashed and recorded, and a reissue can
 * never leave two documents both claiming to be current for one subject.
 */

const { env } = vi.hoisted(() => ({
  env: {} as { DB?: D1Database; DOCS?: R2Bucket },
}));
vi.mock('cloudflare:workers', () => ({ env }));

import { getDb } from '@/db';
import { issuedDocuments } from '@/db/schema';
import {
  claimSequence,
  currentDocument,
  documentHistory,
  issueDocument,
  issuedKey,
  peekSequence,
  releaseSequence,
  sha256Hex,
} from '@/lib/issued-documents';

/** Enough of R2 to record what was written and hand it back. */
function memoryBucket() {
  const objects = new Map<string, { body: Uint8Array; meta: Record<string, string> }>();
  return {
    objects,
    binding: {
      put: async (
        key: string,
        body: Uint8Array,
        options?: { customMetadata?: Record<string, string> },
      ) => {
        objects.set(key, { body, meta: options?.customMetadata ?? {} });
        return {} as R2Object;
      },
      get: async (key: string) => {
        const found = objects.get(key);
        return found ? ({ body: found.body } as unknown as R2ObjectBody) : null;
      },
    } as unknown as R2Bucket,
  };
}

let local: ReturnType<typeof localD1>;
let bucket: ReturnType<typeof memoryBucket>;

beforeEach(() => {
  local = localD1();
  bucket = memoryBucket();
  env.DB = local.binding;
  env.DOCS = bucket.binding;
});

afterEach(() => {
  local.sqlite.close();
  delete env.DB;
  delete env.DOCS;
});

const bytes = (text: string) => new TextEncoder().encode(text);

const issue = (over: Partial<Parameters<typeof issueDocument>[0]> = {}) =>
  issueDocument({
    kind: 'coa',
    subjectType: 'lot',
    subjectId: 'lot_test',
    documentNumber: 'COA-TEST-001',
    bytes: bytes('%PDF-1.7 first'),
    issuedBy: 'Synthetic QC (staff_test)',
    ...over,
  });

describe('claimSequence', () => {
  it('starts at one and never returns the same number twice', async () => {
    const claims = [];
    for (let i = 0; i < 5; i += 1) claims.push(await claimSequence('coa:TEST-001'));
    expect(claims).toEqual([1, 2, 3, 4, 5]);
    expect(new Set(claims).size).toBe(5);
  });

  it('keeps series independent', async () => {
    await claimSequence('coa:TEST-001');
    await claimSequence('coa:TEST-001');
    expect(await claimSequence('coa:TEST-002')).toBe(1);
  });

  it('peeks without taking', async () => {
    expect(await peekSequence('coa:TEST-001')).toBe(1);
    expect(await peekSequence('coa:TEST-001')).toBe(1);
    expect(await claimSequence('coa:TEST-001')).toBe(1);
    expect(await peekSequence('coa:TEST-001')).toBe(2);
  });

  it('refuses a malformed series key rather than writing one', async () => {
    await expect(claimSequence('nonsense key!')).rejects.toThrow(/Invalid document sequence key/);
  });
});

describe('releaseSequence', () => {
  it('hands a claimed number back so the series carries no unexplained gap', async () => {
    expect(await claimSequence('coa:TEST-001')).toBe(1);
    expect(await releaseSequence('coa:TEST-001', 1)).toBe(true);
    // The next caller gets the number that was given back, not the one after.
    expect(await claimSequence('coa:TEST-001')).toBe(1);
  });

  it('refuses to rewind past a number someone else has already taken', async () => {
    await claimSequence('coa:TEST-001'); // 1
    await claimSequence('coa:TEST-001'); // 2, by another caller
    // Rolling back the first claim would hand out 1 twice.
    expect(await releaseSequence('coa:TEST-001', 1)).toBe(false);
    expect(await claimSequence('coa:TEST-001')).toBe(3);
  });
});

describe('sha256Hex', () => {
  it('matches the known digest of an empty input', async () => {
    expect(await sha256Hex(new Uint8Array(0))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('hashes only the view, not the buffer behind it', async () => {
    // pdf-lib can hand back a Uint8Array that is a window onto a larger
    // buffer; hashing the whole buffer would digest bytes that are not part
    // of the document.
    const backing = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const view = backing.subarray(2, 5);
    expect(await sha256Hex(view)).toBe(await sha256Hex(new Uint8Array([3, 4, 5])));
  });
});

describe('issuedKey', () => {
  it('derives the key rather than letting a caller choose it', () => {
    expect(issuedKey('coa', 'COA-TEST-001')).toBe('issued/coa/COA-TEST-001.pdf');
  });

  it('rejects a number that could escape the prefix', () => {
    for (const bad of ['../secret', 'a', 'lower-case', '']) {
      expect(() => issuedKey('coa', bad)).toThrow(/Invalid document number/);
    }
  });
});

describe('issueDocument', () => {
  it('stores the bytes and records the hash of what was stored', async () => {
    const record = await issue();
    const stored = bucket.objects.get('issued/coa/COA-TEST-001.pdf');
    expect(stored).toBeDefined();
    expect(record.sha256).toBe(await sha256Hex(stored!.body));
    expect(record.sizeBytes).toBe(stored!.body.byteLength);
    expect(stored!.meta.sha256).toBe(record.sha256);
  });

  it('returns a createdAt that matches the row it wrote', async () => {
    const issuedAt = new Date('2026-09-04T11:02:19Z');
    const record = await issue({ issuedAt });
    const [row] = await getDb().select().from(issuedDocuments);
    expect(record.createdAt.getTime()).toBe(row.createdAt.getTime());
    expect(row.createdAt.getTime()).toBe(issuedAt.getTime());
  });

  it('leaves the first document in force', async () => {
    const record = await issue();
    const current = await currentDocument('coa', 'lot', 'lot_test');
    expect(current?.id).toBe(record.id);
    expect(current?.supersededById).toBeNull();
  });

  it('refuses to reuse a document number', async () => {
    await issue();
    await expect(issue()).rejects.toThrow();
  });
});

describe('reissue', () => {
  it('supersedes the old document and leaves exactly one in force', async () => {
    const first = await issue();
    const second = await issue({
      documentNumber: 'COA-TEST-001-R1',
      bytes: bytes('%PDF-1.7 second'),
      supersedes: { id: first.id, reason: 'Retest date corrected' },
    });

    const history = await documentHistory('lot', 'lot_test');
    expect(history).toHaveLength(2);

    const live = history.filter((d) => d.supersededById === null);
    expect(live).toHaveLength(1);
    expect(live[0].id).toBe(second.id);

    const old = history.find((d) => d.id === first.id)!;
    expect(old.supersededById).toBe(second.id);
    expect(old.supersedeReason).toBe('Retest date corrected');
    // The superseded document keeps its own number, hash and object.
    expect(old.documentNumber).toBe('COA-TEST-001');
    expect(bucket.objects.has(old.objectKey)).toBe(true);
  });

  it('refuses a second reissue that cites an already-superseded document', async () => {
    // Two staff both press reissue against the same certificate. Without the
    // marker guard both inserts would land and the lot would have two
    // documents each claiming to be current.
    const first = await issue();
    await issue({
      documentNumber: 'COA-TEST-001-R1',
      bytes: bytes('second'),
      supersedes: { id: first.id, reason: 'First reissue' },
    });

    await expect(
      issue({
        documentNumber: 'COA-TEST-001-R2',
        bytes: bytes('third'),
        supersedes: { id: first.id, reason: 'Second reissue, stale' },
      }),
    ).rejects.toThrow(/reissued by someone else/);

    const history = await documentHistory('lot', 'lot_test');
    expect(history).toHaveLength(2);
    expect(history.filter((d) => d.supersededById === null)).toHaveLength(1);
    // The losing attempt wrote no row at all, not even an orphan.
    expect(history.some((d) => d.documentNumber === 'COA-TEST-001-R2')).toBe(false);
  });

  it('keeps every superseded document readable', async () => {
    const first = await issue();
    await issue({
      documentNumber: 'COA-TEST-001-R1',
      bytes: bytes('second'),
      supersedes: { id: first.id, reason: 'Corrected' },
    });
    const history = await documentHistory('lot', 'lot_test');
    for (const doc of history) expect(bucket.objects.has(doc.objectKey)).toBe(true);
  });
});
