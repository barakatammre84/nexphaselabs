import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { AlertCircle, ArrowLeft, CircleCheck, Handshake, Link2 } from 'lucide-react';
import { CustomerNav } from '@/components/site/customer-nav';
import { requireAccount } from '@/lib/account-auth';
import { AFFILIATE_COPY, formatRate } from '@/lib/affiliate-rules';
import { affiliateDashboard, affiliateForAccount } from '@/lib/affiliates';
import { NOTICE_COOKIE, readNotice } from '@/lib/notice';
import { affiliateProgramEnabled, publicOrigin } from '@/lib/site-config';
import { formatCents } from '@/lib/visibility-rules';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Partner programme', robots: { index: false, follow: false } };

type Props = { searchParams: Promise<{ applied?: string; error?: string }> };

const input = 'mt-2 w-full rounded-xl border border-input bg-secondary px-4 py-3 text-base outline-none focus:border-primary';
const when = (date: Date | null) =>
  date ? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'America/Los_Angeles' }).format(date) : '—';

const STATUS_LABEL: Record<string, string> = {
  pending: 'Accruing',
  vested: 'Ready to pay',
  paid: 'Paid',
  reversed: 'Reversed',
};

/** The partner's own page: apply, then see the link, what has accrued, and what has been paid. */
export default async function AccountAffiliatePage({ searchParams }: Props) {
  const account = await requireAccount('/account/affiliate');
  const { applied, error } = await searchParams;
  const notice = error ? (readNotice((await cookies()).get(NOTICE_COOKIE)?.value) ?? 'That could not be saved.') : null;
  const open = affiliateProgramEnabled();
  const affiliate = await affiliateForAccount(account.id);
  const dashboard = affiliate?.status === 'approved' ? await affiliateDashboard(affiliate) : null;
  const link = affiliate ? `${publicOrigin()}/r/${affiliate.code}` : null;

  return (
    <main className="text-foreground">
      <section className="mx-auto max-w-[1080px] px-4 py-10 sm:px-6">
        <div className="ion-page-hero p-7 sm:p-10">
          <Link href="/account" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-primary">
            <ArrowLeft className="size-4" /> Dashboard
          </Link>
          <p className="ion-kicker mt-6">Manage your account</p>
          <h1 className="ion-heading mt-5 text-4xl sm:text-5xl">Partner programme</h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
            Introduce researchers to the catalog and earn a commission on the materials they buy.
          </p>
          <div className="relative z-10 mt-7"><CustomerNav current="/account/affiliate" /></div>
        </div>

        <section className="ion-panel mt-8 p-7 sm:p-10">
          <div className="flex items-center gap-3">
            <Handshake className="size-5 text-primary" />
            <h2 className="font-display text-xl font-bold tracking-tight">
              {affiliate?.status === 'approved' ? 'Your link' : 'Apply to the programme'}
            </h2>
          </div>

          {notice && (
            <p role="alert" className="mt-5 flex items-start gap-3 rounded-xl border border-destructive/40 bg-secondary p-4 text-sm">
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" /> {notice}
            </p>
          )}
          {applied === '1' && !notice && (
            <p role="status" className="mt-5 flex items-center gap-2 rounded-xl border border-border bg-secondary p-4 text-sm">
              <CircleCheck className="size-4 text-primary" /> {AFFILIATE_COPY.applied}
            </p>
          )}

          {!open && !affiliate && (
            <p className="mt-6 rounded-[1.2rem] border border-dashed border-border p-6 text-sm leading-6 text-muted-foreground">
              {AFFILIATE_COPY.closed}
            </p>
          )}

          {affiliate?.status === 'applied' && (
            <p className="mt-6 rounded-[1.2rem] border border-border p-6 text-sm leading-6">
              {AFFILIATE_COPY.applied} Applied on {when(affiliate.appliedAt)}.
            </p>
          )}
          {affiliate?.status === 'suspended' && (
            <p role="alert" className="mt-6 rounded-[1.2rem] border border-destructive/40 p-6 text-sm leading-6">
              {AFFILIATE_COPY.suspended}
            </p>
          )}

          {affiliate?.status === 'approved' && dashboard && (
            <>
              <div className="mt-6 rounded-[1.2rem] border border-border p-5">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <Link2 className="size-4 text-primary" /> Share this link
                </p>
                <p className="mt-2 break-all font-mono text-sm text-primary">{link}</p>
                <p className="mt-3 text-xs leading-6 text-muted-foreground">
                  Commission is {formatRate(affiliate.commissionBps)} of materials after any promo code, never on
                  shipping or tax. It is credited when someone creates their account through this link, and vests{' '}
                  {dashboard.settings.holdDays} days after their order is delivered.
                </p>
              </div>

              <dl className="mt-6 grid gap-4 sm:grid-cols-4">
                {[
                  ['Accruing', dashboard.totals.pendingCents],
                  ['Ready to pay', dashboard.totals.vestedCents],
                  ['Paid', dashboard.totals.paidCents],
                  ['Reversed', dashboard.totals.reversedCents],
                ].map(([label, cents]) => (
                  <div key={String(label)} className="rounded-[1.2rem] border border-border p-5">
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
                    <dd className="mt-2 font-mono text-lg font-bold">{formatCents(Number(cents))}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-xs leading-6 text-muted-foreground">
                {dashboard.referredAccounts} account{dashboard.referredAccounts === 1 ? '' : 's'} created through your
                link. Payouts are sent by Zelle once your ready balance reaches{' '}
                {formatCents(dashboard.settings.payoutThresholdCents)}, and we need a completed W-9 on file first.
                {affiliate.taxFormStatus !== 'on_file' && ' We do not have one yet.'}
              </p>

              {dashboard.commissions.length > 0 && (
                <div className="mt-6 overflow-x-auto rounded-[1.2rem] border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-secondary text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3">Order</th>
                        <th className="px-4 py-3">Placed</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3 text-right">Commission</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboard.commissions.map((row) => (
                        <tr key={row.id} className="border-t border-border">
                          <td className="px-4 py-3 font-mono text-xs">{row.orderNumber}</td>
                          <td className="px-4 py-3 text-muted-foreground">{when(row.createdAt)}</td>
                          <td className="px-4 py-3">
                            {STATUS_LABEL[row.status] ?? row.status}
                            {row.status === 'pending' && row.vestsAt ? ` · vests ${when(row.vestsAt)}` : ''}
                          </td>
                          <td className="px-4 py-3 text-right font-mono">{formatCents(row.amountCents)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {dashboard.payouts.length > 0 && (
                <ul className="mt-6 grid gap-2 text-sm">
                  {dashboard.payouts.map((payout) => (
                    <li key={payout.id} className="flex flex-wrap justify-between gap-3 rounded-xl border border-border p-4">
                      <span>
                        {payout.status === 'sent' ? `Paid ${when(payout.sentAt)}` : 'Payout being prepared'}
                        {payout.reference ? ` · ${payout.reference}` : ''}
                      </span>
                      <span className="font-mono font-semibold">{formatCents(payout.amountCents)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {open && (!affiliate || affiliate.status === 'declined') && (
            <>
              {affiliate?.status === 'declined' && (
                <p className="mt-6 rounded-[1.2rem] border border-border p-5 text-sm leading-6">
                  {AFFILIATE_COPY.declined} You are welcome to apply again with more detail.
                </p>
              )}
              <p className="mt-6 max-w-2xl text-sm leading-6 text-muted-foreground">
                Every application is read by a person. Approval depends mostly on one thing: whether we believe you
                will keep to the limits in the{' '}
                <Link href="/legal/affiliate-terms" className="font-semibold text-primary">partner agreement</Link> on
                what may be said about research material. Those limits are strict, and they are enforced.
              </p>
              <form method="post" action="/api/account/affiliate" className="mt-6 grid max-w-2xl gap-5">
                <label className="block text-sm">
                  <span className="font-semibold">Who is your audience?</span>
                  <textarea name="audience" required minLength={20} maxLength={1000} rows={3} className={input} />
                </label>
                <label className="block text-sm">
                  <span className="font-semibold">Where would you post? Give sites or channel names.</span>
                  <textarea name="channels" required minLength={10} maxLength={1000} rows={3} className={input} />
                </label>
                <label className="block text-sm">
                  <span className="font-semibold">Zelle email address for payouts</span>
                  <input name="payout_email" type="email" required maxLength={254} defaultValue={account.email} className={input} />
                </label>
                <label className="flex items-start gap-3 text-sm">
                  <input type="checkbox" name="accept_agreement" required className="mt-1" />
                  <span>
                    I have read and accept the{' '}
                    <Link href="/legal/affiliate-terms" className="font-semibold text-primary">partner agreement</Link>,
                    including the limits on what I may say about research materials and the requirement to disclose
                    that I earn a commission.
                  </span>
                </label>
                <div>
                  <button type="submit" className="action-primary">Apply to the programme</button>
                </div>
              </form>
            </>
          )}

          <p className="mt-8 text-xs leading-6 text-muted-foreground">
            Materials are supplied for laboratory research use only; not for human or veterinary use. Partners are
            independent contractors and are responsible for their own taxes.
          </p>
        </section>
      </section>
    </main>
  );
}
