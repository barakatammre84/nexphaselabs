import { acknowledgementsCurrent } from '@/lib/account-rules';
import { getBuyerFromRequest } from '@/lib/buyer-session';
import { getCart } from '@/lib/cart';
import { createCheckoutQuotes } from '@/lib/checkout-quotes';
import { normaliseCouponCode } from '@/lib/coupons';
import { validateCheckout } from '@/lib/checkout-input';
import { shipToFromOrganization } from '@/lib/orders';
import { getOrganizationForAccount } from '@/lib/organizations';
import { allow, rateLimitKey } from '@/lib/rate-limit';
import { accountRequired, researcherTierEnabled, openCheckoutEnabled } from '@/lib/site-config';
import { sameOrigin } from '@/lib/staff-auth';
import { STOREFRONT_COPY } from '@/lib/storefront-copy';
import { visibilityFor } from '@/lib/visibility-rules';

/**
 * Delivery and tax quotes for the buyer's cart. Open checkout quotes the address
 * typed into the form. Wholesale checkout quotes the approved organization's
 * address on record, the only place those orders ship, so its shipping and tax
 * are shown before payment too.
 */
export async function POST(request: Request) {
  const reply = (body: unknown, status = 200) =>
    Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  if (!sameOrigin(request)) return reply({ error: 'Forbidden' }, 403);
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
  const open = openCheckoutEnabled();
  const typed = open ? validateCheckout(form) : null;
  if (typed && !typed.ok) return reply({ error: typed.error }, 422);
  if (!open && account.tier !== 'institutional')
    return reply({ error: STOREFRONT_COPY.orderingWholesaleOnly }, 403);
  const visibility = visibilityFor(
    {
      tier: account.tier,
      verificationStatus: account.verificationStatus,
      acknowledgementsCurrent: acknowledgementsCurrent(account),
    },
    researcherTierEnabled(),
    open,
    accountRequired(),
  );
  try {
    let shipTo: ReturnType<typeof shipToFromOrganization>;
    let contactEmail: string | null;
    if (typed?.ok) {
      shipTo = typed.details.shipTo;
      contactEmail = typed.details.contactEmail;
    } else {
      const organization = await getOrganizationForAccount(account.id);
      if (!organization || organization.verificationStatus !== 'approved')
        return reply({ error: STOREFRONT_COPY.orderingUnapproved }, 403);
      shipTo = shipToFromOrganization(organization, account);
      // A wholesale order records no separate contact email, so its quote has none either.
      contactEmail = null;
    }
    const cart = await getCart(account.id, visibility);
    const result = await createCheckoutQuotes(
      account.id,
      cart,
      shipTo,
      contactEmail,
      normaliseCouponCode(form.get('coupon')),
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
