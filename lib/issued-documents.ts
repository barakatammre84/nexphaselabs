import { env } from 'cloudflare:workers';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { documentSequences, issuedDocuments, type IssuedDocument } from '@/db/schema';

/**
 * The store behind every document this business issues.
 *
 * Three properties this module exists to guarantee:
 *
 *  1. A document number is claimed atomically and never reused. Invoice
 *     numbers in particular must be a gapless-per-year, single-use series.
 *  2. The bytes are hashed before they are stored, and the hash is kept. A
 *     certificate that turns up in a dispute can be checked against the
 *     record without trusting the file it came in.
 *  3. Nothing is overwritten. Reissuing supersedes: the old row keeps its
 *     object, its hash and its number, and points at the replacement.
 */

export const DOCUMENT_KINDS = ['coa', 'invoice', 'packing_slip', 'ghs_label'] as const;
export type IssuedDocumentKind = (typeof DOCUMENT_KINDS)[number];

export const DOCUMENT_KIND_LABEL: Record<IssuedDocumentKind, string> = {
  coa: 'Certificate of analysis',
  invoice: 'Invoice',
  packing_slip: 'Packing slip',
  ghs_label: 'Container label',
};

export type SubjectType = 'lot' | 'order' | 'product';

export function isDocumentKind(value: string): value is IssuedDocumentKind {
  return (DOCUMENT_KINDS as readonly string[]).includes(value);
}

function bucket(): R2Bucket {
  if (!env.DOCS) {
    throw new Error(
      'Cloudflare R2 binding `DOCS` is unavailable. Check `r2_buckets` in wrangler.jsonc.',
    );
  }
  return env.DOCS;
}

/* ------------------------------------------------------------------------ */
/* Numbering                                                                  */
/* ------------------------------------------------------------------------ */

const SEQUENCE_KEY_PATTERN = /^[a-z_]+:[A-Za-z0-9-]{1,40}$/;

/**
 * Take the next number in a series.
 *
 * `UPDATE … SET next_value = next_value + 1 … RETURNING next_value` is a
 * single statement, so D1 applies it atomically and two concurrent callers
 * get different values. The row is created first with `INSERT OR IGNORE`,
 * which is a no-op if the series already exists.
 */
export async function claimSequence(key: string): Promise<number> {
  if (!SEQUENCE_KEY_PATTERN.test(key)) {
    throw new Error(`Invalid document sequence key: ${key}`);
  }
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  await db.run(
    sql`INSERT OR IGNORE INTO document_sequences (key, next_value, updated_at) VALUES (${key}, 1, ${now})`,
  );
  const claimed = await db.get<{ next_value: number }>(
    sql`UPDATE document_sequences SET next_value = next_value + 1, updated_at = ${now} WHERE key = ${key} RETURNING next_value - 1 AS next_value`,
  );
  if (!claimed) throw new Error(`Could not claim a number in series ${key}.`);
  return claimed.next_value;
}

/** Peek at the number `claimSequence` would return, without taking it. */
export async function peekSequence(key: string): Promise<number> {
  const db = getDb();
  const row = await db.query.documentSequences.findFirst({
    where: eq(documentSequences.key, key),
  });
  return row?.nextValue ?? 1;
}

/* ------------------------------------------------------------------------ */
/* Hashing                                                                    */
/* ------------------------------------------------------------------------ */

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  // Copy into a standalone ArrayBuffer: a Uint8Array from pdf-lib may be a
  // view over a larger buffer, and digesting the whole buffer would hash
  // bytes that are not part of the document.
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', copy.buffer);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/* ------------------------------------------------------------------------ */
/* Issuing                                                                    */
/* ------------------------------------------------------------------------ */

const NUMBER_PATTERN = /^[A-Z0-9][A-Z0-9.\-/]{2,47}$/;

/** `issued/<kind>/<number>.pdf`, with the number made key-safe. */
export function issuedKey(kind: IssuedDocumentKind, documentNumber: string): string {
  if (!NUMBER_PATTERN.test(documentNumber)) {
    throw new Error(`Invalid document number: ${documentNumber}`);
  }
  return `issued/${kind}/${documentNumber.replace(/\//g, '_')}.pdf`;
}

