import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { AlertCircle, CircleCheck, Handshake } from 'lucide-react';
import { affiliateSettings, listAffiliates, listPendingPayouts, payoutYearTotals } from '@/lib/affiliates';
import { formatRate } from '@/lib/affiliate-rules';
import { NOTICE_COOKIE, readNotice } from '@/lib/notice';
import { affiliateProgramEnabled } from '@/lib/site-config';
import { canManageStaff, requireStaff } from '@/lib/staff-auth';
import { formatCents } from '@/lib/visibility-rules';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Partners', robots: { index: false, follow: false } };

type Props = { searchParams: Promise<{ saved?: string; error?: string; year?: string }> };

const field = 'h-10 rounded-lg border border-border bg-white px-3 text-sm outline-none focus:border-primary';
const when = (date: Date | null) =>
  date ? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'America/Los_Angeles' }).format(date) : '—';

/**
 * The partner desk. Approving somebody here lets a third party speak about this material for
 * money, which is why it is administrators only and why the agreement is linked from every row.
 */
export default async function AffiliatesDeskPage({ searchParams }: Props) {
  const staff = await requireStaff('/manage/affiliates');
  const admin = canManageStaff(staff);
  const { saved, error, year: yearParam } = await searchParams;
  const notice = saved || error ? readNotice((await cookies()).get(NOTICE_COOKIE)?.value) : null;
  const year = Number(yearParam) || new Date().getUTCFullYear();
  const [rows, payouts, settings, yearTotals] = admin
    ? await Promise.all([listAffiliates(), listPendingPayouts(), affiliateSettings(), payoutYearTotals(year)])
    : [[], [], null, []];

  return (
    <main className="mx-auto max-w-6xl px-5 py-10">
      <div className="flex items-center gap-3">
        <Handshake className="size-6 text-primary" />
        <h1 className="text-2xl font-semibold">Partners</h1>
      </div>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
        Approving a partner lets somebody outside this business talk about our material in exchange for commission.
        Read the application against the{' '}
        <Link href="/legal/affiliate-terms" className="font-semibold text-primary">partner agreement</Link> before you
        approve it, and suspend rather than argue if it is broken.{' '}
        {!affiliateProgramEnabled() && 'The programme is currently closed to new applications.'}
      </p>

      {!admin && (
        <p className="mt-6 rounded-lg border border-border bg-secondary p-4 text-sm">
          The partner desk is visible to administrators.
        </p>
      )}

      {notice && (
        <p role={error ? 'alert' : 'status'} className={`mt-6 flex items-center gap-2 rounded-lg border p-4 text-sm ${error ? 'border-destructive/40' : 'border-border'} bg-secondary`}>
          {error ? <AlertCircle className="size-4 text-destructive" /> : <CircleCheck className="size-4 text-primary" />}
          {notice}
        </p>
      )}

      {admin && settings && (
        <>
          <p className="mt-6 text-sm text-muted-foreground">
            <a href="/api/manage/reports/affiliates.csv" className="font-semibold text-primary">Commission ledger CSV</a>
            {' · '}
            <a href={`/api/manage/reports/affiliates.csv?year=${year}`} className="font-semibold text-primary">
              {year} payments CSV
            </a>
          </p>

          <section className="mt-8 rounded-2xl border border-border bg-white p-6">
            <h2 className="font-display text-xl font-bold">Programme settings</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              These apply to partners taken on from now. Changing the default rate does not reprice anyone already
              approved, because each partner's rate is stored on their own record; change those one at a time below.
              The commission and the hold shown here are also the figures printed in the{' '}
              <Link href="/legal/affiliate-terms" className="font-semibold text-primary">partner agreement</Link>.
            </p>
            <form method="post" action="/api/manage/affiliates" className="mt-4 flex flex-wrap items-end gap-4">
              <input type="hidden" name="intent" value="settings" />
              <label className="block text-sm">
                <span className="font-semibold">Default commission %</span>
                <input
                  name="commission_percent"
                  type="number"
                  min="0"
                  max="50"
                  step="0.5"
                  required
                  defaultValue={settings.commissionBps / 100}
                  className={`${field} mt-1 block w-32`}
                />
              </label>
              <label className="block text-sm">
                <span className="font-semibold">Payout minimum $</span>
                <input
                  name="payout_minimum_dollars"
                  type="number"
                  min="0"
                  max="10000"
                  step="1"
                  required
                  defaultValue={settings.payoutThresholdCents / 100}
                  className={`${field} mt-1 block w-32`}
                />
              </label>
              <label className="block text-sm">
                <span className="font-semibold">Hold after delivery (days)</span>
                <input
                  name="hold_days"
                  type="number"
                  min="0"
                  max="365"
                  step="1"
                  required
                  defaultValue={settings.holdDays}
                  className={`${field} mt-1 block w-40`}
                />
              </label>
              <button type="submit" className="action-primary">Save programme settings</button>
            </form>
            <p className="mt-3 text-xs text-muted-foreground">
              Currently {formatRate(settings.commissionBps)} of materials after any promo code, vesting{' '}
              {settings.holdDays} days after delivery, paid once a partner has {formatCents(settings.payoutThresholdCents)}{' '}
              vested and a W-9 on file.
            </p>
          </section>

          {payouts.length > 0 && (
            <section className="mt-8 rounded-2xl border border-border bg-white p-6">
              <h2 className="font-display text-xl font-bold">Payouts to send</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Send the money by Zelle, then record the confirmation. A payout only counts towards a partner&rsquo;s
                tax-year total once it is marked sent.
              </p>
              <ul className="mt-4 grid gap-3">
                {payouts.map((payout) => (
                  <li key={payout.id} className="rounded-xl border border-border p-4 text-sm">
                    <p className="font-semibold">
                      {payout.name} <span className="font-mono text-xs text-muted-foreground">{payout.code}</span>
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      {formatCents(payout.amountCents)} over {payout.commissionCount} order
                      {payout.commissionCount === 1 ? '' : 's'} · Zelle to {payout.payoutEmail ?? 'no address on file'} ·
                      prepared {when(payout.createdAt)}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <form method="post" action="/api/manage/affiliates" className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="intent" value="payout_sent" />
                        <input type="hidden" name="id" value={payout.id} />
                        <input name="reference" required maxLength={120} placeholder="Zelle confirmation" className={field} />
                        <button type="submit" className="action-primary">Mark sent</button>
                      </form>
                      <form method="post" action="/api/manage/affiliates">
                        <input type="hidden" name="intent" value="payout_cancel" />
                        <input type="hidden" name="id" value={payout.id} />
                        <button type="submit" className="text-sm font-semibold text-muted-foreground hover:text-destructive">
                          Cancel batch
                        </button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="mt-8">
            <h2 className="font-display text-xl font-bold">Partners and applications</h2>
            {rows.length === 0 ? (
              <p className="mt-4 rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
                No applications yet.
              </p>
            ) : (
              <ul className="mt-4 grid gap-4">
                {rows.map((row) => (
                  <li key={row.id} className="rounded-2xl border border-border bg-white p-5">
                    <div className="flex flex-wrap items-baseline justify-between gap-3">
                      <p className="font-semibold">
                        {row.name}
                        <span className="ml-2 font-mono text-xs text-muted-foreground">{row.code}</span>
                        <span className="ml-2 rounded-full border border-border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                          {row.status}
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground">{row.email} · applied {when(row.appliedAt)}</p>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {formatRate(row.commissionBps)} · {row.referredAccounts} referred ·{' '}
                      {formatCents(row.pendingCents)} accruing · {formatCents(row.vestedCents)} ready ·{' '}
                      {formatCents(row.paidCents)} paid · W-9 {row.taxFormStatus === 'on_file' ? 'on file' : 'not on file'}
                    </p>
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      {row.status !== 'approved' && (
                        <form method="post" action="/api/manage/affiliates">
                          <input type="hidden" name="intent" value="approve" />
                          <input type="hidden" name="id" value={row.id} />
                          <button type="submit" className="action-primary">Approve</button>
                        </form>
                      )}
                      {row.status === 'applied' && (
                        <form method="post" action="/api/manage/affiliates">
                          <input type="hidden" name="intent" value="decline" />
                          <input type="hidden" name="id" value={row.id} />
                          <button type="submit" className="text-sm font-semibold text-muted-foreground hover:text-destructive">
                            Decline
                          </button>
                        </form>
                      )}
                      {row.status === 'approved' && (
                        <form method="post" action="/api/manage/affiliates">
                          <input type="hidden" name="intent" value="suspend" />
                          <input type="hidden" name="id" value={row.id} />
                          <button type="submit" className="text-sm font-semibold text-muted-foreground hover:text-destructive">
                            Suspend
                          </button>
                        </form>
                      )}
                      <form method="post" action="/api/manage/affiliates" className="flex items-center gap-2">
                        <input type="hidden" name="intent" value="rate" />
                        <input type="hidden" name="id" value={row.id} />
                        <input name="rate_percent" type="number" min="0" max="50" step="0.5" defaultValue={row.commissionBps / 100} className={`${field} w-24`} />
                        <button type="submit" className="text-sm font-semibold text-primary">Set rate %</button>
                      </form>
                      <form method="post" action="/api/manage/affiliates" className="flex items-center gap-2">
                        <input type="hidden" name="intent" value="tax_form" />
                        <input type="hidden" name="id" value={row.id} />
                        <input name="reference" maxLength={120} placeholder="Where the W-9 is filed" className={field} />
                        <button type="submit" className="text-sm font-semibold text-primary">W-9 on file</button>
                      </form>
                      {row.vestedCents > 0 && (
                        <form method="post" action="/api/manage/affiliates">
                          <input type="hidden" name="intent" value="payout" />
                          <input type="hidden" name="id" value={row.id} />
                          <button type="submit" className="text-sm font-semibold text-primary">Prepare payout</button>
                        </form>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mt-10">
            <h2 className="font-display text-xl font-bold">Paid in {year}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              What each partner was actually paid in the calendar year. This is the figure a contractor information
              return is prepared from, so check the tax-form column before January.
            </p>
            {yearTotals.length === 0 ? (
              <p className="mt-4 rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
                Nothing has been paid in {year}.
              </p>
            ) : (
              <div className="mt-4 overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-secondary text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">Partner</th>
                      <th className="px-4 py-3">Payout address</th>
                      <th className="px-4 py-3">W-9</th>
                      <th className="px-4 py-3 text-right">Payments</th>
                      <th className="px-4 py-3 text-right">Paid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {yearTotals.map((row) => (
                      <tr key={row.affiliateId} className="border-t border-border">
                        <td className="px-4 py-3">
                          {row.name} <span className="font-mono text-xs text-muted-foreground">{row.code}</span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{row.payoutEmail ?? '—'}</td>
                        <td className="px-4 py-3">{row.taxFormStatus === 'on_file' ? 'on file' : 'MISSING'}</td>
                        <td className="px-4 py-3 text-right">{row.payouts}</td>
                        <td className="px-4 py-3 text-right font-mono font-semibold">{formatCents(row.paidCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
