import type { Metadata } from 'next';
import { GoogleButton } from '@/components/site/google-button';
import Link from 'next/link';
import { RESEARCH_SETTINGS } from '@/lib/account-rules';
import { redirect } from 'next/navigation';
import { AlertCircle } from 'lucide-react';
import { getAccount } from '@/lib/account-auth';
import { AccessProgress } from '@/components/site/access-progress';
import { AGE_STATEMENT, MINIMUM_AGE, RUO_ACKNOWLEDGEMENT } from '@/lib/policy';
import { latestBirthDate } from '@/lib/account-rules';
import { turnstileEnabled, turnstileSiteKey } from '@/lib/turnstile';
import { NEWSLETTER_COPY } from '@/lib/marketing-consent';
import { researcherTierEnabled } from '@/lib/site-config';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Create a research account',
  description:
    'Open a NexPhase Labs research account. Accounts are reviewed before pricing and ordering are enabled.',
};

type Props = {
  searchParams: Promise<{
    error?: string;
    codes?: string;
    name?: string;
    email?: string;
    tier?: string;
  }>;
};

const input =
  'h-12 w-full rounded-xl border border-foreground/20 bg-background px-4 text-sm outline-none focus:border-primary';

export default async function SignUpPage({ searchParams }: Props) {
  const params = await searchParams;
  if (await getAccount()) redirect('/account');
  const consumer = researcherTierEnabled();
  const turnstile = turnstileEnabled() ? turnstileSiteKey() : null;

  const errors =
    params.error === 'validation' && params.codes
      ? params.codes.split('|').filter(Boolean).slice(0, 10)
      : params.error === 'turnstile'
        ? ['We could not confirm that the request came from a person. Reload the page and try again.']
      : params.error === 'email'
        ? ['We could not send the verification email. Try again shortly.']
        : params.error === 'unavailable'
          ? ['Sign-up is temporarily unavailable. Try again shortly.']
          : [];

  return (
    <main className="text-foreground">
      <section className="ion-panel mx-auto my-12 max-w-3xl px-7 py-10 sm:px-10">
        <p className="ion-kicker">{consumer ? 'Your account' : 'Wholesale account'}</p>
        <h1 className="ion-heading mt-6 text-4xl sm:text-5xl">
          Create your account
        </h1>
        <p className="mt-4 leading-7 text-muted-foreground">
          {consumer
            ? 'An account keeps your orders, saved addresses and the certificates that shipped with each order in one place. You can also check out as a guest without one.'
            : 'An account is the first step of a wholesale application. Prices, lot availability and ordering open once a person has approved it.'}
        </p>

        {!consumer && <AccessProgress current={0} />}

        {errors.length > 0 && (
          <div
            role="alert"
            className="mt-8 border border-destructive/40 bg-secondary p-5"
          >
            <p className="flex items-center gap-2 text-sm font-semibold">
              <AlertCircle className="size-4 text-destructive" /> Please fix the
              following:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-6 text-sm">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        )}

        <GoogleButton returnTo="/account" label="Sign up with Google" />

        <form
          method="post"
          action="/api/account/sign-up"
          className="mt-10 flex flex-col gap-6"
        >
          <div className="flex flex-col gap-2">
            <label htmlFor="name" className="text-sm font-semibold">
              Full name
            </label>
            <input
              id="name"
              name="name"
              required
              autoComplete="name"
              defaultValue={params.name ?? ''}
              className={input}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="email" className="text-sm font-semibold">
              Work email address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              defaultValue={params.email ?? ''}
              className={input}
            />
            <p className="text-xs leading-5 text-muted-foreground">
              For a wholesale account, use an address on your organisation&rsquo;s own domain.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="password" className="text-sm font-semibold">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={12}
              autoComplete="new-password"
              className={input}
            />
            <p className="text-xs leading-5 text-muted-foreground">
              At least 12 characters.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="date_of_birth" className="text-sm font-semibold">
              Date of birth
            </label>
            <input
              id="date_of_birth"
              name="date_of_birth"
              type="date"
              required
              max={latestBirthDate()}
              autoComplete="bday"
              className={input}
            />
            <p className="text-xs leading-5 text-muted-foreground">
              Used only to check that you are at least {MINIMUM_AGE}. It is never shown or shared.
            </p>
          </div>

          {consumer ? (
            <fieldset className="flex flex-col gap-3">
              <legend className="text-sm font-semibold">Account type</legend>
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="radio"
                  name="tier"
                  value="researcher"
                  defaultChecked={params.tier !== 'institutional'}
                  className="mt-1"
                />
                <span>
                  <span className="font-semibold">Researcher</span>
                  <span className="block text-muted-foreground">
                    Buy from the storefront at list price, in any research setting — including an
                    independent or home laboratory. Laboratory research use only.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="radio"
                  name="tier"
                  value="institutional"
                  defaultChecked={params.tier === 'institutional'}
                  className="mt-1"
                />
                <span>
                  <span className="font-semibold">Wholesale account</span>
                  <span className="block text-muted-foreground">
                    A university, CRO or company buying on purchase order with net terms. A
                    person approves the application before ordering.
                  </span>
                </span>
              </label>
            </fieldset>
          ) : (
            <input type="hidden" name="tier" value="institutional" />
          )}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="research_setting" className="text-sm font-semibold">
              Research setting <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <select
              id="research_setting"
              name="research_setting"
              defaultValue=""
              className="h-11 rounded-xl border border-border bg-background px-3 text-sm"
            >
              <option value="">Choose one</option>
              {RESEARCH_SETTINGS.map((setting) => (
                <option key={setting} value={setting}>
                  {setting}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Helps us route documentation requests. It is not a verification step and does not
              restrict where we ship.
            </p>
          </div>

          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" name="product_news" className="mt-1" />
            <span>
              <span className="font-semibold">Product news (optional)</span>
              <span className="block text-muted-foreground">{NEWSLETTER_COPY.scope} Confirmed by the same
              email that verifies your account; unsubscribe any time.</span>
            </span>
          </label>

          <div className="rounded-[1.4rem] border border-border bg-secondary p-5">
            <p className="utility-label text-primary">
              Research-use acknowledgement
            </p>
            <p className="mt-3 text-sm leading-6">{RUO_ACKNOWLEDGEMENT}</p>
            <label className="mt-4 flex items-start gap-3 text-sm">
              <input type="checkbox" name="accept_age" required className="mt-1" />
              <span>{AGE_STATEMENT}</span>
            </label>
            <label className="mt-3 flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                name="accept_ruo"
                required
                className="mt-1"
              />
              <span>I confirm the acknowledgement above.</span>
            </label>
            <label className="mt-3 flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                name="accept_terms"
                required
                className="mt-1"
              />
              <span>
                I accept the{' '}
                <Link
                  href="/legal/terms"
                  className="font-semibold text-primary"
                >
                  terms of sale
                </Link>{' '}
                and the{' '}
                <Link
                  href="/legal/privacy"
                  className="font-semibold text-primary"
                >
                  privacy policy
                </Link>
                .
              </span>
            </label>
          </div>

          {turnstile && (
            <>
              <div className="cf-turnstile" data-sitekey={turnstile} data-theme="light" />
              <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
            </>
          )}
          <button
            type="submit"
            className="action-primary"
          >
            Create account
          </button>
          <p className="text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link
              href="/account/sign-in"
              className="font-semibold text-primary"
            >
              Sign in
            </Link>
          </p>
        </form>
      </section>
    </main>
  );
}
