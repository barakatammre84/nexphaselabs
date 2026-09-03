import { getAccountFromRequest } from '@/lib/account-auth';
import { acknowledgementsCurrent } from '@/lib/account-rules';
import { addToCart } from '@/lib/cart';
import { parseQuantityInput } from '@/lib/order-rules';
import { consumerTierEnabled } from '@/lib/site-config';
import { sameOrigin } from '@/lib/staff-auth';
import { visibilityFor } from '@/lib/visibility-rules';

/** Add a pack size to the cart. Form POST from the product page. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const account = await getAccountFromRequest(request);
  if (!account) return Response.redirect(new URL('/account/sign-in?return_to=%2Fcatalog', request.url), 303);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return new Response('Bad request', { status: 400 });
  }
  const sku = String(form.get('sku') ?? '').trim().toUpperCase();
  const quantity = parseQuantityInput(String(form.get('quantity') ?? '1')) ?? 0;
  const returnTo = String(form.get('return_to') ?? '');
  const back = /^\/catalog\/[a-z0-9-]+$/.test(returnTo) ? returnTo : '/catalog';

  const visibility = visibilityFor(
    { tier: account.tier, verificationStatus: account.verificationStatus, acknowledgementsCurrent: acknowledgementsCurrent(account) },
    consumerTierEnabled(),
  );
  if (!/^NPL-\d{3,4}-[A-Z0-9.]{1,12}$/.test(sku)) return Response.redirect(new URL(`${back}?cart=invalid`, request.url), 303);

  try {
    const result = await addToCart(account.id, sku, quantity, visibility);
    if (!result.ok) return Response.redirect(new URL(`${back}?cart=error&why=${encodeURIComponent(result.error)}`, request.url), 303);
  } catch (error) {
    console.error('[cart] add failed', error instanceof Error ? error.message : error);
    return Response.redirect(new URL(`${back}?cart=unavailable`, request.url), 303);
  }
  return Response.redirect(new URL('/account/cart?added=1', request.url), 303);
}
