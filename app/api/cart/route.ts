import { getBuyerFromRequest, createGuestBuyer } from '@/lib/buyer-session';
import { allow, clientAddress, rateLimitKey } from '@/lib/rate-limit';
import { acknowledgementsCurrent } from '@/lib/account-rules';
import { addToCart } from '@/lib/cart';
import { parseQuantityInput } from '@/lib/order-rules';
import { consumerTierEnabled, openCheckoutEnabled } from '@/lib/site-config';
import { sameOrigin } from '@/lib/staff-auth';
import { visibilityFor } from '@/lib/visibility-rules';

/** Add a pack size to the cart. Form POST from the product page. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return new Response('Bad request', { status: 400 });
  }
  const sku = String(form.get('sku') ?? '')
    .trim()
    .toUpperCase();
  const quantity = parseQuantityInput(String(form.get('quantity') ?? '1')) ?? 0;
  const returnTo = String(form.get('return_to') ?? '');
  const back = /^\/catalog\/[a-z0-9-]+$/.test(returnTo) ? returnTo : '/catalog';

  if (!/^NPL-\d{3,4}-[A-Z0-9.]{1,12}$/.test(sku) || !quantity)
    return Response.redirect(new URL(`${back}?cart=invalid`, request.url), 303);
  let account = await getBuyerFromRequest(request);
  let cookie: string | undefined;
  if (!account && openCheckoutEnabled()) {
    if (
      !(await allow(
        rateLimitKey('guest-cart', clientAddress(request)),
        30,
        3600,
      ))
    )
      return new Response('Please try again later.', { status: 429 });
    const guest = await createGuestBuyer(
      new URL(request.url).protocol === 'https:',
    );
    account = guest.buyer;
    cookie = guest.cookie;
  }
  if (!account)
    return Response.redirect(
      new URL('/account/sign-in?return_to=%2Fcatalog', request.url),
      303,
    );
  const go = (path: string) =>
    new Response(null, {
      status: 303,
      headers: {
        Location: new URL(path, request.url).href,
        ...(cookie ? { 'Set-Cookie': cookie } : {}),
      },
    });
  const visibility = visibilityFor(
    {
      tier: account.tier,
      verificationStatus: account.verificationStatus,
      acknowledgementsCurrent: acknowledgementsCurrent(account),
    },
    consumerTierEnabled(),
    openCheckoutEnabled(),
  );

  try {
    const result = await addToCart(account.id, sku, quantity, visibility);
    if (!result.ok)
      return go(`${back}?cart=error&why=${encodeURIComponent(result.error)}`);
  } catch (error) {
    console.error(
      '[cart] add failed',
      error instanceof Error ? error.message : error,
    );
    return go(`${back}?cart=unavailable`);
  }
  return go('/account/cart?added=1');
}
