import { recoverOrder } from '@/lib/guest-order-recovery';
import { orderNumberFromParam } from '@/lib/order-rules';
import { allow, rateLimitKey } from '@/lib/rate-limit';
import { sameOrigin } from '@/lib/staff-auth';

export async function POST(request: Request) {
  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const back = () => Response.redirect(new URL('/account/orders/recover?error=1', request.url), 303);
  if (!(await allow(rateLimitKey('order-recovery-ip', request.headers.get('cf-connecting-ip') ?? 'local'), 20, 3600))) return back();
  let form: FormData; try { form = await request.formData(); } catch { return back(); }
  const number = orderNumberFromParam(String(form.get('number') ?? ''));
  if (!number) return back();
  if (!(await allow(rateLimitKey('order-recovery-number', number), 20, 3600))) return back();
  const grant = await recoverOrder(number, String(form.get('code') ?? '').trim().toLowerCase(), new URL(request.url).protocol === 'https:');
  if (!grant) return back();
  return new Response(null, { status: 303, headers: { Location: new URL(`/account/orders/${number}`, request.url).toString(), 'Set-Cookie': grant.cookie, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
}
