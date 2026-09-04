import { documentResponse } from '@/lib/documents';
import {
  DOCUMENT_KIND_LABEL,
  documentById,
  getIssuedObject,
  type IssuedDocumentKind,
} from '@/lib/issued-documents';
import { getStaffFromRequest } from '@/lib/staff-auth';

/**
 * Staff download of an issued document, live or superseded.
 *
 * Superseded documents stay downloadable on purpose. When a certificate has
 * been reissued, the question staff are usually answering is what the earlier
 * one said, and the record is worth nothing if only the current version can
 * be read.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const staff = await getStaffFromRequest(request);
  if (!staff) return new Response('Unauthorized', { status: 401 });

  const { id } = await params;
  if (!/^doc_[a-z0-9]{8,32}$/.test(id)) {
    return new Response('Not found', { status: 404 });
  }

  let record;
  try {
    record = await documentById(id);
  } catch (error) {
    console.error(
      '[documents] lookup failed',
      error instanceof Error ? error.message : error,
    );
    return new Response('Temporarily unavailable', { status: 503 });
  }
  if (!record) return new Response('Not found', { status: 404 });

  const object = await getIssuedObject(record.objectKey);
  if (!object) return new Response('Not found', { status: 404 });

  const label =
    DOCUMENT_KIND_LABEL[record.kind as IssuedDocumentKind] ?? 'Document';
  const inline = new URL(request.url).searchParams.get('inline') === '1';
  return documentResponse(
    object,
    `${label.replace(/\s+/g, '-')}-${record.documentNumber}.pdf`,
    inline,
  );
}
