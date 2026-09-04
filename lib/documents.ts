import { env } from 'cloudflare:workers';

/**
 * Private document store for lot-level analytical files.
 *
 * Files live in the `DOCS` R2 bucket, which has no public access. Nothing in
 * this module produces a public URL: retrieval always goes through a route
 * handler that decides — against the lot's status in D1 — whether the caller
 * may see the file. Object keys are derived here so they are predictable and
 * cannot be chosen by a caller.
 *
 * Key layout:  lots/<LOT-NUMBER>/<type>/<uploadId>.<ext>
 *
 * A new upload never overwrites an earlier one; the lot row points at the key
 * currently in force, and superseded files remain in the bucket for the
 * record, matching the never-delete rule for lot rows.
 */

export const DOCUMENT_TYPES = [
  'coa',
  'chromatogram',
  'mass_spec',
  'sds',
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_LABEL: Record<DocumentType, string> = {
  coa: 'Certificate of analysis',
  chromatogram: 'HPLC chromatogram',
  mass_spec: 'Mass spectrum',
  sds: 'Safety data sheet',
};

/** Allowed upload types. Analytical files arrive as PDF or as instrument image exports. */
const ALLOWED_CONTENT_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
};

export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;

const LOT_NUMBER_PATTERN = /^[A-Z0-9-]{3,32}$/;

export function isDocumentType(value: string): value is DocumentType {
  return (DOCUMENT_TYPES as readonly string[]).includes(value);
}

function bucket(): R2Bucket {
  if (!env.DOCS) {
    throw new Error(
      'Cloudflare R2 binding `DOCS` is unavailable. Check `r2_buckets` in wrangler.jsonc.',
    );
  }
  return env.DOCS;
}

function assertLotNumber(lotNumber: string): string {
  const normalised = lotNumber.trim().toUpperCase();
  if (!LOT_NUMBER_PATTERN.test(normalised)) {
    throw new Error('Invalid lot number.');
  }
  return normalised;
}

export function documentKey(
  lotNumber: string,
  type: DocumentType,
  uploadId: string,
  ext: string,
): string {
  const lot = assertLotNumber(lotNumber);
  if (!/^[a-z0-9]{8,64}$/.test(uploadId) || !/^[a-z0-9]{2,5}$/.test(ext)) {
    throw new Error('Invalid document key component.');
  }
  return `lots/${lot}/${type}/${uploadId}.${ext}`;
}

export type StoredDocument = {
  key: string;
  contentType: string;
  size: number;
  uploadedAt: Date;
};

/**
 * Store a file for a lot. Returns the object key to record on the lot row.
 * Rejects anything that is not a PDF or an image, and anything over the size
 * limit, before touching the bucket.
 */
export async function putLotDocument(
  lotNumber: string,
  type: DocumentType,
  file: File | Blob,
  meta: { uploadedBy: string; originalName?: string },
): Promise<StoredDocument> {
  const contentType = file.type;
  const ext = ALLOWED_CONTENT_TYPES[contentType];
  if (!ext)
    throw new Error(`Unsupported document type: ${contentType || 'unknown'}.`);
  if (file.size === 0) throw new Error('Empty file.');
  if (file.size > MAX_DOCUMENT_BYTES)
    throw new Error('File exceeds the 25 MB limit.');

  const uploadId = crypto.randomUUID().replace(/-/g, '');
  const key = documentKey(lotNumber, type, uploadId, ext);
  const uploadedAt = new Date();

  await bucket().put(key, file.stream(), {
    httpMetadata: { contentType },
    customMetadata: {
      lotNumber: assertLotNumber(lotNumber),
      documentType: type,
      uploadedBy: meta.uploadedBy,
      uploadedAt: uploadedAt.toISOString(),
      ...(meta.originalName
        ? { originalName: meta.originalName.slice(0, 200) }
        : {}),
    },
  });

  return { key, contentType, size: file.size, uploadedAt };
}

/**
 * Fetch a stored object by key. The caller is responsible for having already
 * checked that the requester is allowed to see this lot's documents.
 */
/**
 * Prefixes a lot's document key may legitimately have: `lots/` for a file
 * uploaded against the lot, `issued/` for a certificate this business
 * generated and then attached to it. The check is here to stop a key that did
 * not come from our own records reaching the bucket, not to distinguish the
 * two — both are ours.
 */
const LOT_KEY_PREFIXES = ['lots/', 'issued/'];

function isLotKey(key: string): boolean {
  return LOT_KEY_PREFIXES.some((prefix) => key.startsWith(prefix));
}

export async function getLotDocument(
  key: string,
): Promise<R2ObjectBody | null> {
  if (!isLotKey(key)) return null;
  return bucket().get(key);
}

export async function headLotDocument(key: string): Promise<R2Object | null> {
  if (!isLotKey(key)) return null;
  return bucket().head(key);
}

/* ------------------------------------------------------------------------ */
/* Organisation verification documents                                       */
/* ------------------------------------------------------------------------ */

/**
 * Supporting documents an applicant uploads for verification. Same bucket,
 * separate prefix, staff-only retrieval. Key: organizations/<orgId>/<kind>/<uploadId>.<ext>
 */