export type IssueInput = {
  kind: IssuedDocumentKind;
  subjectType: SubjectType;
  subjectId: string;
  documentNumber: string;
  bytes: Uint8Array;
  issuedBy: string;
  issuedAt?: Date;
  /** The document this one replaces, if any. */
  supersedes?: { id: string; reason: string } | null;
};

/**
 * Write the bytes to R2 and record the issue.
 *
 * Order matters: the object goes to the bucket first, and the row is written
 * second. A crash between the two leaves an orphaned object, which is
 * inert. The reverse order would leave a row pointing at a document that does
 * not exist, which a customer would experience as a broken certificate link.
 */
export async function issueDocument(input: IssueInput): Promise<IssuedDocument> {
  const db = getDb();
  const issuedAt = input.issuedAt ?? new Date();
  const key = issuedKey(input.kind, input.documentNumber);
  const sha256 = await sha256Hex(input.bytes);

  await bucket().put(key, input.bytes, {
    httpMetadata: { contentType: 'application/pdf' },
    customMetadata: {
      kind: input.kind,
      documentNumber: input.documentNumber,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      issuedBy: input.issuedBy,
      issuedAt: issuedAt.toISOString(),
      sha256,
    },
  });

  const id = `doc_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
  const row = {
    id,
    kind: input.kind,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    documentNumber: input.documentNumber,
    objectKey: key,
    contentType: 'application/pdf',
    sizeBytes: input.bytes.byteLength,
    sha256,
    issuedBy: input.issuedBy,
    issuedAt,
    supersededById: null,
    supersededAt: null,
    supersedeReason: null,
  };

  const insert = db.insert(issuedDocuments).values(row);
  if (input.supersedes) {
    // Guarded: only supersede a document that is still in force, so a second
    // reissue cannot overwrite the pointer set by the first.
    await db.batch([
      insert,
      db
        .update(issuedDocuments)
        .set({
          supersededById: id,
          supersededAt: issuedAt,
          supersedeReason: input.supersedes.reason,
        })
        .where(
          and(
            eq(issuedDocuments.id, input.supersedes.id),
            isNull(issuedDocuments.supersededById),
          ),
        ),
    ]);
  } else {
    await insert;
  }

  return { ...row, createdAt: issuedAt } as IssuedDocument;
}

/* ------------------------------------------------------------------------ */
/* Reading                                                                    */
/* ------------------------------------------------------------------------ */

/** The document of this kind currently in force for a subject, if any. */
export async function currentDocument(
  kind: IssuedDocumentKind,
  subjectType: SubjectType,
  subjectId: string,
): Promise<IssuedDocument | null> {
  const db = getDb();
  const row = await db.query.issuedDocuments.findFirst({
    where: and(
      eq(issuedDocuments.kind, kind),
      eq(issuedDocuments.subjectType, subjectType),
      eq(issuedDocuments.subjectId, subjectId),
      isNull(issuedDocuments.supersededById),
    ),
    orderBy: [desc(issuedDocuments.issuedAt)],
  });
  return row ?? null;
}

/** Every document ever issued for a subject, newest first, superseded included. */
export async function documentHistory(
  subjectType: SubjectType,
  subjectId: string,
): Promise<IssuedDocument[]> {
  const db = getDb();
  return db.query.issuedDocuments.findMany({
    where: and(
      eq(issuedDocuments.subjectType, subjectType),
      eq(issuedDocuments.subjectId, subjectId),
    ),
    orderBy: [desc(issuedDocuments.issuedAt)],
  });
}

export async function documentById(id: string): Promise<IssuedDocument | null> {
  const db = getDb();
  const row = await db.query.issuedDocuments.findFirst({
    where: eq(issuedDocuments.id, id),
  });
  return row ?? null;
}

export async function documentByNumber(
  documentNumber: string,
): Promise<IssuedDocument | null> {
  const db = getDb();
  const row = await db.query.issuedDocuments.findFirst({
    where: eq(issuedDocuments.documentNumber, documentNumber),
  });
  return row ?? null;
}

/**
 * Fetch the stored bytes. The caller must already have decided that the
 * requester may see this document; nothing here checks permission.
 */
export async function getIssuedObject(key: string): Promise<R2ObjectBody | null> {
  if (!key.startsWith('issued/')) return null;
  return bucket().get(key);
}
