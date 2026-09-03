import { changeOwnPassword } from '@/lib/staff-admin';
import { getStaffFromRequestIncludingPasswordChange, safeReturnPath, sameOrigin } from '@/lib/staff-auth';

/** A signed-in staff member sets their own password. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const staff = await getStaffFromRequestIncludingPasswordChange(request);
  if (!staff) return Response.redirect(new URL('/staff/sign-in?return_to=%2Fmanage', request.url), 303);
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return new Response('Bad request', { status: 400 });
  }
  const returnTo = safeReturnPath(String(form.get('return_to') ?? ''));
  const back = (reason: string) =>
    Response.redirect(new URL(`/staff/password?error=${reason}&return_to=${encodeURIComponent(returnTo)}${staff.mustChangePassword ? '&required=1' : ''}`, request.url), 303);
  const current = String(form.get('current') ?? '');
  const next = String(form.get('next') ?? '');
  const confirm = String(form.get('confirm') ?? '');
  if (!current || !next || !confirm) return back('missing');
  let result: Awaited<ReturnType<typeof changeOwnPassword>>;
  try {
    result = await changeOwnPassword(staff, current, next, confirm);
  } catch (error) {
    console.error('[staff] password change failed', error instanceof Error ? error.message : error);
    return back('unavailable');
  }
  if (!result.ok) {
    const code = /not correct/.test(result.error) ? 'current' : /12 characters|too long/.test(result.error) ? 'policy' : /do not match/.test(result.error) ? 'mismatch' : /not used/.test(result.error) ? 'reused' : 'unavailable';
    return back(code);
  }
  const headers = new Headers({ Location: new URL(staff.mustChangePassword ? returnTo : `/staff/password?changed=1&return_to=${encodeURIComponent(returnTo)}`, request.url).toString() });
  headers.set('Cache-Control', 'no-store');
  return new Response(null, { status: 303, headers });
}
