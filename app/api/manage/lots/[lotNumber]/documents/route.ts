import { DOCUMENT_LABEL, MAX_DOCUMENT_BYTES, isDocumentType, putLotDocument } from '@/lib/documents';
import { lotNumberFromParam } from '@/lib/lot-rules';
import { attachLotDocument, getLot } from '@/lib/lots-admin';
import { canRecordResults, getStaffFromRequest, sameOrigin } from '@/lib/staff-auth';

/**
 * Staff document upload. multipart/form-data with `type` and `file`.
 * Redirects back to the lot page with `?uploaded=<type>` or `?error=<code>`.
 */
export async function POST(request: Request, { params }: { params: Promise<{ lotNumber: string }> }) {
  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const staff = await getStaffFromRequest(request);
  if (!staff) return new Response('Unauthorized', { status: 401 });
  // COA, chromatogram, mass spec and SDS are the analytical record: QC and admin only, like test results.
  if (!canRecordResults(staff)) return new Response('Forbidden', { status: 403 });

  const { lotNumber } = await params;
  const normalised = lotNumberFromParam(lotNumber);
  if (!normalised) return new Response('Not found', { status: 404 });

  const back = (query: string) =>
    Response.redirect(new URL(`/manage/lots/${encodeURIComponent(normalised)}?${query}`, request.url), 303);

  const lot = await getLot(normalised);
  if (!lot) return new Response('Not found', { status: 404 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return back('error=badform');
  }
  const type = String(form.get('type') ?? '');
  const file = form.get('file');
  if (!isDocumentType(type)) return back('error=type');
  if (!(file instanceof File) || file.size === 0) return back('error=nofile');
  if (file.size > MAX_DOCUMENT_BYTES) return back('error=size');

  try {
    const stored = await putLotDocument(normalised, type, file, { uploadedBy: staff.id, originalName: file.name });
    await attachLotDocument(lot, type, stored, file.name.slice(0, 200) || null, staff);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[lots] document upload failed', message);
    if (/Unsupported document type/.test(message)) return back('error=filetype');
    return back('error=store');
  }

  console.info(`[lots] ${DOCUMENT_LABEL[type]} uploaded for ${normalised} by ${staff.id}`);
  return back(`uploaded=${type}`);
}
