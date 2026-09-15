import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertCircle, CheckCircle2, Landmark, RefreshCw } from 'lucide-react';
import { formatCents } from '@/lib/visibility-rules';
import { canVerifyAccounts, requireStaff } from '@/lib/staff-auth';
import {
  currentPacificDate,
  listZelleReconciliationRuns,
  listZelleReceipts,
  zelleMailboxHealth,
  zelleReceiptCounts,
} from '@/lib/zelle';
import { zelleConfigurationStatus } from '@/lib/zelle-config';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Zelle payments',
  robots: { index: false, follow: false },
};

const OUTCOMES = [
  ['review', 'Needs review'],
  ['matched', 'Matched'],
  ['refund_due', 'Refund due'],
  ['duplicate', 'Possible duplicate'],
  ['rejected', 'Rejected'],
  ['ignored', 'Ignored'],
] as const;

export default async function ZellePaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    outcome?: string;
    synced?: string;
    updated?: string;
    error?: string;
    reconciled?: string;
  }>;
}) {
  const staff = await requireStaff('/manage/payments/zelle');
  const params = await searchParams;
  const outcome = OUTCOMES.some(([value]) => value === params.outcome)
    ? params.outcome
    : 'review';
  const [receipts, counts, mailbox, reconciliations] = await Promise.all([
    listZelleReceipts(outcome),
    zelleReceiptCounts(),
    zelleMailboxHealth(),
    listZelleReconciliationRuns(),
  ]);
  const configuration = zelleConfigurationStatus();
  const canDecide = canVerifyAccounts(staff);
  // A sync refuses an inbox that is disabled or incomplete (syncZelleMailbox), so it is offered only when it can run.
  const canSync = canDecide && configuration.inboxConfigured;
  return (
    <main className="bg-background text-foreground">
      <section className="mx-auto max-w-[1200px] px-5 py-12 sm:px-8 lg:px-12">
        <p className="utility-label flex items-center gap-3 text-primary">
          <Landmark className="size-4" /> Internal · payments
        </p>
        <div className="mt-5 flex flex-wrap items-end justify-between gap-5">
          <div>
            <h1 className="font-display text-4xl font-extrabold tracking-[-0.05em]">
              Zelle payment desk
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
              Chase-originated receipts are separated from customer claims. Only a verified receipt with the exact order and amount can release an order to fulfillment.
            </p>
          </div>
          {canSync && (
            <form method="post" action="/api/manage/payments/zelle/sync">
              <button type="submit" className="action-secondary inline-flex items-center gap-2">
                <RefreshCw className="size-4" /> Sync inbox now
              </button>
            </form>
          )}
        </div>

        {(params.synced !== undefined || params.updated || params.reconciled) && (
          <p role="status" className="mt-6 flex items-center gap-2 border border-border bg-secondary p-4 text-sm">
            <CheckCircle2 className="size-4 text-primary" />
            {params.updated ??
              (params.reconciled
                ? params.reconciled === 'balanced'
                  ? 'Daily Chase reconciliation recorded and balanced.'
                  : `Daily Chase reconciliation recorded with a ${Number(params.reconciled) / 100} dollar difference.`
                : `Inbox synchronized; ${params.synced} new receipt records added.`)}
          </p>
        )}
        {params.error && (
          <p role="alert" className="mt-6 flex items-center gap-2 border border-destructive/40 bg-secondary p-4 text-sm">
            <AlertCircle className="size-4 text-destructive" /> {params.error}
          </p>
        )}

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <div className="border border-border p-5">
            <p className="text-sm font-semibold">Checkout</p>
            <p className="mt-2 text-2xl font-bold">
              {configuration.checkoutEnabled
                ? 'Ready'
                : configuration.simulationEnabled
                  ? 'Test ready'
                  : 'Off'}
            </p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              {configuration.recipientEmail} · mode {configuration.mode}
            </p>
          </div>
          <div className="border border-border p-5">
            <p className="text-sm font-semibold">Inbox matching</p>
            <p className="mt-2 text-2xl font-bold">{configuration.inboxConfigured ? 'Ready' : 'Off'}</p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              {configuration.missing.length
                ? `Waiting on ${configuration.missing.join(', ')}`
                : 'The five-minute scheduled sync is configured.'}
            </p>
          </div>
          <div className="border border-border p-5">
            <p className="text-sm font-semibold">Last successful sync</p>
            <p className="mt-2 text-lg font-bold">
              {mailbox?.lastSuccessfulAt
                ? mailbox.lastSuccessfulAt.toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
                : 'Not yet run'}
            </p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              {mailbox?.lastError ?? `${mailbox?.lastMessageCount ?? 0} candidate messages in the last run.`}
            </p>
          </div>
        </div>

        {canDecide && (
          <section className="mt-8 border border-border bg-secondary p-6">
            <h2 className="font-display text-xl font-bold">Record the daily Chase check</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Enter the Zelle credits and refunds shown in Chase for the Oakland business day. The system snapshots matched receipts and reports any difference; it never edits an earlier check.
            </p>
            <form method="post" action="/api/manage/payments/zelle/reconcile" className="mt-5 grid gap-4 md:grid-cols-4">
              <label className="grid gap-1.5 text-sm font-semibold">
                Business date
                <input type="date" name="business_date" required defaultValue={currentPacificDate()} className="h-11 border border-foreground/20 bg-background px-3" />
              </label>
              <label className="grid gap-1.5 text-sm font-semibold">
                Chase received total (USD)
                <input name="received_total" inputMode="decimal" required placeholder="0.00" className="h-11 border border-foreground/20 bg-background px-3 font-mono" />
              </label>
              <label className="grid gap-1.5 text-sm font-semibold">
                Chase refunded total (USD)
                <input name="refunded_total" inputMode="decimal" required defaultValue="0.00" className="h-11 border border-foreground/20 bg-background px-3 font-mono" />
              </label>
              <label className="grid gap-1.5 text-sm font-semibold">
                Note <span className="font-normal text-muted-foreground">(optional)</span>
                <input name="note" maxLength={500} className="h-11 border border-foreground/20 bg-background px-3" />
              </label>
              <button type="submit" className="action-primary min-h-11 w-fit md:col-span-4">
                Sign and record reconciliation
              </button>
            </form>
          </section>
        )}

        <nav aria-label="Zelle receipt status" className="mt-8 flex flex-wrap gap-2">
          {OUTCOMES.map(([value, label]) => (
            <Link
              key={value}
              href={`/manage/payments/zelle?outcome=${value}`}
              className={`min-h-10 border px-3 py-2 text-sm font-semibold ${outcome === value ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:border-primary hover:text-primary'}`}
            >
              {label} · {counts[value] ?? 0}
            </Link>
          ))}
        </nav>

        {receipts.length === 0 ? (
          <p className="mt-8 border border-border bg-secondary p-6 text-sm">
            No receipts are in this view.
          </p>
        ) : (
          <div className="mt-8 space-y-4">
            {receipts.map((receipt) => (
              <article key={receipt.id} className="border border-border bg-background p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="font-mono text-xs text-muted-foreground">
                      {receipt.id} · {receipt.receivedAt.toISOString().replace('T', ' ').slice(0, 16)} UTC
                    </p>
                    <p className="mt-2 text-lg font-bold">
                      {receipt.amountCents === null ? 'Amount not parsed' : formatCents(receipt.amountCents)}
                      {receipt.payerName ? ` from ${receipt.payerName}` : ''}
                    </p>
                  </div>
                  <span className="border border-border px-2 py-1 text-xs font-semibold">
                    {receipt.outcome.replaceAll('_', ' ')}
                  </span>
                </div>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <div><dt className="font-semibold text-muted-foreground">Order memo</dt><dd className="mt-1 font-mono">{receipt.orderNumber ?? 'Missing'}</dd></div>
                  <div><dt className="font-semibold text-muted-foreground">Authentication</dt><dd className="mt-1">{receipt.authentication}</dd></div>
                  <div><dt className="font-semibold text-muted-foreground">Completion</dt><dd className="mt-1">{receipt.completion}</dd></div>
                  <div><dt className="font-semibold text-muted-foreground">Parser</dt><dd className="mt-1 font-mono text-xs">{receipt.parserVersion}</dd></div>
                </dl>
                <p className="mt-4 text-sm leading-6 text-muted-foreground">
                  {receipt.outcomeDetail}
                </p>
                {receipt.orderNumber && (
                  <Link href={`/manage/orders/${receipt.orderNumber}`} className="mt-3 inline-flex text-sm font-semibold text-primary underline">
                    Open {receipt.orderNumber}
                  </Link>
                )}
                {receipt.outcome === 'review' && canDecide && (
                  <div className="mt-5 grid gap-4 border-t border-border pt-5 lg:grid-cols-2">
                    <form method="post" action={`/api/manage/payments/zelle/receipts/${receipt.id}`} className="flex flex-wrap items-end gap-3">
                      <input type="hidden" name="action" value="approve" />
                      <label className="grid flex-1 gap-1.5 text-sm font-semibold">
                        Order number
                        <input
                          name="order_number"
                          required
                          defaultValue={receipt.orderNumber ?? ''}
                          placeholder="NX-YYMMDD-NNNN"
                          className="h-11 border border-foreground/20 bg-background px-3 font-mono text-sm"
                        />
                      </label>
                      <button type="submit" className="action-primary min-h-11">Approve exact match</button>
                    </form>
                    <form method="post" action={`/api/manage/payments/zelle/receipts/${receipt.id}`} className="flex flex-wrap items-end gap-3">
                      <input type="hidden" name="action" value="reject" />
                      <label className="grid flex-1 gap-1.5 text-sm font-semibold">
                        Rejection reason
                        <input name="note" required maxLength={300} className="h-11 border border-foreground/20 bg-background px-3 text-sm" />
                      </label>
                      <button type="submit" className="action-secondary min-h-11">Reject receipt</button>
                    </form>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}

        <section className="mt-12">
          <h2 className="font-display text-2xl font-bold">Recent Chase reconciliations</h2>
          {reconciliations.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">No daily reconciliation has been recorded.</p>
          ) : (
            <div className="mt-5 overflow-x-auto border border-border">
              <table className="w-full min-w-[760px] border-collapse text-sm">
                <thead><tr className="border-b border-border bg-secondary text-left"><th className="p-3">Business date</th><th className="p-3">Chase received</th><th className="p-3">Store matched</th><th className="p-3">Difference</th><th className="p-3">Exceptions</th><th className="p-3">Signed by</th></tr></thead>
                <tbody>
                  {reconciliations.map((run) => (
                    <tr key={run.id} className="border-b border-border last:border-b-0">
                      <td className="p-3 font-mono">{run.businessDate}</td>
                      <td className="p-3 font-mono">{formatCents(run.chaseReceivedCents)}</td>
                      <td className="p-3 font-mono">{formatCents(run.matchedCents)}</td>
                      <td className={`p-3 font-mono font-semibold ${run.differenceCents === 0 ? 'text-primary' : 'text-destructive'}`}>
                        {run.differenceCents === 0
                          ? 'Balanced'
                          : `${run.differenceCents > 0 ? '+' : '-'}${formatCents(Math.abs(run.differenceCents))}`}
                      </td>
                      <td className="p-3">{run.exceptionCount}</td>
                      <td className="p-3">{run.actor}<span className="mt-1 block text-xs text-muted-foreground">{run.createdAt.toISOString().replace('T', ' ').slice(0, 16)} UTC{run.note ? ` · ${run.note}` : ''}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
