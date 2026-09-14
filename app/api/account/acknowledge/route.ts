import { getAccountFromRequest, recordAcknowledgements, safeAccountReturnPath } from '@/lib/account-auth';
import { sameOrigin } from '@/lib/staff-auth';

/**
 * Re-accept the current terms of sale, the research-use acknowledgement
 * and the age statement. Required whenever either document's version
 * moves past the one the account last accepted.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const account = await getAccountFromRequest(request);
  if (!account) return new Response('Unauthorized', { status: 401 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return new Response('Bad request', { status: 400 });
  }
  const returnTo = safeAccountReturnPath(String(form.get('return_to') ?? ''));
  if (form.get('accept_terms') !== 'on' || form.get('accept_ruo') !== 'on' || form.get('accept_age') !== 'on') {
    return Response.redirect(new URL(`${returnTo}${returnTo.includes('?') ? '&' : '?'}ack=required`, request.url), 303);
  }

  try {
    await recordAcknowledgements(account.id, request.headers.get('user-agent'));
  } catch (error) {
    console.error('[account] acknowledgement failed', error instanceof Error ? error.message : error);
    return Response.redirect(new URL(`${returnTo}${returnTo.includes('?') ? '&' : '?'}ack=unavailable`, request.url), 303);
  }
  return Response.redirect(new URL(returnTo, request.url), 303);
}
