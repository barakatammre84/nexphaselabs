import { getProductByCode } from '@/lib/catalog-data';
import { MAX_IMAGE_BYTES, putProductImage } from '@/lib/documents';
import { attachProductImage, clearProductImage } from '@/lib/product-documents';
import {
  canEditCatalog,
  getStaffFromRequest,
  sameOrigin,
} from '@/lib/staff-auth';

/** Upload or remove a product photograph. Admin or QC. Nothing is deleted from storage. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const staff = await getStaffFromRequest(request);
  if (!staff) return new Response('Unauthorized', { status: 401 });
  if (!canEditCatalog(staff)) return new Response('Forbidden', { status: 403 });
  const { code } = await params;
  if (!/^NPL-\d{3,4}$/i.test(code))
    return new Response('Not found', { status: 404 });
  const product = await getProductByCode(code);
  if (!product) return new Response('Not found', { status: 404 });
  const back = (query: string) =>
    Response.redirect(
      new URL(`/manage/products/${product.code}?${query}`, request.url),
      303,
    );

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return back('image=badform');
  }
  if (form.get('action') === 'remove') {
    try {
      await clearProductImage(product.id, staff);
    } catch (error) {
      console.error(
        '[products] image remove failed',
        error instanceof Error ? error.message : error,
      );
      return back('image=store');
    }
    return back('image=removed');
  }
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) return back('image=nofile');
  if (file.size > MAX_IMAGE_BYTES) return back('image=size');
  try {
    const stored = await putProductImage(product.code, file, {
      uploadedBy: staff.id,
      originalName: file.name,
    });
    await attachProductImage(
      product.id,
      stored,
      file.name.slice(0, 200) || null,
      staff,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[products] image upload failed', message);
    return back(
      /Unsupported document type/.test(message)
        ? 'image=filetype'
        : 'image=store',
    );
  }
  return back('image=ok');
}
