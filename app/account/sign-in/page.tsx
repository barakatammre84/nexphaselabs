import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AlertCircle, CircleCheck } from 'lucide-react';
import { getAccount, safeAccountReturnPath } from '@/lib/account-auth';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Sign in', robots: { index: false, follow: false } };

type Props = { searchParams: Promise<{ error?: string; return_to?: string; signed_out?: string; verify?: string }> };

const ERROR_TEXT: Record<string, string> = {
  missing: 'Enter your email address and password.',
  invalid: 'That email address and password do not match.',
  locked: 'This account is locked after repeated failed attempts. Try again in 15 minutes.',
  unverified: 'Confirm your email address first. Check your inbox for the link we sent.',
  unavailable: 'Sign-in is temporarily unavailable. Try again shortly.',
};

const VERIFY_TEXT: Record<string, string> = {
  verified: 'Your email address is confirmed. Sign in to continue.',
  already: 'That link was already used. Sign in to continue.',
  expired: 'That link has expired. Sign in to request a new one.',
  invalid: 'That verification link is not valid.',
  unavailable: 'Verification is temporarily unavailable. Try again shortly.',
};

const input = 'h-12 w-full border border-foreground/20 bg-background px-4 text-sm outline-none focus:border-primary';

export default async function AccountSignInPage({ searchParams }: Props) {
  const params = await searchParams;
  const returnTo = safeAccountReturnPath(params.return_to);
  if (await getAccount()) redirect(returnTo);

  const error = params.error ? (ERROR_TEXT[params.error] ?? ERROR_TEXT.invalid) : null;
  const verify = params.verify ? (VERIFY_TEXT[params.verify] ?? null) : null;

  return (
    <main className="bg-background text-foreground">
      <section className="mx-auto max-w-md px-5 py-20 sm:px-8">
        <p className="utility-label text-primary">Research account</p>
        <h1 className="mt-5 font-display text-4xl font-extrabold tracking-[-0.05em]">Sign in</h1>

        {params.signed_out && <p className="mt-6 border border-border bg-secondary p-4 text-sm">You have been signed out.</p>}
        {verify && (
          <p role="status" className="mt-6 flex items-center gap-2 border border-border bg-secondary p-4 text-sm">
            <CircleCheck className="size-4 text-primary" /> {verify}
          </p>
        )}
        {error && (
          <p role="alert" className="mt-6 flex items-center gap-2 border border-destructive/40 bg-secondary p-4 text-sm">
            <AlertCircle className="size-4 text-destructive" /> {error}
          </p>
        )}

        <form method="post" action="/api/account/sign-in" className="mt-8 flex flex-col gap-5">
          <input type="hidden" name="return_to" value={returnTo} />
          <div className="flex flex-col gap-2">
            <label htmlFor="email" className="text-sm font-semibold">
              Email address
            </label>
            <input id="email" name="email" type="email" autoComplete="username" required className={input} />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="password" className="text-sm font-semibold">
              Password
            </label>
            <input id="password" name="password" type="password" autoComplete="current-password" required className={input} />
          </div>
          <button
            type="submit"
            className="inline-flex h-12 items-center justify-center bg-primary px-6 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Sign in
          </button>
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
