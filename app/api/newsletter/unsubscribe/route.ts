import { revokeConsent } from '@/lib/marketing-consent';

/**
 * Unsubscribe by token: the link in every marketing email, the button on the unsubscribe
 * page, and RFC 8058 one-click from mail clients (a POST with "List-Unsubscribe=One-Click").
 * No same-origin check on purpose — mail clients post from nowhere — and no sign-in: the
 * token is the authority, and the answer is the same whether or not it matched.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  let token = url.searchParams.get('token') ?? '';
  let fromForm = false;
  const type = request.headers.get('content-type') ?? '';
  if (type.includes('form')) {
    const form = await request.formData().catch(() => null);
    if (form) {
      token = String(form.get('token') ?? token);
      fromForm = form.get('List-Unsubscribe') !== 'One-Click';
    }
  }
  try {
    await revokeConsent({ unsubscribeToken: token.trim() }, fromForm ? 'unsubscribe page' : 'one-click');
  } catch (error) {
    console.error('[newsletter] unsubscribe failed', error instanceof Error ? error.message : error);
    if (fromForm) return Response.redirect(new URL('/newsletter/unsubscribe?error=1', request.url), 303);
    return new Response('Try again later.', { status: 503 });
  }
  if (fromForm) return Response.redirect(new URL('/newsletter/unsubscribe?done=1', request.url), 303);
  return new Response('Unsubscribed.', { status: 200, headers: { 'Cache-Control': 'no-store' } });
}

export function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token') ?? '';
  return Response.redirect(new URL(`/newsletter/unsubscribe?token=${encodeURIComponent(token)}`, request.url), 303);
}
