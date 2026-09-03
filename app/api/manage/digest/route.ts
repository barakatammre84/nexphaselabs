import { sendDigest } from '@/lib/digest';
import { canManageStaff, getStaffFromRequest, sameOrigin } from '@/lib/staff-auth';

/** Admin sends the operations digest to their own staff address, now. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const staff = await getStaffFromRequest(request);
  if (!staff) return new Response('Unauthorized', { status: 401 });
  if (!canManageStaff(staff)) return new Response('Forbidden', { status: 403 });
  const back = (query: string) => Response.redirect(new URL(`/manage?${query}`, request.url), 303);
  try {
    const result = await sendDigest(staff.email);
    if (!result.ok) console.error('[digest] send failed', result.error);
    return back(result.ok ? 'digest=sent' : 'digest=failed');
  } catch (error) {
    console.error('[digest] failed', error instanceof Error ? error.message : error);
    return back('digest=failed');
  }
}
