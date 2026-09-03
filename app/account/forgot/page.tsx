import type { Metadata } from 'next';
import Link from 'next/link';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Reset your password', robots: { index: false, follow: false } };

const ERROR_TEXT: Record<string, string> = {
  missing: 'Enter the email address on your account.',
  unavailable: 'The request could not be sent. Try again shortly.',
};

type Props = { searchParams: Promise<{ sent?: string; error?: string }> };

export default async function ForgotPage({ searchParams }: Props) {
  const params = await searchParams;
  const error = params.error && Object.hasOwn(ERROR_TEXT, params.error) ? ERROR_TEXT[params.error] : null;
  return (
    <main className="bg-background text-foreground">
      <section className="mx-auto max-w-md px-5 py-20 sm:px-8">
        <p className="utility-label text-primary">Research account</p>
        <h1 className="mt-6 font-display text-4xl font-extrabold tracking-[-0.05em]">Reset your password</h1>
        {params.sent ? (
          <p role="status" className="mt-6 border border-border bg-secondary p-4 text-sm leading-6">
            If an account exists for that address, a reset link is on its way. It is valid for one hour. Check your spam folder if it does not arrive.
          </p>
        ) : (
          <>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">Enter the email address on your account and we will send a link to choose a new password.</p>
            {error && (
              <p role="alert" className="mt-6 border border-destructive/40 bg-secondary p-4 text-sm">
                {error}
              </p>
            )}
            <form method="post" action="/api/account/forgot" className="mt-8 flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <label htmlFor="email" className="text-sm font-semibold">
                  Email address
                </label>
                <input id="email" name="email" type="email" autoComplete="username" required className="h-12 border border-foreground/20 bg-background px-4 text-sm outline-none focus:border-primary" />
              </div>
              <button type="submit" className="inline-flex h-12 items-center justify-center bg-primary px-6 text-sm font-bold text-primary-foreground hover:bg-primary/90">
                Send reset link
              </button>
            </form>
          </>
        )}
        <p className="mt-6 text-sm text-muted-foreground">
          <Link href="/account/sign-in" className="font-semibold text-primary">
            Back to sign in
          </Link>
        </p>
      </section>
    </main>
  );
}
