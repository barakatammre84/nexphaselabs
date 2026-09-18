import { lotNumberFromParam, parseCostCents } from '@/lib/lot-rules';
import { getLot, setLotCost } from '@/lib/lots-admin';
import { canManageFinance, getStaffFromRequest, sameOrigin } from '@/lib/staff-auth';

/** Admin records or corrects a lot's landed cost. */
export async function POST(request: Request, { params }: { params: Promise<{ lotNumber: string }> }) {
  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const staff = await getStaffFromRequest(request);
  if (!staff) return new Response('Unauthorized', { status: 401 });
  if (!canManageFinance(staff)) return new Response('Forbidden', { status: 403 });
  const { lotNumber } = await params;
  const normalised = lotNumberFromParam(lotNumber);
  if (!normalised) return new Response('Not found', { status: 404 });
  const lot = await getLot(normalised);
  if (!lot) return new Response('Not found', { status: 404 });
  const back = (query: string) => Response.redirect(new URL(`/manage/lots/${encodeURIComponent(normalised)}?${query}`, request.url), 303);
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return back('error=badform');
  }
  const cents = parseCostCents(String(form.get('cost') ?? ''));
  const note = String(form.get('costNote') ?? '').trim().slice(0, 200) || null;
  if (cents === null || Number.isNaN(cents)) return back('error=cost');
  try {
    await setLotCost(lot, cents, note, staff);
  } catch (error) {
    console.error('[lots] cost failed', error instanceof Error ? error.message : error);
    return back('error=store');
  }
  return back('cost=1');
}
