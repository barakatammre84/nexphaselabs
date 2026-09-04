import { issuePackingSlip, previewPackingSlip } from '@/lib/packing-slip';
import { renderPackingSlip } from '@/lib/packing-slip-render';
import { recordedBy } from '@/lib/lots-admin';
import { canFulfil, getStaffFromRequest, sameOrigin } from '@/lib/staff-auth';

/**
 * Preview and issue the packing slip for an order.
 *
 * GET renders the document and stores nothing. POST claims the number, writes
 * the PDF and records the issue. Fulfilment work, so `canFulfil`.
 */

const ORDER_NUMBER = /^[A-Z0-9][A-Z0-9-]{2,31}$/;

function normalise(raw: string): string | null {
  const value = decodeURIComponent(raw).trim().toUpperCase();
  return ORDER_NUMBER.test(value) ? value : null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ orderNumber: string }> },
) {
  const staff = await getStaffFromRequest(request);
  if (!staff) return new Response('Unauthorized', { status: 401 });
  if (!canFulfil(staff)) return new Response('Forbidden', { status: 403 });

  const { orderNumber } = await params;
  const normalised = normalise(orderNumber);
  if (!normalised) return new Response('Not found', { status: 404 });

  let preview;
  try {
    preview = await previewPackingSlip(normalised);
  } catch (error) {
    console.error(
      '[packing-slip] preview failed',
      error instanceof Error ? error.message : error,
    );
    return new Response('Temporarily unavailable', { status: 503 });
  }
  if (!preview) return new Response('Not found', { status: 404 });

  const bytes = await renderPackingSlip(preview.content, {
    documentNumber: preview.documentNumber,
    issuedAt: new Date(),
    issuedBy: recordedBy(staff),
    supersedes: preview.current?.documentNumber ?? null,
  });

  return new Response(bytes as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': `inline; filename="PREVIEW-${preview.documentNumber}.pdf"`,
    },
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderNumber: string }> },
) {
  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const staff = await getStaffFromRequest(request);
  if (!staff) return new Response('Unauthorized', { status: 401 });
  if (!canFulfil(staff)) return new Response('Forbidden', { status: 403 });

  const { orderNumber } = await params;
  const normalised = normalise(orderNumber);
  if (!normalised) return new Response('Not found', { status: 404 });

  const back = (query: string) =>
    Response.redirect(
      new URL(`/manage/orders/${encodeURIComponent(normalised)}?${query}`, request.url),
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
    const result = await issuePackingSlip(normalised, staff, { reason });
    if (!result.ok) {
      console.info(
        `[packing-slip] issue refused for ${normalised}: ${result.errors.join('; ')}`,
      );
      return back('error=slipblocked');
    }
    console.info(
      `[packing-slip] ${result.documentNumber} issued for ${normalised} by ${staff.id}`,
    );
    return back(`slipped=${encodeURIComponent(result.documentNumber)}`);
  } catch (error) {
    console.error(
      '[packing-slip] issue failed',
      error instanceof Error ? error.message : error,
    );
    return back('error=slipfailed');
  }
}
