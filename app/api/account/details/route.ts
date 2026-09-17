import { getAccountFromRequest } from '@/lib/account-auth';
import { changeName, changePassword, requestEmailChange } from '@/lib/account-details';
import { redirectWithNotice } from '@/lib/notice';
import { sameOrigin } from '@/lib/staff-auth';

/**
 * A customer's own name, email address and password (owner, 16 Sep 2026).
 * Signed-in accounts only. Outcomes travel as a short-lived notice cookie,
 * never in the link (lib/notice.ts).
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
  const value = (name: string, max = 254) => String(form.get(name) ?? '').slice(0, max);
  const intent = value('intent', 16).trim();
  const done = (saved: string) => Response.redirect(new URL(`/account/details?saved=${saved}`, request.url), 303);
  const failed = (message: string) => redirectWithNotice(request, '/account/details?error=notice', message);

  try {
    if (intent === 'name') {
      const result = await changeName(account.id, value('name', 160));
      return result.ok ? done('name') : failed(result.error);
    }
    if (intent === 'password') {
      const result = await changePassword(account, value('current'), value('next'), value('confirm'));
      return result.ok ? done('password') : failed(result.error);
    }
    if (intent === 'email') {
      const result = await requestEmailChange(account, value('email'));
      return result.ok ? done('email') : failed(result.error);
    }
    return failed('Unknown request.');
  } catch (error) {
    console.error('[account details] failed', error instanceof Error ? error.message : error);
    return failed('That could not be saved. Try again shortly.');
  }
}
