import { getAccountFromRequest } from '@/lib/account-auth';
import {
  archiveAddress,
  saveAddress,
  setDefaultAddress,
} from '@/lib/account-addresses';
import { sameOrigin } from '@/lib/staff-auth';

/**
 * A customer's own saved delivery addresses.
 *
 * Signed-in accounts only: a guest has no account to save against, and a guest
 * contact is an order snapshot rather than an identity (chapter 10 §10.8).
 * Every operation is scoped to the signed-in account inside the query itself,
 * so an id belonging to someone else simply does not resolve.
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

  const back = (params: Record<string, string>) => {
    const url = new URL('/account/addresses', request.url);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    return Response.redirect(url, 303);
  };

  const value = (name: string, max = 160) => String(form.get(name) ?? '').trim().slice(0, max);
  const intent = value('intent', 16);
  const addressId = value('address', 40);

  try {
    if (intent === 'remove') {
      const result = await archiveAddress(account.id, addressId);
      return back(result.ok ? { removed: '1' } : { address_error: result.error });
    }
    if (intent === 'default') {
      const result = await setDefaultAddress(account.id, addressId);
      return back(result.ok ? { defaulted: '1' } : { address_error: result.error });
    }
    if (intent !== 'save') return back({ address_error: 'Unknown request.' });

    const result = await saveAddress(
      account.id,
      {
        label: value('label', 40) || null,
        consigneeName: value('name'),
        consigneeInstitution: value('company') || null,
        line1: value('line1'),
        line2: value('line2') || null,
        city: value('city'),
        region: value('region', 80),
        postalCode: value('postalCode', 24),
        country: (value('country', 2) || 'US').toUpperCase(),
        phone: value('phone', 40) || null,
      },
      { makeDefault: form.get('make_default') === 'on' },
    );
    return back(result.ok ? { saved: '1' } : { address_error: result.error });
  } catch (error) {
    console.error('[addresses] failed', error instanceof Error ? error.message : error);
    return back({ address_error: 'The address could not be saved. Try again shortly.' });
  }
}
