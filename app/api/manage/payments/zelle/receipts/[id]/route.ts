import { orderNumberFromParam } from '@/lib/order-rules';
import { recordedBy } from '@/lib/lots-admin';
import { canVerifyAccounts, getStaffFromRequest, sameOrigin } from '@/lib/staff-auth';
import { rejectZelleReceipt, settleZelleReceipt } from '@/lib/zelle';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const staff = await getStaffFromRequest(request);
  if (!staff) return new Response('Unauthorized', { status: 401 });
  if (!canVerifyAccounts(staff)) return new Response('Forbidden', { status: 403 });
  const id = (await params).id;
  if (!/^zrc_[a-f0-9]{24}$/u.test(id)) return new Response('Not found', { status: 404 });
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return new Response('Bad request', { status: 400 });
  }
  const action = String(form.get('action') ?? '');
  const actor = recordedBy(staff);
  const result =
    action === 'approve'
      ? await settleZelleReceipt(
          id,
          orderNumberFromParam(String(form.get('order_number') ?? '')) ?? '',
          actor,
        )
      : action === 'reject'
        ? await rejectZelleReceipt(id, actor, String(form.get('note') ?? ''))
        : { ok: false, note: 'Choose a valid receipt action.' };
  const url = new URL('/manage/payments/zelle', request.url);
  url.searchParams.set(result.ok ? 'updated' : 'error', result.note);
  return Response.redirect(url, 303);
}
