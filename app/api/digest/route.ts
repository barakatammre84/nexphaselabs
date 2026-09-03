import { env } from 'cloudflare:workers';
import { sendDigest } from '@/lib/digest';

/**
 * Scheduled digest. An external scheduler (Cloudflare cron on a tiny worker,
 * or any cron) POSTs here with `Authorization: Bearer <DIGEST_TOKEN>`; the
 * digest goes to DIGEST_TO. Both are owner-set vars; unset → 404 so the
 * endpoint does not exist until configured. Constant-time token comparison.
 */
export async function POST(request: Request) {
  const token = env.DIGEST_TOKEN;
  const to = env.DIGEST_TO;
  if (!token || !to || token.length < 32) return new Response('Not found', { status: 404 });
  const header = request.headers.get('authorization') ?? '';
  const presented = header.startsWith('Bearer ') ? header.slice(7) : '';
  const enc = new TextEncoder();
  const a = enc.encode(presented);
  const b = enc.encode(token);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  if (diff !== 0) return new Response('Unauthorized', { status: 401 });
  try {
    const result = await sendDigest(to);
    return Response.json({ ok: result.ok, ...(result.ok ? {} : { error: result.error }) }, { status: result.ok ? 200 : 502 });
  } catch (error) {
    console.error('[digest] scheduled send failed', error instanceof Error ? error.message : error);
    return Response.json({ ok: false }, { status: 500 });
  }
}
