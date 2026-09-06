import { feedbackTokenHash } from '@/lib/feedback-core';

const PUBLIC_ID = /^FB-\d{6}-[A-F0-9]{8}$/;
const STAFF_COOKIE = 'nx_staff';

function cookieValue(request: Request, name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (
    (request.headers.get('cookie') ?? '').match(
      new RegExp(`(?:^|;\\s*)${escaped}=([a-f0-9]{64})(?:;|$)`),
    )?.[1] ?? null
  );
}

function sameSocketOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

async function authorizedRole(
  request: Request,
  runtimeEnv: Cloudflare.Env,
  publicId: string,
): Promise<'visitor' | 'staff' | null> {
  const staffToken = cookieValue(request, STAFF_COOKIE);
  if (staffToken) {
    const staff = await runtimeEnv.DB.prepare(
      `SELECT s.id FROM staff_sessions s
       INNER JOIN staff_users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > unixepoch()
         AND u.active = 1 AND u.must_change_password = 0
       LIMIT 1`,
    )
      .bind(await feedbackTokenHash(staffToken))
      .first();
    if (staff) return 'staff';
  }
  const token = cookieValue(request, 'nx_feedback');
  if (!token) return null;
  const visitor = await runtimeEnv.DB.prepare(
    'SELECT id FROM feedback_conversations WHERE public_id = ? AND visitor_token_hash = ? LIMIT 1',
  )
    .bind(publicId, await feedbackTokenHash(token))
    .first();
  return visitor ? 'visitor' : null;
}

export async function feedbackRealtime(
  request: Request,
  runtimeEnv: Cloudflare.Env,
): Promise<Response> {
  if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
    return new Response('Expected WebSocket', { status: 426 });
  }
  if (!sameSocketOrigin(request))
    return new Response('Forbidden', { status: 403 });
  const publicId = new URL(request.url).searchParams.get('conversation') ?? '';
  if (!PUBLIC_ID.test(publicId))
    return new Response('Invalid conversation', { status: 400 });
  const role = await authorizedRole(request, runtimeEnv, publicId);
  if (!role) return new Response('Unauthorized', { status: 401 });
  const headers = new Headers({
    Upgrade: 'websocket',
    'X-Feedback-Role': role,
  });
  return runtimeEnv.FEEDBACK_ROOMS.getByName(publicId).fetch(
    new Request('https://feedback-room.internal/websocket', { headers }),
  );
}
