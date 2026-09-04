import { canManageStaff, getStaffFromRequest, sameOrigin } from '@/lib/staff-auth';
import { dispatchNotifications, handleNotification } from '@/lib/notifications';

export async function POST(request: Request) {
  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const staff = await getStaffFromRequest(request);
  if (!staff) return new Response('Unauthorized', { status: 401 });
  if (!canManageStaff(staff)) return new Response('Forbidden', { status: 403 });
  const back = (ok: boolean) => Response.redirect(new URL(`/manage/notifications?result=${ok ? 'recorded' : 'failed'}`, request.url), 303);
  try {
    const form = await request.formData();
    const action = String(form.get('action') ?? '');
    if (action === 'dispatch') { await dispatchNotifications(); return back(true); }
    const id = String(form.get('id') ?? '');
    const note = String(form.get('note') ?? '');
    if (!/^[A-Za-z0-9:_-]{1,100}$/.test(id) || (action !== 'retry' && action !== 'resolve')) return back(false);
    return back(await handleNotification(id, action, `${staff.name} (${staff.id})`, note));
  } catch {
    return back(false);
  }
}
