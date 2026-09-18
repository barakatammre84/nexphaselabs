import { syncZelleMailbox } from '@/lib/zelle-gmail';
import { allow, rateLimitKey } from '@/lib/rate-limit';
import { canManageFinance, getStaffFromRequest, sameOrigin } from '@/lib/staff-auth';

export async function POST(request: Request) {
  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const staff = await getStaffFromRequest(request);
  if (!staff) return new Response('Unauthorized', { status: 401 });
  if (!canManageFinance(staff)) return new Response('Forbidden', { status: 403 });
  if (!(await allow(rateLimitKey('zelle-sync', staff.id), 12, 3600)))
    return new Response('Try again later', { status: 429 });
  const result = await syncZelleMailbox();
  const url = new URL('/manage/payments/zelle', request.url);
  url.searchParams.set(result.ok ? 'synced' : 'error', result.ok ? String(result.added) : result.error ?? 'Sync failed');
  return Response.redirect(url, 303);
}
