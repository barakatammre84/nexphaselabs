import { createCoupon, setCouponActive, type CouponInput } from '@/lib/coupons';
import { redirectWithNotice } from '@/lib/notice';
import { canManageStaff, getStaffFromRequest, sameOrigin } from '@/lib/staff-auth';

/**
 * Promo codes are created and switched off by administrators (owner, 16 Sep
 * 2026). Codes are never deleted: a code that must stop working is deactivated
 * and its redemptions stay on their orders.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const staff = await getStaffFromRequest(request);
  if (!staff) return new Response('Unauthorized', { status: 401 });
  if (!canManageStaff(staff)) return new Response('Forbidden', { status: 403 });
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return new Response('Bad request', { status: 400 });
  }
  const value = (name: string, max = 200) => String(form.get(name) ?? '').trim().slice(0, max);
  const optionalInt = (name: string) => {
    const raw = value(name, 20);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? Math.round(n) : Number.NaN;
  };
  const optionalDate = (name: string) => {
    const raw = value(name, 32);
    if (!raw) return null;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? Number.NaN : d;
  };
  const done = (message: string) => redirectWithNotice(request, '/manage/coupons?saved=1', message);
  const failed = (message: string) => redirectWithNotice(request, '/manage/coupons?error=1', message);

  const intent = value('intent', 16);
  try {
    if (intent === 'toggle') {
      const id = value('id', 40);
      const active = value('active', 5) === 'on';
      const ok = await setCouponActive(id, active);
      return ok ? done(active ? 'Promo code switched on.' : 'Promo code switched off.') : failed('That promo code was not found.');
    }
    if (intent !== 'create') return failed('Unknown request.');
    const kind = value('kind', 10) === 'fixed' ? 'fixed' : 'percent';
    const amount = Number(value('value', 20));
    const minSubtotal = optionalInt('min_subtotal_dollars');
    const startsAt = optionalDate('starts_at');
    const endsAt = optionalDate('ends_at');
    const maxRedemptions = optionalInt('max_redemptions');
    const perAccountLimit = optionalInt('per_account_limit');
    if ([minSubtotal, maxRedemptions, perAccountLimit].some((n) => Number.isNaN(n)) || [startsAt, endsAt].some((d) => Number.isNaN(d as number)))
      return failed('Enter whole numbers for the limits and valid dates for the window.');
    const input: CouponInput = {
      code: value('code', 32).toUpperCase(),
      kind,
      // Percent is entered as a whole number; a fixed amount is entered in dollars.
      value: kind === 'percent' ? Math.round(amount) : Math.round(amount * 100),
      minSubtotalCents: minSubtotal === null ? null : minSubtotal * 100,
      startsAt: startsAt as Date | null,
      endsAt: endsAt as Date | null,
      maxRedemptions,
      perAccountLimit,
      note: value('note', 200) || null,
    };
    const result = await createCoupon(input, `${staff.name} (${staff.id})`);
    return result.ok ? done(`Promo code ${input.code} created.`) : failed(result.error);
  } catch (error) {
    console.error('[coupons] failed', error instanceof Error ? error.message : error);
    return failed('That could not be saved. Try again shortly.');
  }
}