export async function putOrganizationDocument(
  organizationId: string,
  kind: string,
  file: File | Blob,
  meta: { uploadedBy: string; originalName?: string },
): Promise<StoredDocument> {
  if (
    !/^org_[a-z0-9]{8,32}$/.test(organizationId) ||
    !/^[a-z_]{3,20}$/.test(kind)
  ) {
    throw new Error('Invalid document key component.');
  }
  const contentType = file.type;
  const ext = ALLOWED_CONTENT_TYPES[contentType];
  if (!ext)
    throw new Error(`Unsupported document type: ${contentType || 'unknown'}.`);
  if (file.size === 0) throw new Error('Empty file.');
  if (file.size > MAX_DOCUMENT_BYTES)
    throw new Error('File exceeds the 25 MB limit.');

  const uploadId = crypto.randomUUID().replace(/-/g, '');
  const key = `organizations/${organizationId}/${kind}/${uploadId}.${ext}`;
  const uploadedAt = new Date();
  await bucket().put(key, file.stream(), {
    httpMetadata: { contentType },
    customMetadata: {
      organizationId,
      kind,
      uploadedBy: meta.uploadedBy,
      uploadedAt: uploadedAt.toISOString(),
      ...(meta.originalName
        ? { originalName: meta.originalName.slice(0, 200) }
        : {}),
    },
  });
  return { key, contentType, size: file.size, uploadedAt };
}

export async function getOrganizationDocument(
  key: string,
): Promise<R2ObjectBody | null> {
  if (!key.startsWith('organizations/')) return null;
  return bucket().get(key);
}

/* ------------------------------------------------------------------------ */
/* Product documents (safety data sheets)                                    */
/* ------------------------------------------------------------------------ */

/** SDS for a product. PDF only. Key: products/<CODE>/sds/<uploadId>.pdf */
export async function putProductDocument(
  productCode: string,
  kind: 'sds',
  file: File | Blob,
  meta: { uploadedBy: string; originalName?: string },
): Promise<StoredDocument> {
  const code = productCode.trim().toUpperCase();
  if (!/^NPL-\d{3,4}$/.test(code)) throw new Error('Invalid product code.');
  if (file.type !== 'application/pdf')
    throw new Error(`Unsupported document type: ${file.type || 'unknown'}.`);
  if (file.size === 0) throw new Error('Empty file.');
  if (file.size > MAX_DOCUMENT_BYTES)
    throw new Error('File exceeds the 25 MB limit.');
  // The declared type is client-supplied; check the file really starts as a PDF.
  if ((await file.slice(0, 5).text()) !== '%PDF-')
    throw new Error('Unsupported document type: not a PDF.');
  const uploadId = crypto.randomUUID().replace(/-/g, '');
  const key = `products/${code}/${kind}/${uploadId}.pdf`;
  const uploadedAt = new Date();
  await bucket().put(key, file.stream(), {
    httpMetadata: { contentType: 'application/pdf' },
    customMetadata: {
      productCode: code,
      kind,
      uploadedBy: meta.uploadedBy,
      uploadedAt: uploadedAt.toISOString(),
      ...(meta.originalName
        ? { originalName: meta.originalName.slice(0, 200) }
        : {}),
    },
  });
  return { key, contentType: 'application/pdf', size: file.size, uploadedAt };
}

const IMAGE_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

function sniffImage(bytes: Uint8Array): string | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  )
    return 'image/png';
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  )
    return 'image/jpeg';
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  )
    return 'image/webp';
  return null;
}

/** Product photograph. PNG, JPEG or WebP, checked by magic bytes. Key: products/<CODE>/image/<uploadId>.<ext> */
export async function putProductImage(
  productCode: string,
  file: File | Blob,
  meta: { uploadedBy: string; originalName?: string },
): Promise<StoredDocument> {
  const code = productCode.trim().toUpperCase();
  if (!/^NPL-\d{3,4}$/.test(code)) throw new Error('Invalid product code.');
  if (file.size === 0) throw new Error('Empty file.');
  if (file.size > MAX_IMAGE_BYTES)
    throw new Error('File exceeds the 10 MB limit.');
  const sniffed = sniffImage(
    new Uint8Array(await file.slice(0, 12).arrayBuffer()),
  );
  if (!sniffed || !(sniffed in IMAGE_TYPES))
    throw new Error(
      'Unsupported document type: not a PNG, JPEG or WebP image.',
    );
  const uploadId = crypto.randomUUID().replace(/-/g, '');
  const key = `products/${code}/image/${uploadId}.${IMAGE_TYPES[sniffed]}`;
  const uploadedAt = new Date();
  await bucket().put(key, file.stream(), {
    httpMetadata: { contentType: sniffed },
    customMetadata: {
      productCode: code,
      kind: 'image',
      uploadedBy: meta.uploadedBy,
      uploadedAt: uploadedAt.toISOString(),
      ...(meta.originalName
        ? { originalName: meta.originalName.slice(0, 200) }
        : {}),
    },
  });
  return { key, contentType: sniffed, size: file.size, uploadedAt };
}

export async function getProductDocument(
  key: string,
): Promise<R2ObjectBody | null> {
  if (!key.startsWith('products/')) return null;
  return bucket().get(key);
}

/** Build a download response for a stored object, with a safe filename. */
export function documentResponse(
  object: R2ObjectBody,
  filename: string,
  inline = false,
): Response {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('Cache-Control', 'private, no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  const safeName = filename.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120);
  headers.set(
    'Content-Disposition',
    `${inline ? 'inline' : 'attachment'}; filename="${safeName}"`,
  );
  return new Response(object.body, { headers });
}
