import { issueHazcom, previewHazcom } from '@/lib/hazcom';
import { renderHazcom } from '@/lib/hazcom-render';
import { recordedBy } from '@/lib/lots-admin';
import { isSettingKey, putPictogram, writeSettings, type SettingKey } from '@/lib/settings';
import { canManageStaff, getStaffFromRequest, sameOrigin } from '@/lib/staff-auth';

/**
 * The hazard communication programme: preview it, issue it, record the facts
 * it rests on, and upload the prescribed pictogram artwork.
 *
 * Admin only. These are the facts that appear on every container label and in
 * the document an OSHA inspector asks for first.
 */

const MAX_PICTOGRAM_BYTES = 2 * 1024 * 1024;

export async function GET(request: Request) {
  const staff = await getStaffFromRequest(request);
  if (!staff) return new Response('Unauthorized', { status: 401 });
  if (!canManageStaff(staff)) return new Response('Forbidden', { status: 403 });

  let preview;
  try {
    preview = await previewHazcom();
  } catch (error) {
    console.error(
      '[hazcom] preview failed',
      error instanceof Error ? error.message : error,
    );
    return new Response('Temporarily unavailable', { status: 503 });
  }

  const bytes = await renderHazcom(preview.content, {
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

export async function POST(request: Request) {
  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const staff = await getStaffFromRequest(request);
  if (!staff) return new Response('Unauthorized', { status: 401 });
  if (!canManageStaff(staff)) return new Response('Forbidden', { status: 403 });

  const back = (query: string) =>
    Response.redirect(new URL(`/manage/hazcom?${query}`, request.url), 303);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return back('error=badform');
  }

  const intent = String(form.get('intent') ?? '');

  if (intent === 'settings') {
    const values: Partial<Record<SettingKey, string>> = {};
    for (const [key, value] of form.entries()) {
      if (isSettingKey(key)) values[key] = String(value);
    }
    try {
      await writeSettings(values, staff);
    } catch (error) {
      console.error(
        '[hazcom] settings write failed',
        error instanceof Error ? error.message : error,
      );
      return back('error=settings');
    }
    return back('saved=1');
  }

  if (intent === 'pictogram') {
    const code = String(form.get('code') ?? '');
    const file = form.get('file');
    if (!(file instanceof File) || file.size === 0) return back('error=nofile');
    if (file.size > MAX_PICTOGRAM_BYTES) return back('error=size');
    try {
      await putPictogram(code, new Uint8Array(await file.arrayBuffer()), staff);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[hazcom] pictogram upload failed', message);
      return back(/PNG/.test(message) ? 'error=notpng' : 'error=pictogram');
    }
    return back(`pictogram=${encodeURIComponent(code.toUpperCase())}`);
  }

  if (intent === 'issue') {
    const reason = String(form.get('reason') ?? '').trim() || null;
    try {
      const result = await issueHazcom(staff, { reason });
      if (!result.ok) return back('error=issue');
      console.info(`[hazcom] ${result.documentNumber} issued by ${staff.id}`);
      return back(`issued=${encodeURIComponent(result.documentNumber)}`);
    } catch (error) {
      console.error(
        '[hazcom] issue failed',
        error instanceof Error ? error.message : error,
      );
      return back('error=issue');
    }
  }

  return back('error=intent');
}
