import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { KeyRound } from 'lucide-react';
import { getStaffIncludingPasswordChange, safeReturnPath } from '@/lib/staff-auth';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Set your password', robots: { index: false, follow: false } };

const ERROR_TEXT: Record<string, string> = {
  current: 'The current password is not correct.',
  policy: 'The new password must be at least 12 characters.',
  mismatch: 'The new password and its confirmation do not match.',
  reused: 'Choose a password you have not used here before.',
  missing: 'Fill in all three fields.',
  unavailable: 'The password could not be changed. Try again shortly.',
};

type Props = { searchParams: Promise<{ error?: string; return_to?: string; required?: string; changed?: string }> };

export default async function StaffPasswordPage({ searchParams }: Props) {
  const params = await searchParams;
  const returnTo = safeReturnPath(params.return_to);
  const staff = await getStaffIncludingPasswordChange();
  if (!staff) redirect(`/staff/sign-in?return_to=${encodeURIComponent('/manage')}`);
  const error = params.error ? (Object.hasOwn(ERROR_TEXT, params.error) ? ERROR_TEXT[params.error] : ERROR_TEXT.unavailable) : null;
  const required = staff.mustChangePassword;

  return (
    <main className="bg-background text-foreground">
      <section className="mx-auto max-w-md px-5 py-20 sm:px-8">
        <p className="utility-label flex items-center gap-3 text-primary">
          <KeyRound className="size-4" /> Staff
        </p>
        <h1 className="mt-6 font-display text-4xl font-extrabold tracking-[-0.05em]">{required ? 'Set your password' : 'Change your password'}</h1>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          {required
            ? 'You signed in with a one-time password that an admin has seen. Replace it with one only you know before continuing.'
            : 'Your other sessions will be signed out; this one continues.'}
        </p>
        {params.changed && <p role="status" className="mt-6 border border-border bg-secondary p-4 text-sm">Password changed.</p>}
        {error && (
          <p role="alert" className="mt-6 border border-destructive/40 bg-secondary p-4 text-sm">
            {error}
          </p>
        )}
        <form method="post" action="/api/staff/password" className="mt-8 flex flex-col gap-5">
          <input type="hidden" name="return_to" value={returnTo} />
          {[
            ['current', required ? 'One-time password' : 'Current password', 'current-password'],
            ['next', 'New password (12+ characters)', 'new-password'],
            ['confirm', 'Confirm new password', 'new-password'],
          ].map(([name, label, ac]) => (
            <div key={name} className="flex flex-col gap-2">
              <label htmlFor={name} className="text-sm font-semibold">
                {label}
              </label>
              <input id={name} name={name} type="password" autoComplete={ac} required minLength={name === 'current' ? 1 : 12} className="h-12 border border-foreground/20 bg-background px-4 text-sm outline-none focus:border-primary" />
            </div>
          ))}
          <button type="submit" className="inline-flex h-12 items-center justify-center bg-primary px-6 text-sm font-bold text-primary-foreground hover:bg-primary/90">
            {required ? 'Set password and continue' : 'Change password'}
          </button>
        </form>
        <form method="post" action="/api/staff/sign-out" className="mt-6">
          <button type="submit" className="text-sm font-semibold text-muted-foreground hover:text-primary">
            {required ? 'Not now — sign out' : 'Sign out'}
          </button>
        </form>
      </section>
    </main>
  );
}
