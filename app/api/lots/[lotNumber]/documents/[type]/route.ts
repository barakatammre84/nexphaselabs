import { documentResponse, getLotDocument, isDocumentType } from '@/lib/documents';
import { lotNumberFromParam } from '@/lib/lot-rules';
import { getReleasedLot, publicDocumentKey } from '@/lib/lots-public';

/**
 * Public document download: the certificate of analysis, chromatogram, mass
 * spectrum or SDS currently in force for a RELEASED lot.
 *
 * Any lot that is not released — including one that was released yesterday
 * and withdrawn today — answers 404, identical to an unknown lot. The file
 * is streamed from the private bucket; there is no public URL to the object.
 */
export async function GET(request: Request, { params }: { params: Promise<{ lotNumber: string; type: string }> }) {
  const { lotNumber, type } = await params;
  const normalised = lotNumberFromParam(lotNumber);
  if (!normalised || !isDocumentType(type)) return new Response('Not found', { status: 404 });

  let key: string | null;
  try {
    const lot = await getReleasedLot(normalised);
    key = lot ? publicDocumentKey(lot, type) : null;
  } catch (error) {
    console.error('[lots] document lookup failed', error instanceof Error ? error.message : error);
    return new Response('Temporarily unavailable', { status: 503 });
  }
  if (!key) return new Response('Not found', { status: 404 });

  const object = await getLotDocument(key);
  if (!object) return new Response('Not found', { status: 404 });

  const ext = key.split('.').pop() ?? 'bin';
  const inline = new URL(request.url).searchParams.get('inline') === '1';
  return documentResponse(object, `${normalised}-${type}.${ext}`, inline);
}
