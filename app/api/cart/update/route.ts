import { acknowledgementsCurrent } from '@/lib/account-rules';
import { getBuyerFromRequest } from '@/lib/buyer-session';
import { getCart, setCartQuantity } from '@/lib/cart';
import { cartSummary, wantsJson } from '@/lib/cart-summary';
import { freeShippingThresholdCents } from '@/lib/free-shipping';
import { parseQuantityInput } from '@/lib/order-rules';
import { accountRequired, openCheckoutEnabled, researcherTierEnabled } from '@/lib/site-config';
import { sameOrigin } from '@/lib/staff-auth';
import { visibilityFor } from '@/lib/visibility-rules';

const NO_STORE = { 'Cache-Control': 'no-store' };

/**
 * Change a line's quantity (0 removes it). Only the owner's lines are affected.
 * The cart page posts a form and is redirected back; the side drawer asks for
 * JSON and gets the updated cart in the answer.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const json = wantsJson(request);
  const account = await getBuyerFromRequest(request);
  if (!account) return new Response('Unauthorized', { status: 401 });
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return new Response('Bad request', { status: 400 });
  }
  const itemId = String(form.get('item') ?? '');
  const quantity =
    form.get('remove') === '1'
      ? 0
      : parseQuantityInput(String(form.get('quantity') ?? ''));
  if (!/^cit_[a-z0-9]{8,32}$/.test(itemId) || quantity === null) {
    return json
      ? Response.json({ ok: false, error: 'That change was not valid.' }, { status: 400, headers: NO_STORE })
      : Response.redirect(new URL('/account/cart?error=invalid', request.url), 303);
  }
  try {
    await setCartQuantity(account.id, itemId, quantity);
    if (json) {
      const visibility = visibilityFor(
        {
          tier: account.tier,
          verificationStatus: account.verificationStatus,
          acknowledgementsCurrent: acknowledgementsCurrent(account),
        },
        researcherTierEnabled(),
        openCheckoutEnabled(),
        accountRequired(),
      );
      const summary = cartSummary(await getCart(account.id, visibility), await freeShippingThresholdCents());
      return Response.json({ ok: true, ...summary }, { headers: NO_STORE });
    }
  } catch (error) {
    console.error(
      '[cart] update failed',
      error instanceof Error ? error.message : error,
    );
    return json
      ? Response.json({ ok: false, error: 'The cart is temporarily unavailable.' }, { status: 503, headers: NO_STORE })
      : Response.redirect(new URL('/account/cart?error=unavailable', request.url), 303);
  }
  return Response.redirect(new URL('/account/cart', request.url), 303);
}
