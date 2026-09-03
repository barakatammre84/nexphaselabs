import { getAccountFromRequest } from '@/lib/account-auth';
import { acknowledgementsCurrent } from '@/lib/account-rules';
import { validateOrganization, type OrganizationInput } from '@/lib/organization-rules';
import { submitOrganization } from '@/lib/organizations';
import { sameOrigin } from '@/lib/staff-auth';

const FIELDS = [
  'legalName',
  'website',
  'organizationType',
  'addressLine1',
  'addressLine2',
  'city',
  'region',
  'postalCode',
  'country',
  'phone',
  'registrationNumber',
  'researchContext',
  'receivingParty',
] as const;

/** Submit (or resubmit) the account's organisation for verification. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const account = await getAccountFromRequest(request);
  if (!account) return new Response('Unauthorized', { status: 401 });
  if (account.tier !== 'institutional') return new Response('Forbidden', { status: 403 });
  if (!acknowledgementsCurrent(account)) return Response.redirect(new URL('/account', request.url), 303);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return new Response('Bad request', { status: 400 });
  }
  const raw = Object.fromEntries(FIELDS.map((f) => [f, String(form.get(f) ?? '')])) as unknown as OrganizationInput;

  const back = (params: Record<string, string>) => {
    const url = new URL('/account/organization', request.url);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    return Response.redirect(url, 303);
  };

  const validated = validateOrganization(raw, account.email);
  if (!validated.ok) {
    const problems = [
      ...validated.errors,
      ...validated.violations.map((v) => `${v.field}: contains ${v.reason} ("${v.match}").`),
    ];
    // Values are re-shown from the query string; nothing sensitive is in this form.
    const values = Object.fromEntries(FIELDS.map((f) => [`v_${f}`, String(form.get(f) ?? '').slice(0, 2000)]));
    return back({ error: problems.join('|'), ...values });
  }

  try {
    const result = await submitOrganization(account, validated);
    if (!result.ok) return back({ error: result.error });
  } catch (error) {
    console.error('[organization] submit failed', error instanceof Error ? error.message : error);
    return back({ error: 'Your submission could not be saved. Try again shortly.' });
  }
  return Response.redirect(new URL('/account/organization?submitted=1', request.url), 303);
}
