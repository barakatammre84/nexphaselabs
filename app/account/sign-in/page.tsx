import { openCheckoutEnabled } from '@/lib/site-config';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AlertCircle, CircleCheck } from 'lucide-react';
import { getAccount, safeAccountReturnPath } from '@/lib/account-auth';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Sign in',
  robots: { index: false, follow: false },
};

type Props = {
  searchParams: Promise<{
    error?: string;
    return_to?: string;
    signed_out?: string;
    verify?: string;
    reset?: string;
  }>;
};

const ERROR_TEXT: Record<string, string> = {
  suspended:
    'This account is suspended. Contact research@nexphaselabs.net and a person will help.',
  missing: 'Enter your email address and password.',
  invalid: 'That email address and password do not match.',
  locked:
    'This account is locked after repeated failed attempts. Try again in 15 minutes.',
  unverified:
    'Confirm your email address first. If the link has expired or never arrived, send a new one below.',
  unavailable: 'Sign-in is temporarily unavailable. Try again shortly.',
  throttled:
    'Too many failed sign-in attempts from this network. Try again in 15 minutes.',
};

const VERIFY_TEXT: Record<string, string> = {
  verified: 'Your email address is confirmed. Sign in to continue.',
  already: 'That link was already used. Sign in to continue.',
  expired: 'That link has expired. Enter your email address below and we will send a new one.',
  resend_missing: 'Enter the email address you signed up with to get a new confirmation link.',
  invalid: 'That verification link is not valid.',
  unavailable: 'Verification is temporarily unavailable. Try again shortly.',
};

const input =
  'h-12 w-full rounded-xl border border-foreground/20 bg-background px-4 text-sm outline-none focus:border-primary';

export default async function AccountSignInPage({ searchParams }: Props) {
  const params = await searchParams;
  const returnTo = safeAccountReturnPath(params.return_to);
  if (await getAccount()) redirect(returnTo);

  const error = params.error
    ? Object.hasOwn(ERROR_TEXT, params.error)
      ? ERROR_TEXT[params.error]
      : ERROR_TEXT.invalid
    : null;
  const verify = params.verify
    ? Object.hasOwn(VERIFY_TEXT, params.verify)
      ? VERIFY_TEXT[params.verify]
      : null
    : params.reset === 'done'
      ? 'Your password has been changed. Sign in with the new one.'
      : null;

  return (
    <main className="text-foreground">
      <section className="ion-panel mx-auto my-12 max-w-lg px-7 py-10 sm:px-10">
        <p className="ion-kicker">Research account</p>
        <h1 className="ion-heading mt-6 text-5xl">
          Sign in
        </h1>

        {openCheckoutEnabled() && (
          <div className="mt-6 rounded-lg bg-secondary p-5 text-sm">
            <p>
              Buying a product? You do not need to sign in or verify an email.
            </p>
            <Link href="/account/cart" className="action-primary mt-4">
              Continue as a guest
            </Link>
          </div>
        )}
        {params.signed_out && (
          <p className="mt-6 border border-border bg-secondary p-4 text-sm">
            You have been signed out.
          </p>
        )}
        {verify && (
          <p
            role="status"
            className="mt-6 flex items-center gap-2 border border-border bg-secondary p-4 text-sm"
          >
            <CircleCheck className="size-4 text-primary" /> {verify}
          </p>
        )}
        {error && (
          <p
            role="alert"
            className="mt-6 flex items-center gap-2 border border-destructive/40 bg-secondary p-4 text-sm"
          >
            <AlertCircle className="size-4 text-destructive" /> {error}
          </p>
        )}

        {(params.verify === 'expired' || params.verify === 'resend_missing' || params.error === 'unverified') && (
          <form
            method="post"
            action="/api/account/verify/resend"
            className="mt-6 flex flex-col gap-3 rounded-lg border border-border bg-secondary p-5"
          >
            <label htmlFor="resend-email" className="text-sm font-semibold">
              Send a new confirmation link
            </label>
            <input id="resend-email" name="email" type="email" required autoComplete="email" className={input} />
            <button type="submit" className="action-secondary w-fit">
              Send link
            </button>
          </form>
        )}

        <form
          method="post"
          action="/api/account/sign-in"
          className="mt-8 flex flex-col gap-5"
        >
          <input type="hidden" name="return_to" value={returnTo} />
          <div className="flex flex-col gap-2">
            <label htmlFor="email" className="text-sm font-semibold">
              Email address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              required
              className={input}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="password" className="text-sm font-semibold">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className={input}
            />
          </div>
          <button
            type="submit"
            className="action-primary"
          >
            Sign in
          </button>
          <Link
            href="/account/forgot"
            className="text-sm font-semibold text-muted-foreground hover:text-primary"
          >
            Forgot your password?
          </Link>
        </form>
        <p className="mt-6 text-sm text-muted-foreground">
          No account yet?{' '}
          <Link href="/account/sign-up" className="font-semibold text-primary">
            Create one
          </Link>
        </p>
      </section>
    </main>
  );
}
