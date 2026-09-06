import { canFulfil, getStaffFromRequest, sameOrigin } from '@/lib/staff-auth';
import { allow, rateLimitKey } from '@/lib/rate-limit';
import { quoteShipping } from '@/lib/shipping-provider';

export async function POST(request: Request) {
  const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  if (!sameOrigin(request)) return reply({ error: 'Forbidden' }, 403);
  const staff = await getStaffFromRequest(request);
  if (!staff) return reply({ error: 'Unauthorized' }, 401);
  if (!canFulfil(staff)) return reply({ error: 'Forbidden' }, 403);
  if (!(await allow(rateLimitKey('shipping-quotes', staff.id), 30, 3600))) return reply({ error: 'Quote limit reached. Try again later.' }, 429);
  let form: FormData;
  try { form = await request.formData(); } catch { return reply({ error: 'Invalid form' }, 400); }
  if (form.get('ordinaryParcel') !== 'on') return reply({ error: 'Confirm material and packing suitability before quoting an ordinary parcel.' }, 400);
  const text = (key: string) => String(form.get(key) ?? '').trim();
  const maxDays = text('maxDays') ? Number(text('maxDays')) : null;
  if (maxDays !== null && (!Number.isInteger(maxDays) || maxDays < 1 || maxDays > 30)) return reply({ error: 'Transit days must be a whole number from 1 to 30.' }, 400);
  if (!['true', 'false'].includes(text('residential'))) return reply({ error: 'Choose residential or commercial.' }, 400);
  const result = await quoteShipping({ name: text('name'), street1: text('street1'), city: text('city'), state: text('state').toUpperCase(), zip: text('zip'), country: 'US', is_residential: text('residential') === 'true' },
    { length: Number(text('length')), width: Number(text('width')), height: Number(text('height')), weight: Number(text('weight')) }, { services: [], maxEstimatedDays: maxDays });
  return reply(result, result.ok ? 200 : 422);
}
