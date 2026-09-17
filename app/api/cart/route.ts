import { getBuyerFromRequest, createGuestBuyer } from '@/lib/buyer-session';
import { allow, clientAddress, rateLimitKey } from '@/lib/rate-limit';
import { acknowledgementsCurrent } from '@/lib/account-rules';
import { addToCart, getCart } from '@/lib/cart';
import { cartSummary, wantsJson } from '@/lib/cart-summary';
import { parseQuantityInput } from '@/lib/order-rules';
import { accountRequired, researcherTierEnabled, openCheckoutEnabled } from '@/lib/site-config';
import { redirectWithNotice } from '@/lib/notice';
import { sameOrigin } from '@/lib/staff-auth';
import { visibilityFor, type Visibility } from '@/lib/visibility-rules';
import type { AccountPrincipal } from '@/lib/account-auth';

const NO_STORE = { 'Cache-Control': 'no-store' };

function visibilityOf(account: AccountPrincipal): Visibility {
  return visibilityFor(
    {
      tier: account.tier,
      verificationStatus: account.verificationStatus,
      acknowledgementsCurrent: acknowledgementsCurrent(account),
    },
    researcherTierEnabled(),
    openCheckoutEnabled(),
    accountRequired(),
  );
}

/** The signed-in buyer's cart, for the side drawer. Never cached, never for strangers. */
export async function GET(request: Request) {
  const account = await getBuyerFromRequest(request);
  if (!account)
    return Response.json(
      { ok: false, error: 'Sign in to see your cart.', signIn: '/account/sign-in?return_to=%2Faccount%2Fcart' },
      { status: 401, headers: NO_STORE },
    );
  try {
    const cart = await getCart(account.id, visibilityOf(account));
    return Response.json({ ok: true, ...cartSummary(cart) }, { headers: NO_STORE });
  } catch (error) {
    console.error('[cart] read failed', error instanceof Error ? error.message : error);
    return Response.json({ ok: false, error: 'The cart is temporarily unavailable.' }, { status: 503, headers: NO_STORE });
  }
}

/**
 * Add a pack size to the cart. A plain form POST from the product page gets the
 * redirects it always did; a fetch() that asks for JSON gets the answer the side
 * drawer needs (the count, or the reason) and stays on the page.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const json = wantsJson(request);

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
    return json
      ? Response.json({ ok: false, error: 'That pack size or quantity is not valid.' }, { status: 400, headers: NO_STORE })
      : Response.redirect(new URL(`${back}?cart=invalid`, request.url), 303);
  let account = await getBuyerFromRequest(request);
  let cookie: string | undefined;
  if (!account && openCheckoutEnabled() && !accountRequired()) {
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
  // No session and no guest path: sign in, then land back on the product page.
  const signIn = `/account/sign-in?return_to=${encodeURIComponent(back)}`;
  if (!account)
    return json
      ? Response.json({ ok: false, error: 'Sign in to add to your cart.', signIn }, { status: 401, headers: NO_STORE })
      : Response.redirect(new URL(signIn, request.url), 303);
  const go = (path: string) =>
    new Response(null, {
      status: 303,
      headers: {
        Location: new URL(path, request.url).href,
        ...(cookie ? { 'Set-Cookie': cookie } : {}),
      },
    });
  const visibility = visibilityOf(account);

  try {
    const result = await addToCart(account.id, sku, quantity, visibility);
    // The refusal's words travel in a short-lived cookie, never in the link (lib/notice.ts).
    if (!result.ok)
      return json
        ? Response.json({ ok: false, error: result.error }, { status: 409, headers: NO_STORE })
        : redirectWithNotice(request, `${back}?cart=error`, result.error, cookie ? [cookie] : []);
    if (json) {
      const summary = cartSummary(await getCart(account.id, visibility));
      return Response.json(
        { ok: true, ...summary },
        { headers: { ...NO_STORE, ...(cookie ? { 'Set-Cookie': cookie } : {}) } },
      );
    }
  } catch (error) {
    console.error(
      '[cart] add failed',
      error instanceof Error ? error.message : error,
    );
    return json
      ? Response.json({ ok: false, error: 'The cart is temporarily unavailable.' }, { status: 503, headers: NO_STORE })
      : go(`${back}?cart=unavailable`);
  }
  return go('/account/cart?added=1');
}
