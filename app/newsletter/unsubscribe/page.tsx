import type { Metadata } from 'next';
import Link from 'next/link';
import { CircleCheck } from 'lucide-react';
import { NEWSLETTER_COPY } from '@/lib/marketing-consent';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Unsubscribe', robots: { index: false, follow: false } };

type Props = { searchParams: Promise<{ token?: string; done?: string; error?: string }> };

/** One button, no sign-in: the token in the link is the authority. Mail clients use the same route one-click. */
export default async function NewsletterUnsubscribePage({ searchParams }: Props) {
  const { token, done, error } = await searchParams;
  return (
    <main className="text-foreground">
      <section className="ion-panel mx-auto my-12 max-w-2xl px-7 py-10 sm:px-10">
        <p className="ion-kicker">Product news</p>
        <h1 className="ion-heading mt-4 text-3xl">Unsubscribe</h1>
        {done === '1' ? (
          <p role="status" className="mt-5 flex items-start gap-3 text-sm leading-6">
            <CircleCheck className="mt-1 size-4 text-primary" />
            <span>{NEWSLETTER_COPY.unsubscribed}</span>
          </p>
        ) : (
          <>
            <p className="mt-5 text-sm leading-6 text-muted-foreground">
              This stops product news to the address the link was sent to. Order and account emails are not
              affected; they are sent only about things you asked us to do.
            </p>
            {error === '1' && (
              <p role="alert" className="mt-4 text-sm text-destructive">That could not be recorded just now. Try again shortly.</p>
            )}
            <form method="post" action="/api/newsletter/unsubscribe" className="mt-6">
              <input type="hidden" name="token" value={token ?? ''} />
              <button type="submit" className="action-primary" disabled={!token}>
                Unsubscribe
              </button>
            </form>
          </>
        )}
        <p className="mt-8 text-sm">
          <Link href="/" className="font-semibold text-primary">Back to the site</Link>
        </p>
      </section>
    </main>
  );
}
