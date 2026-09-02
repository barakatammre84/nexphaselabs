import { SESSION_COOKIE, clearedSessionCookie, revokeSessionByToken, sameOrigin, urlIsSecure } from '@/lib/staff-auth';

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return new Response('Forbidden', { status: 403 });
  }
  const cookie = request.headers.get('cookie') ?? '';
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([a-f0-9]{64})`));
  if (match) {
    try {
      await revokeSessionByToken(match[1]);
    } catch (error) {
      console.error('[staff] sign-out revoke failed', error instanceof Error ? error.message : error);
    }
  }
  const headers = new Headers({ Location: new URL('/staff/sign-in?signed_out=1', request.url).toString() });
  headers.append('Set-Cookie', clearedSessionCookie(urlIsSecure(request)));
  headers.set('Cache-Control', 'no-store');
  return new Response(null, { status: 303, headers });
}
