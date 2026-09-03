import type { Metadata } from 'next';
import Link from 'next/link';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Choose a new password', robots: { index: false, follow: false } };

const ERROR_TEXT: Record<string, string> = {
  invalid: 'This reset link is not valid. Request a new one.',
  expired: 'This reset link has expired. Request a new one.',
  policy: 'The new password must be at least 12 characters.',
  mismatch: 'The new password and its confirmation do not match.',
  missing: 'Fill in both fields.',
  unavailable: 'The password could not be changed. Try again shortly.',
};

type Props = { searchParams: Promise<{ token?: string; error?: string }> };

export default async function ResetPage({ searchParams }: Props) {
  const params = await searchParams;
  const token = /^[a-f0-9]{64}$/.test(params.token ?? '') ? (params.token as string) : null;
  const error = params.error && Object.hasOwn(ERROR_TEXT, params.error) ? ERROR_TEXT[params.error] : null;
  const dead = !token || params.error === 'invalid' || params.error === 'expired';
  return (
    <main className="bg-background text-foreground">
      <section className="mx-auto max-w-md px-5 py-20 sm:px-8">
        <p className="utility-label text-primary">Research account</p>
        <h1 className="mt-6 font-display text-4xl font-extrabold tracking-[-0.05em]">Choose a new password</h1>
        {error && (
          <p role="alert" className="mt-6 border border-destructive/40 bg-secondary p-4 text-sm">
            {error}
          </p>
        )}
        {dead ? (
          <p className="mt-6 text-sm leading-6 text-muted-foreground">
            {!error && 'This link is missing its token.'}{' '}
            <Link href="/account/forgot" className="font-semibold text-primary">
              Request a new reset link
            </Link>
            .
          </p>
        ) : (
          <form method="post" action="/api/account/reset" className="mt-8 flex flex-col gap-5">
            <input type="hidden" name="token" value={token} />
            {[
              ['next', 'New password (12+ characters)'],
              ['confirm', 'Confirm new password'],
            ].map(([name, label]) => (
              <div key={name} className="flex flex-col gap-2">
                <label htmlFor={name} className="text-sm font-semibold">
                  {label}
                </label>
                <input id={name} name={name} type="password" autoComplete="new-password" required minLength={12} className="h-12 border border-foreground/20 bg-background px-4 text-sm outline-none focus:border-primary" />
              </div>
            ))}
            <p className="text-xs leading-5 text-muted-foreground">Every existing session on this account will be signed out.</p>
            <button type="submit" className="inline-flex h-12 items-center justify-center bg-primary px-6 text-sm font-bold text-primary-foreground hover:bg-primary/90">
              Set new password
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
