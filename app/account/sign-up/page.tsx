import type { Metadata } from 'next';
import { GoogleButton } from '@/components/site/google-button';
import Link from 'next/link';
import { RESEARCH_SETTINGS } from '@/lib/account-rules';
import { redirect } from 'next/navigation';
import { AlertCircle } from 'lucide-react';
import { getAccount } from '@/lib/account-auth';
import { AccessProgress } from '@/components/site/access-progress';
import { MINIMUM_AGE } from '@/lib/policy';
import { SignupAcknowledgements } from '@/components/site/signup-acknowledgements';
import { latestBirthDate } from '@/lib/account-rules';
import { turnstileEnabled, turnstileSiteKey } from '@/lib/turnstile';
import { accountRequired, researcherTierEnabled } from '@/lib/site-config';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Create a research account',
  description:
    'Create a research account with your email address. Verify your email to access researcher pricing and ordering. Wholesale applications are reviewed separately.',
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
  const wholesale = !consumer || params.tier === 'institutional';
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
        <p className="ion-kicker">{wholesale ? 'Wholesale account' : 'Researcher account'}</p>
        <h1 className="ion-heading mt-6 text-4xl sm:text-5xl">
          {wholesale ? 'Apply for wholesale' : 'Create your account'}
        </h1>
        <p className="mt-4 leading-7 text-muted-foreground">
          {wholesale
            ? 'An account is the first step of a wholesale application. Prices, lot availability and ordering open once a person has approved it.'
            : accountRequired()
              ? 'Use your email to access researcher prices, your cart and order records. Independent and home-laboratory researchers are welcome. Verify your email to get started—no wholesale application is needed.'
              : 'An account keeps your orders, saved addresses and the certificates that shipped with each order in one place. You can also check out as a guest without one.'}
        </p>

        {wholesale && <AccessProgress current={0} />}

        {consumer && (
          <p className="mt-4 text-sm text-muted-foreground">
            {wholesale ? 'Not applying for wholesale? ' : 'Buying on purchase order or applying for net terms? '}
            <Link
              href={wholesale ? '/account/sign-up' : '/account/sign-up?tier=institutional'}
              className="font-semibold text-primary underline underline-offset-4"
            >
              {wholesale ? 'Create a researcher account' : 'Apply for a wholesale account'}
            </Link>
          </p>
        )}

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
          <input type="hidden" name="tier" value={wholesale ? 'institutional' : 'researcher'} />
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
              {wholesale ? 'Work email address' : 'Email address'}
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
              {wholesale
                ? 'Use an address on your organisation’s own domain for a wholesale application.'
                : 'Personal email addresses are welcome.'}
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

          {wholesale && <div className="flex flex-col gap-1.5">
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
          </div>}

          {wholesale && <div className="flex flex-col gap-1.5">
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
          </div>}

          <SignupAcknowledgements />

          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" name="product_news" className="mt-1" />
            <span>
              <span className="font-semibold">Product news (optional)</span>
              <span className="block text-muted-foreground">
                New materials and released lots, a few times a year. Unsubscribe any time.
              </span>
            </span>
          </label>

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
