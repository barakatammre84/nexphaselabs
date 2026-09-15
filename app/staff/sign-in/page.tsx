import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Lock } from 'lucide-react';
import { getStaffIncludingPasswordChange, safeReturnPath } from '@/lib/staff-auth';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Staff sign-in',
  robots: { index: false, follow: false },
};

const ERROR_TEXT: Record<string, string> = {
  missing: 'Enter your email address and password.',
  invalid: 'That email address and password do not match.',
  locked: 'This account is locked after repeated failed attempts. Try again in 15 minutes.',
  unavailable: 'Sign-in is temporarily unavailable. Try again shortly.',
  throttled: 'Too many failed sign-in attempts from this network. Try again in 15 minutes.',
};

type Props = { searchParams: Promise<{ error?: string; return_to?: string; signed_out?: string }> };

export default async function StaffSignInPage({ searchParams }: Props) {
  const params = await searchParams;
  const returnTo = safeReturnPath(params.return_to);

  const staff = await getStaffIncludingPasswordChange();
  if (staff) redirect(staff.mustChangePassword ? `/staff/password?required=1&return_to=${encodeURIComponent(returnTo)}` : returnTo);

  const error = params.error ? (Object.hasOwn(ERROR_TEXT, params.error) ? ERROR_TEXT[params.error] : ERROR_TEXT.invalid) : null;

  return (
    <main className="bg-background text-foreground">
      <section className="mx-auto max-w-md px-5 py-20 sm:px-8">
        <p className="utility-label flex items-center gap-3 text-primary">
          <Lock className="size-4" />
          Staff
        </p>
        <h1 className="mt-6 font-display text-4xl font-extrabold tracking-[-0.05em]">Sign in</h1>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          Internal access for NexPhase Labs staff. Every sign-in is recorded.
        </p>

        {params.signed_out && (
          <p className="mt-6 border border-border bg-secondary p-4 text-sm">You have been signed out.</p>
        )}
        {error && (
          <p role="alert" className="mt-6 border border-destructive/40 bg-secondary p-4 text-sm">
            {error}
          </p>
        )}

        <form method="post" action="/api/staff/sign-in" className="mt-8 flex flex-col gap-5">
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
              className="h-12 border border-foreground/20 bg-background px-4 text-sm outline-none focus:border-primary"
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
              minLength={12}
              className="h-12 border border-foreground/20 bg-background px-4 text-sm outline-none focus:border-primary"
            />
          </div>
          <button
            type="submit"
            className="inline-flex h-12 items-center justify-center bg-primary px-6 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Sign in
          </button>
        </form>
      </section>
    </main>
  );
}
