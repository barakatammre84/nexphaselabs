import { documentResponse, getLotDocument, isDocumentType } from '@/lib/documents';
import { lotNumberFromParam } from '@/lib/lot-rules';
import { currentDocumentKey, getLot } from '@/lib/lots-admin';
import { canRecordResults, getStaffFromRequest } from '@/lib/staff-auth';

/**
 * Staff download of the document currently in force for a lot, in any lot
 * status. The public equivalent (released lots only) lives under /api/lots.
 */
export async function GET(request: Request, { params }: { params: Promise<{ lotNumber: string; type: string }> }) {
  const staff = await getStaffFromRequest(request);
  if (!staff) return new Response('Unauthorized', { status: 401 });
  if (!canRecordResults(staff)) return new Response('Forbidden', { status: 403 });

  const { lotNumber, type } = await params;
  const normalised = lotNumberFromParam(lotNumber);
  if (!normalised || !isDocumentType(type)) return new Response('Not found', { status: 404 });

  const lot = await getLot(normalised);
  if (!lot) return new Response('Not found', { status: 404 });
  const key = currentDocumentKey(lot, type);
  if (!key) return new Response('Not found', { status: 404 });

  const object = await getLotDocument(key);
  if (!object) return new Response('Not found', { status: 404 });

  const ext = key.split('.').pop() ?? 'bin';
  const inline = new URL(request.url).searchParams.get('inline') === '1';
  return documentResponse(object, `${normalised}-${type}.${ext}`, inline);
}
