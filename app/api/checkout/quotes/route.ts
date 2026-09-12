import { acknowledgementsCurrent } from '@/lib/account-rules';
import { getBuyerFromRequest } from '@/lib/buyer-session';
import { getCart } from '@/lib/cart';
import { createCheckoutQuotes } from '@/lib/checkout-quotes';
import { validateCheckout } from '@/lib/checkout-input';
import { allow, rateLimitKey } from '@/lib/rate-limit';
import { researcherTierEnabled, openCheckoutEnabled } from '@/lib/site-config';
import { sameOrigin } from '@/lib/staff-auth';
import { visibilityFor } from '@/lib/visibility-rules';

export async function POST(request: Request) {
  const reply = (body: unknown, status = 200) =>
    Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  if (!sameOrigin(request)) return reply({ error: 'Forbidden' }, 403);
  if (!openCheckoutEnabled())
    return reply({ error: 'Guest delivery quotes are not enabled.' }, 404);
  const account = await getBuyerFromRequest(request);
  if (!account)
    return reply(
      { error: 'Your cart session expired. Add the material again.' },
      401,
    );
  if (!(await allow(rateLimitKey('checkout-quotes', account.id), 20, 3600)))
    return reply({ error: 'Quote limit reached. Try again later.' }, 429);
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return reply({ error: 'The delivery form could not be read.' }, 400);
  }
  const checkout = validateCheckout(form);
  if (!checkout.ok) return reply({ error: checkout.error }, 422);
  const visibility = visibilityFor(
    {
      tier: account.tier,
      verificationStatus: account.verificationStatus,
      acknowledgementsCurrent: acknowledgementsCurrent(account),
    },
    researcherTierEnabled(),
    true,
  );
  try {
    const cart = await getCart(account.id, visibility);
    const result = await createCheckoutQuotes(
      account.id,
      cart,
      checkout.details.shipTo,
      checkout.details.contactEmail,
    );
    return reply(result, result.ok ? 200 : 422);
  } catch (error) {
    console.error(
      '[checkout-quote] failed',
      error instanceof Error ? error.message : error,
    );
    return reply(
      { error: 'Delivery and tax could not be confirmed. Try again.' },
      503,
    );
  }
}
