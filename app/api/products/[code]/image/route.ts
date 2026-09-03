import { getPublishedProductByCode } from '@/lib/catalog-data';
import { getProductDocument } from '@/lib/documents';

/** Public photograph of a PUBLISHED product, streamed from private R2. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  if (!/^NPL-\d{3,4}$/i.test(code))
    return new Response('Not found', { status: 404 });
  let key: string | null = null;
  try {
    const product = await getPublishedProductByCode(code);
    key =
      product?.image && !product.image.startsWith('/') ? product.image : null;
  } catch (error) {
    console.error(
      '[products] image lookup failed',
      error instanceof Error ? error.message : error,
    );
    return new Response('Temporarily unavailable', { status: 503 });
  }
  if (!key) return new Response('Not found', { status: 404 });
  const object = await getProductDocument(key);
  if (!object) return new Response('Not found', { status: 404 });
  const headers = new Headers();
  headers.set(
    'Content-Type',
    object.httpMetadata?.contentType ?? 'application/octet-stream',
  );
  headers.set('Content-Length', String(object.size));
  headers.set('Cache-Control', 'public, max-age=60, must-revalidate');
  headers.set('X-Content-Type-Options', 'nosniff');
  if (object.httpEtag) headers.set('ETag', object.httpEtag);
  return new Response(object.body, { status: 200, headers });
}
