import type { Metadata } from 'next';
import Link from 'next/link';
import { AccessProgress } from '@/components/site/access-progress';
import { researcherTierEnabled } from '@/lib/site-config';
import { MailCheck } from 'lucide-react';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Check your email',
  robots: { index: false, follow: false },
};

type Props = { searchParams: Promise<{ email?: string; sent?: string; resent?: string }> };

export default async function CheckEmailPage({ searchParams }: Props) {
  const { email, sent, resent } = await searchParams;
  const shown =
    email && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : null;

  return (
    <main className="bg-background text-foreground">
      <section className="mx-auto max-w-xl px-5 py-20 sm:px-8">
        {!researcherTierEnabled() && <AccessProgress current={1} />}
        <MailCheck className="size-8 text-primary" />
        <h1 className="mt-6 font-display text-4xl font-extrabold tracking-[-0.05em]">
          Check your email
        </h1>
        {resent === '1' ? (
          <p className="mt-5 leading-7 text-muted-foreground">
            If{' '}
            {shown ? (
              <span className="font-semibold text-foreground">{shown}</span>
            ) : (
              'that address'
            )}{' '}
            has an account waiting to be confirmed, a new confirmation link is
            on its way. Open it within 24 hours; earlier links no longer work.
          </p>
        ) : sent === '0' ? (
          <p className="mt-5 leading-7 text-muted-foreground">
            Your account was created, but the confirmation email could not be
            sent. Email{' '}
            <a
              href="mailto:research@nexphaselabs.net"
              className="font-semibold text-primary"
            >
              research@nexphaselabs.net
            </a>{' '}
            and we will confirm the address by hand.
          </p>
        ) : (
          <p className="mt-5 leading-7 text-muted-foreground">
            If{' '}
            {shown ? (
              <span className="font-semibold text-foreground">{shown}</span>
            ) : (
              'that address'
            )}{' '}
            does not already have an account, a confirmation link is on its way.
            Open it within 24 hours to activate the account. If nothing arrives,
            check your spam folder.
          </p>
        )}
        <p className="mt-8 text-sm text-muted-foreground">
          <Link href="/account/sign-in" className="font-semibold text-primary">
            Go to sign in
          </Link>
        </p>
      </section>
    </main>
  );
}
