import { signUp } from '@/lib/account-auth';
import { validateSignUp } from '@/lib/account-rules';
import { consumerTierEnabled } from '@/lib/site-config';
import { allow, clientAddress, rateLimitKey } from '@/lib/rate-limit';
import { sameOrigin } from '@/lib/staff-auth';

/**
 * Account sign-up. Plain form POST. On success the person is sent to a
 * "check your email" page; the account cannot sign in until verified.
 * An email that already has an account gets the same success page, so the
 * form cannot be used to discover who has an account.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return new Response('Bad request', { status: 400 });
  }
  const field = (name: string) => String(form.get(name) ?? '');
  const raw = {
    name: field('name'),
    email: field('email'),
    password: field('password'),
    tier: field('tier') || 'institutional',
    acceptTerms: form.get('accept_terms') === 'on',
    acceptRuo: form.get('accept_ruo') === 'on',
  };

  const back = (params: Record<string, string>) => {
    const url = new URL('/account/sign-up', request.url);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    return Response.redirect(url, 303);
  };

  const validated = validateSignUp(raw, consumerTierEnabled());
  if (!validated.ok) {
    // Errors are re-shown from a compact code list; values are not echoed
    // through the URL (the password never leaves the POST body).
    return back({
      error: 'validation',
      codes: validated.errors.join('|'),
      name: raw.name.slice(0, 120),
      email: raw.email.slice(0, 254),
      tier: raw.tier,
    });
  }

  try {
    // Flood control per address (5/hour) and per IP (10/hour). Behind Cloudflare the IP is
    // cf-connecting-ip; in local dev every caller shares the 'unknown' bucket. When exceeded the
    // same "check your email" page is shown and nothing is created or sent.
    const [byAddress, byIp] = await Promise.all([
      allow(rateLimitKey('signup:email', validated.value.email), 5, 3600),
      allow(rateLimitKey('signup:ip', clientAddress(request)), 10, 3600),
    ]);
    if (!byAddress || !byIp) {
      console.warn('[account] sign-up rate-limited');
      return Response.redirect(new URL(`/account/check-email?email=${encodeURIComponent(validated.value.email)}`, request.url), 303);
    }
    const result = await signUp(validated.value, request.headers.get('user-agent'));
    if (!result.ok && result.reason === 'email') return back({ error: 'email' });
    // 'exists' falls through to the same success page deliberately.
    const done = new URL('/account/check-email', request.url);
    done.searchParams.set('email', validated.value.email);
    if (result.ok && !result.emailSent) done.searchParams.set('sent', '0');
    return Response.redirect(done, 303);
  } catch (error) {
    console.error('[account] sign-up failed', error instanceof Error ? error.message : error);
    return back({ error: 'unavailable' });
  }
}
