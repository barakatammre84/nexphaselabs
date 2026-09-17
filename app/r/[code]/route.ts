import { normaliseAffiliateCode } from '@/lib/affiliate-rules';
import { referralCookie } from '@/lib/referral-cookie';

/**
 * A partner's shareable link, nexphaselabs.net/r/THEIR-CODE. It records the code in a cookie and
 * sends the visitor to the catalog, or to a `to` path on this site if the link carried one.
 * The code is not checked against the database here: this route must stay fast and cacheable-free,
 * and an unknown code simply never binds to anything at sign-up.
 */
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params;
  const code = normaliseAffiliateCode(raw ?? '');
  const url = new URL(request.url);
  const to = url.searchParams.get('to') ?? '';
  const destination = to.startsWith('/') && !to.startsWith('//') && !to.includes('\\') ? to : '/catalog';
  const headers = new Headers({ Location: new URL(destination, request.url).href, 'Cache-Control': 'no-store' });
  if (code) headers.append('Set-Cookie', referralCookie(code, url.protocol === 'https:'));
  return new Response(null, { status: 302, headers });
}
