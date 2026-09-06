import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AlertCircle } from 'lucide-react';
import { getAccount } from '@/lib/account-auth';
import { AccessProgress } from '@/components/site/access-progress';
import { RUO_ACKNOWLEDGEMENT } from '@/lib/policy';
import { consumerTierEnabled } from '@/lib/site-config';

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
  const consumer = consumerTierEnabled();

  const errors =
    params.error === 'validation' && params.codes
      ? params.codes.split('|').filter(Boolean).slice(0, 10)
      : params.error === 'email'
        ? ['We could not send the verification email. Try again shortly.']
        : params.error === 'unavailable'
          ? ['Sign-up is temporarily unavailable. Try again shortly.']
          : [];

  return (
    <main className="text-foreground">
      <section className="ion-panel mx-auto my-12 max-w-3xl px-7 py-10 sm:px-10">
        <p className="ion-kicker">Research account</p>
        <h1 className="ion-heading mt-6 text-4xl sm:text-5xl">
          Create your login
        </h1>
        <p className="mt-4 leading-7 text-muted-foreground">
          An account lets you submit your organisation for verification.
          Pricing, lot availability and ordering are enabled once a person has
          reviewed and approved it.
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
              For an institutional account, use an address on your
              organisation&rsquo;s own domain.
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

          {consumer ? (
            <fieldset className="flex flex-col gap-3">
              <legend className="text-sm font-semibold">Account type</legend>
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="radio"
                  name="tier"
                  value="institutional"
                  defaultChecked={params.tier !== 'consumer'}
                  className="mt-1"
                />
                <span>
                  <span className="font-semibold">Research organisation</span>
                  <span className="block text-muted-foreground">
                    University, CRO, analytical or in-house research laboratory.
                    Verified before ordering.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="radio"
                  name="tier"
                  value="consumer"
                  defaultChecked={params.tier === 'consumer'}
                  className="mt-1"
                />
                <span>
                  <span className="font-semibold">Individual researcher</span>
                  <span className="block text-muted-foreground">
                    Laboratory research use only.
                  </span>
                </span>
              </label>
            </fieldset>
          ) : (
            <input type="hidden" name="tier" value="institutional" />
          )}

          <div className="rounded-[1.4rem] border border-border bg-secondary p-5">
            <p className="utility-label text-primary">
              Research-use acknowledgement
            </p>
            <p className="mt-3 text-sm leading-6">{RUO_ACKNOWLEDGEMENT}</p>
            <label className="mt-4 flex items-start gap-3 text-sm">
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
