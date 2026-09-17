import type { Metadata } from 'next';
import Link from 'next/link';
import { MailCheck } from 'lucide-react';
import { NEWSLETTER_COPY } from '@/lib/marketing-consent';

export const metadata: Metadata = { title: 'Check your email', robots: { index: false, follow: false } };

/** After the footer form: the same page for every address, so it reveals nothing about who is subscribed. */
export default function NewsletterRequestedPage() {
  return (
    <main className="text-foreground">
      <section className="ion-panel mx-auto my-12 max-w-2xl px-7 py-10 sm:px-10">
        <p className="ion-kicker">Product news</p>
        <h1 className="ion-heading mt-4 text-3xl">Check your email</h1>
        <p role="status" className="mt-5 flex items-start gap-3 text-sm leading-6">
          <MailCheck className="mt-1 size-4 text-primary" />
          <span>{NEWSLETTER_COPY.requested}</span>
        </p>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">{NEWSLETTER_COPY.scope}</p>
        <p className="mt-8 text-sm">
          <Link href="/" className="font-semibold text-primary">Back to the site</Link>
        </p>
      </section>
    </main>
  );
}
