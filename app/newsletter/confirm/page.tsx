import type { Metadata } from 'next';
import Link from 'next/link';
import { CircleCheck, AlertCircle } from 'lucide-react';
import { confirmConsent, NEWSLETTER_COPY } from '@/lib/marketing-consent';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Product news', robots: { index: false, follow: false } };

type Props = { searchParams: Promise<{ token?: string }> };

/** The confirmation link from the opt-in email. Opening it is the consent. */
export default async function NewsletterConfirmPage({ searchParams }: Props) {
  const { token } = await searchParams;
  let outcome: 'confirmed' | 'already' | 'invalid' | 'unavailable' = 'invalid';
  try {
    outcome = await confirmConsent(token ?? '');
  } catch (error) {
    console.error('[newsletter] confirm failed', error instanceof Error ? error.message : error);
    outcome = 'unavailable';
  }
  const ok = outcome === 'confirmed' || outcome === 'already';
  const message =
    outcome === 'confirmed'
      ? NEWSLETTER_COPY.confirmed
      : outcome === 'already'
        ? NEWSLETTER_COPY.already
        : outcome === 'unavailable'
          ? 'That could not be recorded just now. Try the link again shortly.'
          : NEWSLETTER_COPY.invalid;
  return (
    <main className="text-foreground">
      <section className="ion-panel mx-auto my-12 max-w-2xl px-7 py-10 sm:px-10">
        <p className="ion-kicker">Product news</p>
        <h1 className="ion-heading mt-4 text-3xl">{ok ? 'Confirmed' : 'Not confirmed'}</h1>
        <p role={ok ? 'status' : 'alert'} className="mt-5 flex items-start gap-3 text-sm leading-6">
          {ok ? <CircleCheck className="mt-1 size-4 text-primary" /> : <AlertCircle className="mt-1 size-4 text-destructive" />}
          <span>{message}</span>
        </p>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">{NEWSLETTER_COPY.scope}</p>
        <Link href="/catalog" className="action-primary mt-8">Browse the catalog</Link>
      </section>
    </main>
  );
}
