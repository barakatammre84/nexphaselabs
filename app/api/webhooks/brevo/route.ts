import { env } from 'cloudflare:workers';
import { revokeConsent } from '@/lib/marketing-consent';
import { sha256Hex } from '@/lib/staff-auth-core';

const REVOKING = new Set(['unsubscribed', 'unsubscribe', 'hard_bounce', 'hardbounce', 'spam', 'complaint', 'blocked']);

/**
 * Brevo transactional/marketing webhook: an unsubscribe, hard bounce, spam complaint or block
 * on their side revokes the consent row here, so our table never says "confirmed" about an
 * address Brevo will not send to. Guarded by BREVO_WEBHOOK_TOKEN in the query string.
 */
export async function POST(request: Request) {
  const expected = (env.BREVO_WEBHOOK_TOKEN ?? '').trim();
  const given = (new URL(request.url).searchParams.get('token') ?? '').trim();
  if (!expected || !given || (await sha256Hex(expected)) !== (await sha256Hex(given))) return new Response('Unauthorized', { status: 401 });
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return new Response('Bad request', { status: 400 });
  }
  const events = Array.isArray(payload) ? payload : [payload];
  let revoked = 0;
  for (const event of events) {
    if (!event || typeof event !== 'object') continue;
    const { event: name, email } = event as { event?: unknown; email?: unknown };
    const kind = String(name ?? '').toLowerCase();
    if (!REVOKING.has(kind) || typeof email !== 'string') continue;
    try {
      if (await revokeConsent({ email }, `brevo:${kind}`)) revoked += 1;
    } catch (error) {
      console.error('[newsletter] webhook revoke failed', error instanceof Error ? error.message : error);
    }
  }
  return Response.json({ ok: true, revoked }, { headers: { 'Cache-Control': 'no-store' } });
}
