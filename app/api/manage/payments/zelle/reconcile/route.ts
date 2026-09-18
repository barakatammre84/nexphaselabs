import { recordedBy } from '@/lib/lots-admin';
import { canManageFinance, getStaffFromRequest, sameOrigin } from '@/lib/staff-auth';
import { recordZelleReconciliation } from '@/lib/zelle';

export async function POST(request: Request) {
  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const staff = await getStaffFromRequest(request);
  if (!staff) return new Response('Unauthorized', { status: 401 });
  if (!canManageFinance(staff)) return new Response('Forbidden', { status: 403 });
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return new Response('Bad request', { status: 400 });
  }
  const result = await recordZelleReconciliation(
    String(form.get('business_date') ?? ''),
    String(form.get('received_total') ?? ''),
    String(form.get('refunded_total') ?? '0'),
    recordedBy(staff),
    String(form.get('note') ?? ''),
  );
  const url = new URL('/manage/payments/zelle', request.url);
  if (result.ok)
    url.searchParams.set(
      'reconciled',
      result.run.differenceCents === 0 ? 'balanced' : String(result.run.differenceCents),
    );
  else url.searchParams.set('error', result.error);
  return Response.redirect(url, 303);
}
