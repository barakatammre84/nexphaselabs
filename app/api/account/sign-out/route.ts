import { accountTokenFromRequest, clearedAccountCookie, revokeAccountSession } from '@/lib/account-auth';
import { sameOrigin, urlIsSecure } from '@/lib/staff-auth';

export async function POST(request: Request) {
  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const token = accountTokenFromRequest(request);
  if (token) {
    try {
      await revokeAccountSession(token);
    } catch (error) {
      console.error('[account] sign-out revoke failed', error instanceof Error ? error.message : error);
    }
  }
  const headers = new Headers({ Location: new URL('/account/sign-in?signed_out=1', request.url).toString() });
  headers.append('Set-Cookie', clearedAccountCookie(urlIsSecure(request)));
  headers.set('Cache-Control', 'no-store');
  return new Response(null, { status: 303, headers });
}
