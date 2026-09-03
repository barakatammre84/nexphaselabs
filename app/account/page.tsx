import type { Metadata } from 'next';
import Link from 'next/link';
import { Building2, CircleCheck, Clock, Lock } from 'lucide-react';
import { requireAccount } from '@/lib/account-auth';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Your account', robots: { index: false, follow: false } };

const VERIFICATION_TEXT: Record<string, { title: string; body: string }> = {
  none: {
    title: 'Organisation not yet submitted',
    body: 'Submit your organisation for verification to enable pricing, lot availability and ordering.',
  },
  submitted: {
    title: 'Verification under review',
    body: 'A person is reviewing your organisation. Most reviews complete within two business days.',
  },
  more_info: {
    title: 'More information needed',
    body: 'We need something more before approving. Check your email for what was asked.',
  },
  approved: {
    title: 'Verified institutional account',
    body: 'Pricing and lot availability are visible to you across the catalog.',
  },
  declined: {
    title: 'Verification declined',
    body: 'This organisation could not be verified under our research-use policy.',
  },
};

export default async function AccountPage() {
  const account = await requireAccount('/account');
  const verification = VERIFICATION_TEXT[account.verificationStatus] ?? VERIFICATION_TEXT.none;
  const approved = account.verificationStatus === 'approved';

  return (
    <main className="bg-background text-foreground">
      <section className="mx-auto max-w-3xl px-5 py-16 sm:px-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <p className="utility-label text-primary">Research account</p>
            <h1 className="mt-5 font-display text-4xl font-extrabold tracking-[-0.05em]">{account.name}</h1>
            <p className="mt-2 font-mono text-sm text-muted-foreground">{account.email}</p>
          </div>
          <form method="post" action="/api/account/sign-out">
            <button type="submit" className="text-sm font-semibold hover:text-primary">
              Sign out
            </button>
          </form>
        </div>

        <div className="mt-10 border border-border bg-secondary p-6">
          <div className="flex items-center gap-3">
            {approved ? (
              <CircleCheck className="size-5 text-primary" />
            ) : account.verificationStatus === 'submitted' ? (
              <Clock className="size-5 text-primary" />
            ) : (
              <Lock className="size-5 text-primary" />
            )}
            <h2 className="font-display text-xl font-bold tracking-tight">{verification.title}</h2>
          </div>
          <p className="mt-3 leading-7 text-muted-foreground">{verification.body}</p>
          {account.tier === 'institutional' && (account.verificationStatus === 'none' || account.verificationStatus === 'more_info') && (
            <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <Building2 className="size-4" /> Organisation submission opens in the next stage of the build.
            </p>
          )}
        </div>

        <dl className="mt-10 border-t border-border">
          <div className="grid gap-1 border-b border-border py-4 sm:grid-cols-[220px_1fr] sm:gap-6">
            <dt className="text-sm font-semibold text-muted-foreground">Account type</dt>
            <dd className="text-sm">{account.tier === 'institutional' ? 'Research organisation' : 'Individual researcher'}</dd>
          </div>
          <div className="grid gap-1 border-b border-border py-4 sm:grid-cols-[220px_1fr] sm:gap-6">
            <dt className="text-sm font-semibold text-muted-foreground">Catalog</dt>
            <dd className="text-sm">
              <Link href="/catalog" className="font-semibold text-primary">
                Browse materials
              </Link>
            </dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
