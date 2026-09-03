import { getAccountFromRequest } from '@/lib/account-auth';
import { acknowledgementsCurrent } from '@/lib/account-rules';
import { createOrderFromCart, shipToFromOrganization } from '@/lib/orders';
import { getOrganizationForAccount } from '@/lib/organizations';
import { consumerTierEnabled } from '@/lib/site-config';
import { sameOrigin } from '@/lib/staff-auth';
import { visibilityFor } from '@/lib/visibility-rules';

/**
 * Submit the cart as an order. The ship-to is the verified organisation's
 * address; a consumer account (only when the tier is enabled) cannot yet
 * order here because it has no verified shipping address on file.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const account = await getAccountFromRequest(request);
  if (!account) return new Response('Unauthorized', { status: 401 });
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return new Response('Bad request', { status: 400 });
  }
  const back = (why: string) => Response.redirect(new URL(`/account/cart?error=${encodeURIComponent(why)}`, request.url), 303);

  const visibility = visibilityFor(
    { tier: account.tier, verificationStatus: account.verificationStatus, acknowledgementsCurrent: acknowledgementsCurrent(account) },
    consumerTierEnabled(),
  );
  if (visibility.pricing === 'none') return back('Ordering is not available to your account yet.');
  if (form.get('confirm_ruo') !== 'on') return back('Confirm the research-use acknowledgement for this order.');

  const note = String(form.get('note') ?? '').trim().slice(0, 500) || null;
  const token = String(form.get('token') ?? '');

  try {
    if (account.tier !== 'institutional') {
      return back('Ordering is open to verified research organisations. Email research@nexphaselabs.net.');
    }
    const organization = await getOrganizationForAccount(account.id);
    if (!organization || organization.verificationStatus !== 'approved') return back('Your organisation is not verified.');
    const result = await createOrderFromCart(account, visibility, shipToFromOrganization(organization, account), organization.id, note, token);
    if (!result.ok) return back(result.error);
    return Response.redirect(new URL(`/account/orders/${result.orderNumber}?submitted=${result.duplicate ? 'already' : '1'}`, request.url), 303);
  } catch (error) {
    console.error('[orders] submit failed', error instanceof Error ? error.message : error);
    return back('The order could not be submitted. Try again shortly.');
  }
}
