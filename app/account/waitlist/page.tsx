import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, BellRing, CircleCheck, Trash2 } from 'lucide-react';
import { CustomerNav } from '@/components/site/customer-nav';
import { requireAccount } from '@/lib/account-auth';
import { listWaitlistForAccount } from '@/lib/waitlist';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Waitlist', robots: { index: false, follow: false } };

type Props = { searchParams: Promise<{ removed?: string }> };

const when = (date: Date) =>
  new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'America/Los_Angeles' }).format(date);

/** Pack sizes the customer asked to hear about (owner, 16 Sep 2026). One email each, ever. */
export default async function AccountWaitlistPage({ searchParams }: Props) {
  const account = await requireAccount('/account/waitlist');
  const { removed } = await searchParams;
  const entries = await listWaitlistForAccount(account.id);
  const waiting = entries.filter((entry) => entry.status === 'waiting').length;

  return (
    <main className="text-foreground">
      <section className="mx-auto max-w-[1080px] px-4 py-10 sm:px-6">
        <div className="ion-page-hero p-7 sm:p-10">
          <Link href="/account" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-primary">
            <ArrowLeft className="size-4" /> Dashboard
          </Link>
          <p className="ion-kicker mt-6">Manage your account</p>
          <h1 className="ion-heading mt-5 text-4xl sm:text-5xl">Waitlist</h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
            Pack sizes you asked to hear about.{' '}
            {waiting === 0 ? 'Nothing is waiting right now.' : `${waiting} waiting for a released lot.`}
          </p>
          <div className="relative z-10 mt-7"><CustomerNav current="/account/waitlist" /></div>
        </div>

        <section className="ion-panel mt-8 p-7 sm:p-10">
          <div className="flex items-center gap-3">
            <BellRing className="size-5 text-primary" />
            <h2 className="font-display text-xl font-bold tracking-tight">Tell me when it&rsquo;s available</h2>
          </div>
          <p className="mt-3 max-w-2xl leading-7 text-muted-foreground">
            When a released, tested lot can supply a pack size on this list, we send one email and
            the request is done. Material is supplied first come, first served; the email reserves nothing.
          </p>

          {removed === '1' && (
            <p role="status" className="mt-5 flex items-center gap-2 rounded-xl border border-border bg-secondary p-4 text-sm">
              <CircleCheck className="size-4 text-primary" /> Removed from your waitlist.
            </p>
          )}

          {entries.length === 0 ? (
            <p className="mt-6 rounded-[1.2rem] border border-dashed border-border p-6 text-sm leading-6 text-muted-foreground">
              Nothing here yet. On a material page, choose a pack size that is out of stock and select
              &ldquo;Tell me when it&rsquo;s available&rdquo;.{' '}
              <Link href="/catalog" className="font-semibold text-primary">Browse the catalog</Link>
            </p>
          ) : (
            <ul className="mt-6 grid gap-4 sm:grid-cols-2">
              {entries.map((entry) => (
                <li key={entry.id} className="rounded-[1.2rem] border border-border p-5">
                  <p className="font-semibold">
                    {entry.productSlug ? (
                      <Link href={`/catalog/${entry.productSlug}`} className="hover:text-primary">{entry.productName}</Link>
                    ) : (
                      entry.productName
                    )}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">{entry.pack}</p>
                  <p className="mt-3 text-sm">
                    {entry.status === 'notified' && entry.notifiedAt
                      ? `Emailed on ${when(entry.notifiedAt)} — a lot was released.`
                      : `Waiting for a released lot · asked on ${when(entry.createdAt)}`}
                  </p>
                  <form method="post" action="/api/waitlist" className="mt-4">
                    <input type="hidden" name="intent" value="leave" />
                    <input type="hidden" name="id" value={entry.id} />
                    <input type="hidden" name="return_to" value="/account/waitlist" />
                    <button
                      type="submit"
                      className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="size-4" /> Remove
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-6 text-xs leading-6 text-muted-foreground">
            Materials are for laboratory research use only; not for human or veterinary use. This list
            is not a marketing subscription — nothing else is sent because of it.
          </p>
        </section>
      </section>
    </main>
  );
}
