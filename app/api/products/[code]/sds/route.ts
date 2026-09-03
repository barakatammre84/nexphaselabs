import { getPublishedProductByCode } from '@/lib/catalog-data';
import { documentResponse, getProductDocument } from '@/lib/documents';
import { currentSds } from '@/lib/product-documents';

/**
 * Public safety data sheet download for a PUBLISHED product. An SDS is
 * hazard-communication documentation; it carries no dosing or claim content
 * and OSHA expects it to be available to anyone who handles the material.
 */
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!/^NPL-\d{3,4}$/i.test(code)) return new Response('Not found', { status: 404 });
  let key: string | null = null;
  try {
    const product = await getPublishedProductByCode(code);
    if (!product) return new Response('Not found', { status: 404 });
    key = (await currentSds(product.id))?.objectKey ?? null;
  } catch (error) {
    console.error('[products] sds lookup failed', error instanceof Error ? error.message : error);
    return new Response('Temporarily unavailable', { status: 503 });
  }
  if (!key) return new Response('Not found', { status: 404 });
  const object = await getProductDocument(key);
  if (!object) return new Response('Not found', { status: 404 });
  const inline = new URL(request.url).searchParams.get('inline') === '1';
  return documentResponse(object, `${code.toUpperCase()}-SDS.pdf`, inline);
}
