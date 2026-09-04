import { issueCoa, previewCoa } from '@/lib/coa';
import { renderCoa } from '@/lib/coa-render';
import { lotNumberFromParam } from '@/lib/lot-rules';
import { recordedBy } from '@/lib/lots-admin';
import { canRecordResults, getStaffFromRequest, sameOrigin } from '@/lib/staff-auth';

/**
 * Preview and issue the certificate of analysis for a lot.
 *
 * GET renders the certificate and returns it without storing anything, so
 * staff read the actual document rather than a summary of it before deciding
 * to issue. The preview is watermarked by its own number — it carries the
 * number the certificate *would* take, and nothing is claimed until POST.
 *
 * POST issues: claims the number, stores the PDF, records the hash, and
 * attaches it to the lot.
 */

export async function GET(
  request: Request,
  { params }: { params: Promise<{ lotNumber: string }> },
) {
  const staff = await getStaffFromRequest(request);
  if (!staff) return new Response('Unauthorized', { status: 401 });
  if (!canRecordResults(staff)) return new Response('Forbidden', { status: 403 });

  const { lotNumber } = await params;
  const normalised = lotNumberFromParam(lotNumber);
  if (!normalised) return new Response('Not found', { status: 404 });

  let preview;
  try {
    preview = await previewCoa(normalised);
  } catch (error) {
    console.error(
      '[coa] preview failed',
      error instanceof Error ? error.message : error,
    );
    return new Response('Temporarily unavailable', { status: 503 });
  }
  if (!preview) return new Response('Not found', { status: 404 });

  const bytes = await renderCoa(preview.content, {
    documentNumber: preview.documentNumber,
    issuedAt: new Date(),
    issuedBy: recordedBy(staff),
    supersedes: preview.current?.documentNumber ?? null,
  });

  return new Response(bytes as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      // A preview is not a record. It must never be cached or filed as one.
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': `inline; filename="PREVIEW-${preview.documentNumber}.pdf"`,
    },
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ lotNumber: string }> },
) {
  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const staff = await getStaffFromRequest(request);
  if (!staff) return new Response('Unauthorized', { status: 401 });
  if (!canRecordResults(staff)) return new Response('Forbidden', { status: 403 });

  const { lotNumber } = await params;
  const normalised = lotNumberFromParam(lotNumber);
  if (!normalised) return new Response('Not found', { status: 404 });

  const back = (query: string) =>
    Response.redirect(
      new URL(`/manage/lots/${encodeURIComponent(normalised)}?${query}`, request.url),
      303,
    );

  let reason: string | null = null;
  try {
    const form = await request.formData();
    reason = String(form.get('reason') ?? '').trim() || null;
  } catch {
    return back('error=badform');
  }

  try {
    const result = await issueCoa(normalised, staff, { reason });
    if (!result.ok) {
      console.info(`[coa] issue refused for ${normalised}: ${result.errors.join('; ')}`);
      return back('error=coablocked');
    }
    console.info(`[coa] ${result.documentNumber} issued for ${normalised} by ${staff.id}`);
    return back(`issued=${encodeURIComponent(result.documentNumber)}`);
  } catch (error) {
    console.error(
      '[coa] issue failed',
      error instanceof Error ? error.message : error,
    );
    return back('error=coafailed');
  }
}
