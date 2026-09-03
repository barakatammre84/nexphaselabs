import { getProductByCode } from '@/lib/catalog-data';
import { MAX_DOCUMENT_BYTES, putProductDocument } from '@/lib/documents';
import { attachSds } from '@/lib/product-documents';
import { canEditCatalog, getStaffFromRequest, sameOrigin } from '@/lib/staff-auth';

/** Staff uploads a safety data sheet for a product. Admin or QC. */
export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const staff = await getStaffFromRequest(request);
  if (!staff) return new Response('Unauthorized', { status: 401 });
  if (!canEditCatalog(staff)) return new Response('Forbidden', { status: 403 });
  const { code } = await params;
  if (!/^NPL-\d{3,4}$/i.test(code)) return new Response('Not found', { status: 404 });
  const product = await getProductByCode(code);
  if (!product) return new Response('Not found', { status: 404 });
  const back = (query: string) => Response.redirect(new URL(`/manage/products/${product.code}?${query}`, request.url), 303);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return back('sds=badform');
  }
  const file = form.get('file');
  const revision = String(form.get('revision') ?? '').trim().slice(0, 80) || null;
  if (!(file instanceof File) || file.size === 0) return back('sds=nofile');
  if (file.size > MAX_DOCUMENT_BYTES) return back('sds=size');
  try {
    const stored = await putProductDocument(product.code, 'sds', file, { uploadedBy: staff.id, originalName: file.name });
    await attachSds(product.id, stored, file.name.slice(0, 200) || null, revision, staff);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[products] sds upload failed', message);
    return back(/Unsupported document type/.test(message) ? 'sds=filetype' : 'sds=store');
  }
  return back('sds=ok');
}
