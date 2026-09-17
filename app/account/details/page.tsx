import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { AlertCircle, ArrowLeft, CircleCheck, KeyRound, Mail, Newspaper, UserRound } from 'lucide-react';
import { CustomerNav } from '@/components/site/customer-nav';
import { requireAccount } from '@/lib/account-auth';
import { pendingEmailFor } from '@/lib/account-details';
import { consentForAccount, NEWSLETTER_COPY } from '@/lib/marketing-consent';
import { NOTICE_COOKIE, readNotice } from '@/lib/notice';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Account details',
  robots: { index: false, follow: false },
};

type Props = { searchParams: Promise<{ saved?: string; error?: string }> };

const input =
  'mt-2 h-12 w-full rounded-xl border border-input bg-secondary px-4 text-base outline-none focus:border-primary';

const consentedOn = (date: Date) =>
  new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'America/Los_Angeles' }).format(date);

const SAVED: Record<string, string> = {
  name: 'Your name has been updated.',
  password: 'Your password has been changed. Other devices have been signed out.',
  email: 'Check the new mailbox for a confirmation link. Your address changes when you open it.',
  newsletter_on: 'Check your inbox for a confirmation link. Product news starts only when you open it.',
  newsletter_off: 'Product news switched off. Order and account emails are not affected.',
};

export default async function AccountDetailsPage({ searchParams }: Props) {
  const account = await requireAccount('/account/details');
  const { saved, error } = await searchParams;
  const notice =
    error === 'notice' ? (readNotice((await cookies()).get(NOTICE_COOKIE)?.value) ?? 'That could not be saved.') : null;
  const pending = await pendingEmailFor(account.id);
  const consent = await consentForAccount(account.id, account.email).catch(() => null);

  return (
    <main className="text-foreground">
      <section className="mx-auto max-w-[1080px] px-4 py-10 sm:px-6">
        <div className="ion-page-hero p-7 sm:p-10">
          <Link href="/account" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-primary">
            <ArrowLeft className="size-4" /> Dashboard
          </Link>
          <p className="ion-kicker mt-6">Manage your account</p>
          <h1 className="ion-heading mt-5 text-4xl sm:text-5xl">Account details</h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
            Your name, email address and password. Orders keep their own record of who bought and where
            material was sent, so nothing here changes an order already placed.
          </p>
          <div className="relative z-10 mt-7"><CustomerNav current="/account/details" /></div>
        </div>

        <div className="ion-panel mt-6 px-6 py-8 sm:px-10">
          {saved && SAVED[saved] && !notice && (
            <p role="status" className="flex items-center gap-2 rounded-xl border border-border bg-secondary p-4 text-sm">
              <CircleCheck className="size-4 text-primary" /> {SAVED[saved]}
            </p>
          )}
          {notice && (
            <p role="alert" className="flex items-center gap-2 rounded-xl border border-destructive/40 bg-secondary p-4 text-sm">
              <AlertCircle className="size-4 text-destructive" /> {notice}
            </p>
          )}

          <form method="post" action="/api/account/details" className="mt-8 grid gap-4 border-t border-border pt-8">
            <input type="hidden" name="intent" value="name" />
            <div className="flex items-center gap-3">
              <UserRound className="size-5 text-primary" />
              <h2 className="font-display text-xl font-bold tracking-tight">Name</h2>
            </div>
            <label className="block text-sm">
              <span className="font-semibold">Full name</span>
              <input name="name" defaultValue={account.name} autoComplete="name" required minLength={2} maxLength={120} className={input} />
            </label>
            <div><button type="submit" className="action-primary">Save name</button></div>
          </form>

          <form method="post" action="/api/account/details" className="mt-10 grid gap-4 border-t border-border pt-8">
            <input type="hidden" name="intent" value="email" />
            <div className="flex items-center gap-3">
              <Mail className="size-5 text-primary" />
              <h2 className="font-display text-xl font-bold tracking-tight">Email address</h2>
            </div>
            <p className="text-sm leading-6 text-muted-foreground">
              Signed in as <span className="font-mono">{account.email}</span>. A new address takes effect only after
              you open the confirmation link we send to it, so a typo can never lock you out.
            </p>
            {pending && (
              <p role="status" className="rounded-xl border border-border bg-secondary p-4 text-sm">
                Waiting for <span className="font-mono">{pending}</span> to open its confirmation link. Submitting
                another address replaces this request.
              </p>
            )}
            <label className="block text-sm">
              <span className="font-semibold">New email address</span>
              <input name="email" type="email" autoComplete="email" required maxLength={254} className={input} />
            </label>
            <div><button type="submit" className="action-primary">Send confirmation link</button></div>
          </form>

          <form method="post" action="/api/account/details" className="mt-10 grid gap-4 border-t border-border pt-8">
            <input type="hidden" name="intent" value="password" />
            <div className="flex items-center gap-3">
              <KeyRound className="size-5 text-primary" />
              <h2 className="font-display text-xl font-bold tracking-tight">Password</h2>
            </div>
            <label className="block text-sm">
              <span className="font-semibold">Current password</span>
              <input name="current" type="password" autoComplete="current-password" required className={input} />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="font-semibold">New password</span>
                <input name="next" type="password" autoComplete="new-password" required className={input} />
              </label>
              <label className="block text-sm">
                <span className="font-semibold">Repeat new password</span>
                <input name="confirm" type="password" autoComplete="new-password" required className={input} />
              </label>
            </div>
            <p className="text-xs leading-6 text-muted-foreground">
              Changing it signs out every other device. Forgot the current one?{' '}
              <Link href="/account/forgot" className="font-semibold text-primary">Reset it by email</Link>.
            </p>
            <div><button type="submit" className="action-primary">Change password</button></div>
          </form>

          <section className="mt-10 grid gap-4 border-t border-border pt-8">
            <div className="flex items-center gap-3">
              <Newspaper className="size-5 text-primary" />
              <h2 className="font-display text-xl font-bold tracking-tight">Product news (optional)</h2>
            </div>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{NEWSLETTER_COPY.scope}</p>
            {consent?.status === 'confirmed' ? (
              <form method="post" action="/api/newsletter" className="flex flex-wrap items-center gap-4">
                <input type="hidden" name="intent" value="unsubscribe" />
                <input type="hidden" name="return_to" value="/account/details" />
                <p className="text-sm">
                  On for <span className="font-semibold">{account.email}</span>
                  {consent.consentedAt ? ` since ${consentedOn(consent.consentedAt)}` : ''}.
                </p>
                <button type="submit" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary">
                  Switch off
                </button>
              </form>
            ) : (
              <form method="post" action="/api/newsletter" className="flex flex-wrap items-center gap-4">
                <input type="hidden" name="intent" value="subscribe" />
                <input type="hidden" name="return_to" value="/account/details" />
                <p className="text-sm">
                  {consent?.status === 'pending'
                    ? 'A confirmation link was sent and has not been opened yet.'
                    : 'Off. Nothing is sent unless you ask and confirm by email.'}
                </p>
                <button type="submit" className="action-primary">
                  {consent?.status === 'pending' ? 'Send the link again' : 'Send me product news'}
                </button>
              </form>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}
