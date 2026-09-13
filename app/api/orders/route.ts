import { getBuyerFromRequest } from '@/lib/buyer-session';
import { rememberOrderAddress } from '@/lib/account-addresses';
import { requestContactVerification } from '@/lib/order-contact-verification';
import { acknowledgementsCurrent } from '@/lib/account-rules';
import { createOrderFromCart, shipToFromOrganization } from '@/lib/orders';
import { getOrganizationForAccount } from '@/lib/organizations';
import { researcherTierEnabled, openCheckoutEnabled } from '@/lib/site-config';
import { validateCheckout } from '@/lib/checkout-input';
import { connectingAddress, normaliseResearchSetting } from '@/lib/attestation';
import { allow, rateLimitKey } from '@/lib/rate-limit';
import { sameOrigin } from '@/lib/staff-auth';
import { visibilityFor } from '@/lib/visibility-rules';

/** Submit a buyer-owned cart; open checkout accepts delivery details without account verification. */
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
  const back = (why: string) =>
    Response.redirect(
      new URL(`/account/cart?error=${encodeURIComponent(why)}`, request.url),
      303,
    );

  const visibility = visibilityFor(
    {
      tier: account.tier,
      verificationStatus: account.verificationStatus,
      acknowledgementsCurrent: acknowledgementsCurrent(account),
    },
    researcherTierEnabled(),
    openCheckoutEnabled(),
  );
  if (visibility.pricing === 'none')
    return back('Ordering is not available to your account yet.');
  if (form.get('confirm_ruo') !== 'on')
    return back('Confirm the research-use acknowledgement for this order.');

  const note =
    String(form.get('note') ?? '')
      .trim()
      .slice(0, 500) || null;
  const token = String(form.get('token') ?? '');

  try {
    if (!(await allow(rateLimitKey('checkout', account.id), 30, 3600)))
      return back('Please try again later.');
    if (openCheckoutEnabled()) {
      const checkout = validateCheckout(form);
      if (!checkout.ok) return back(checkout.error);
      const result = await createOrderFromCart(
        account,
        visibility,
        checkout.details.shipTo,
        null,
        note,
        token,
        checkout.details.contactEmail,
        String(form.get('checkout_quote') ?? '') || null,
        {
          from: connectingAddress(request),
          researchSetting: normaliseResearchSetting(form.get('research_setting')),
        },
      );
      if (!result.ok) return back(result.error);
      // Both of these happen only after the order is accepted, never as a side
      // effect of an attempt that failed.
      //
      // The verification request is a recall requirement (chapter 10 §10.6), not
      // a gate: the order is already placed, nothing waits on the customer
      // clicking, and a guest is asked exactly like anyone else.
      if (result.orderId) {
        try {
          await requestContactVerification(result.orderId);
        } catch (error) {
          console.error('[orders] verification not requested', error instanceof Error ? error.message : error);
        }
      }
      // A saved address needs an account to save against; guests have none.
      if (form.get('save_address') === 'on' && account.status !== 'guest') {
        try {
          await rememberOrderAddress(
            account.id,
            checkout.details.shipTo,
            String(form.get('address_label') ?? '').trim().slice(0, 40) || null,
          );
        } catch (error) {
          console.error('[orders] address not saved', error instanceof Error ? error.message : error);
        }
      }
      return Response.redirect(
        new URL(
          `/account/orders/${result.orderNumber}?submitted=${result.duplicate ? 'already' : '1'}`,
          request.url,
        ),
        303,
      );
    }
    if (account.tier !== 'institutional') {
      return back(
        'Ordering is open to verified research organisations. Email research@nexphaselabs.net.',
      );
    }
    const organization = await getOrganizationForAccount(account.id);
    if (!organization || organization.verificationStatus !== 'approved')
      return back('Your organisation is not verified.');
    const result = await createOrderFromCart(
      account,
      visibility,
      shipToFromOrganization(organization, account),
      organization.id,
      note,
      token,
    );
    if (!result.ok) return back(result.error);
    return Response.redirect(
      new URL(
        `/account/orders/${result.orderNumber}?submitted=${result.duplicate ? 'already' : '1'}`,
        request.url,
      ),
      303,
    );
  } catch (error) {
    console.error(
      '[orders] submit failed',
      error instanceof Error ? error.message : error,
    );
    return back('The order could not be submitted. Try again shortly.');
  }
}
