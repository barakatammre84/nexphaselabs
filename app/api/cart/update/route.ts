import { getBuyerFromRequest } from '@/lib/buyer-session';
import { setCartQuantity } from '@/lib/cart';
import { parseQuantityInput } from '@/lib/order-rules';
import { sameOrigin } from '@/lib/staff-auth';

/** Change a line's quantity (0 removes it). Only the owner's lines are affected. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 });
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
    return Response.redirect(
      new URL('/account/cart?error=invalid', request.url),
      303,
    );
  }
  try {
    await setCartQuantity(account.id, itemId, quantity);
  } catch (error) {
    console.error(
      '[cart] update failed',
      error instanceof Error ? error.message : error,
    );
    return Response.redirect(
      new URL('/account/cart?error=unavailable', request.url),
      303,
    );
  }
  return Response.redirect(new URL('/account/cart', request.url), 303);
}
