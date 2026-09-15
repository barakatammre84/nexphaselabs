import { isLabelSize } from '@/lib/hazard';
import { renderLabelForLot } from '@/lib/hazard-label';
import { lotNumberFromParam } from '@/lib/lot-rules';
import { canPrintLabels, getStaffFromRequest } from '@/lib/staff-auth';

/**
 * Print GHS container labels for a lot.
 *
 * A label is generated on demand and never archived: it is reprinted every
 * time a vial is filled, and what matters for the record is the
 * classification behind it, not a copy of each print.
 *
 * Refused outright — not warned about — when the classification, the
 * responsible-party details or the prescribed pictogram artwork is missing.
 * An under-labelled container is the citation. Quality and fulfilment staff can
 * print them; the vials are filled on the fulfilment side.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ lotNumber: string }> },
) {
  const staff = await getStaffFromRequest(request);
  if (!staff) return new Response('Unauthorized', { status: 401 });
  if (!canPrintLabels(staff)) return new Response('Forbidden', { status: 403 });

  const { lotNumber } = await params;
  const normalised = lotNumberFromParam(lotNumber);
  if (!normalised) return new Response('Not found', { status: 404 });

  const url = new URL(request.url);
  const sizeParam = url.searchParams.get('size') ?? 'vial';
  if (!isLabelSize(sizeParam)) return new Response('Unknown label size', { status: 400 });
  const copies = Math.max(1, Math.min(Number(url.searchParams.get('copies') ?? '1') || 1, 100));

  let result;
  try {
    result = await renderLabelForLot(normalised, sizeParam, copies);
  } catch (error) {
    console.error(
      '[label] render failed',
      error instanceof Error ? error.message : error,
    );
    return new Response('Temporarily unavailable', { status: 503 });
  }
  if (!result) return new Response('Not found', { status: 404 });
  if (!result.ok) {
    return new Response(`Labels cannot be printed yet:\n\n${result.errors.join('\n')}`, {
      status: 409,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  return new Response(result.bytes as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': `inline; filename="${result.filename}"`,
    },
  });
}
