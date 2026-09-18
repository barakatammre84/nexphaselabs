import type { Metadata } from 'next';
import Link from 'next/link';
import { Lock, Plus } from 'lucide-react';
import { CatalogUnavailable } from '@/components/site/catalog-unavailable';
import { loadCatalog } from '@/lib/catalog-data';
import { LotAlerts } from '@/components/manage/lot-alerts';
import { lotAlerts } from '@/lib/lot-alerts';
import { LOT_STATUS_LABEL, listLots, queuePage, type LotStatus } from '@/lib/lots-admin';
import { requireStaff } from '@/lib/staff-auth';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Lots',
  robots: { index: false, follow: false },
};

const STATUS_CLASS: Record<LotStatus, string> = {
  quarantine: 'bg-secondary',
  released: 'bg-primary/10 text-primary',
  on_hold: 'bg-secondary',
  rejected: 'bg-destructive/10 text-destructive',
  withdrawn: 'bg-destructive/10 text-destructive',
  exhausted: 'bg-secondary text-muted-foreground',
};

function day(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : '—';
}

export default async function LotsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; owner?: string; due?: string; page?: string }>;
}) {
  await requireStaff('/manage/lots');
  const params = await searchParams;
  const requested = params.status ?? '';
  const status = Object.hasOwn(LOT_STATUS_LABEL, requested) ? requested : '';
  const query = (params.q ?? '').trim().slice(0, 120);
  const owner = (params.owner ?? '').trim().slice(0, 120);
  const due = ['overdue', 'today', 'upcoming', 'unset'].includes(params.due ?? '') ? params.due as 'overdue' | 'today' | 'upcoming' | 'unset' : undefined;
  const page = queuePage(params.page);
  const loaded = await loadCatalog(async () => ({
    lots: await listLots({ query, status, owner, due, page }),
    alerts: await lotAlerts(),
  }));
  const items = loaded.data?.lots.rows ?? [];
  const alerts = loaded.data?.alerts ?? [];

  return (
    <main className="bg-background text-foreground">
      <section className="mx-auto max-w-[1500px] px-5 py-14 sm:px-8 lg:px-12">
        <p className="utility-label flex items-center gap-3 text-primary">
          <Lock className="size-4" />
          Internal &middot; lots
        </p>
        <div className="mt-6 flex flex-wrap items-end justify-between gap-6">
          <h1 className="font-display text-[clamp(2.2rem,4.2vw,3.6rem)] font-extrabold leading-[0.95] tracking-[-0.05em]">
            Lots
          </h1>
          <Link
            href="/manage/lots/new"
            className="inline-flex h-11 items-center gap-2 bg-primary px-5 text-sm font-bold text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="size-4" /> Receive a lot
          </Link>
        </div>
        <p className="mt-6 max-w-2xl text-sm leading-6 text-muted-foreground">
          The lot is the unit of truth. Every lot arrives in quarantine and is
          only sellable after a named release.
        </p>

        <form method="get" className="mt-6 flex flex-wrap items-end gap-3">
          <label className="grid gap-2 text-sm font-semibold">
            Lot status
            <select
              name="status"
              defaultValue={status}
              className="min-h-11 rounded-md border border-input bg-background px-3"
            >
              <option value="">All statuses</option>
              {Object.entries(LOT_STATUS_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-semibold">Owner
            <input name="owner" defaultValue={owner} maxLength={120} className="min-h-11 rounded-md border border-input px-3" />
          </label>
          <label className="grid gap-2 text-sm font-semibold">Service due
            <select name="due" defaultValue={due ?? ''} className="min-h-11 rounded-md border border-input bg-background px-3">
              <option value="">Any date</option><option value="overdue">Overdue</option><option value="today">Today</option><option value="upcoming">Upcoming</option><option value="unset">Not set</option>
            </select>
          </label>
          <label className="grid min-w-0 flex-1 basis-64 gap-2 text-sm font-semibold">
            Lot, product, or manufacturer
            <input type="search" name="q" defaultValue={query} maxLength={120}
              className="min-h-11 rounded-md border border-input px-3" />
          </label>
          <button className="action-primary" type="submit">
            Apply filter
          </button>
        </form>
        {!loaded.unavailable && alerts.length > 0 && (
          <div className="mt-8">
            <LotAlerts alerts={alerts} />
          </div>
        )}

        {loaded.unavailable ? (
          <div className="mt-10">
            <CatalogUnavailable />
          </div>
        ) : items.length === 0 ? (
          <p className="mt-10 border border-border bg-secondary p-6 text-sm">
            No lots match this status.
          </p>
        ) : (
          <div className="mt-10 border border-border">
            <table className="hidden w-full border-collapse text-sm md:table">
              <thead>
                <tr className="border-b border-border bg-secondary text-left">
                  <th className="p-4 font-semibold">Lot</th>
                  <th className="p-4 font-semibold">Product</th>
                  <th className="p-4 font-semibold">Received</th>
                  <th className="p-4 font-semibold">Manufacturer</th>
                  <th className="p-4 font-semibold">On hand</th>
                  <th className="p-4 font-semibold">Retest</th>
                  <th className="p-4 font-semibold">Owner / due</th>
                  <th className="p-4 font-semibold">Status / blocker / next action</th>
                  <th className="p-4 font-semibold">Latest evidence</th>
                </tr>
              </thead>
              <tbody>
                {items.map((lot) => (
                  <tr
                    key={lot.id}
                    className="border-b border-border last:border-b-0"
                  >
                    <td className="p-4 font-mono text-xs">
                      <Link
                        href={`/manage/lots/${encodeURIComponent(lot.lotNumber)}`}
                        className="font-semibold text-primary"
                      >
                        {lot.lotNumber}
                      </Link>
                    </td>
                    <td className="p-4">
                      {lot.productName}{' '}
                      <span className="font-mono text-xs text-muted-foreground">
                        {lot.productCode}
                      </span>
                    </td>
                    <td className="p-4 font-mono text-xs">
                      {day(lot.receivedAt)}
                    </td>
                    <td className="p-4 text-muted-foreground">
                      {lot.manufacturerName ?? (
                        <span className="text-destructive">Not recorded</span>
                      )}
                    </td>
                    <td className="p-4 font-mono text-xs">
                      {lot.quantityRemaining ?? '—'}
                    </td>
                    <td className="p-4 font-mono text-xs">
                      {day(lot.retestDate)}
                    </td>
                    <td className="p-4">
                       {lot.assignedName ?? 'Unassigned'}
                      <span className="block text-xs text-muted-foreground">
                         due {day(lot.serviceDueAt)}
                      </span>
                    </td>
                    <td className="p-4">
                      <span
                        className={`inline-block px-2 py-1 font-mono text-[11px] uppercase tracking-[0.08em] ${STATUS_CLASS[lot.status as LotStatus] ?? ''}`}
                      >
                        {LOT_STATUS_LABEL[lot.status as LotStatus] ??
                          lot.status}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        Blocker: {lot.statusReason ?? 'None recorded'}
                        <br />
                        Next: {lot.status === 'quarantine' ? 'Review evidence and release' : 'Monitor lot status'}
                      </span>
                    </td>
                    <td className="p-4 text-xs text-muted-foreground">
                      {lot.coaKey || lot.sdsKey || lot.chromatogramKey || lot.massSpecKey
                        ? 'Document recorded'
                        : 'None recorded'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="grid divide-y divide-border md:hidden">
              {items.map((lot) => (
                <article key={lot.id} className="grid gap-2 p-4 text-sm">
                  <Link href={`/manage/lots/${encodeURIComponent(lot.lotNumber)}`} className="font-semibold text-primary">{lot.lotNumber}</Link>
                  <span>{lot.productName} <span className="font-mono text-xs text-muted-foreground">{lot.productCode}</span></span>
                   <span className="text-muted-foreground">Owner: {lot.assignedName ?? 'Unassigned'} · Due: {day(lot.serviceDueAt)}</span>
                  <span>Blocker: {lot.statusReason ?? 'None recorded'} · Next: {lot.status === 'quarantine' ? 'Review evidence and release' : 'Monitor lot status'}</span>
                  <span className="text-xs text-muted-foreground">Latest evidence: {lot.coaKey || lot.sdsKey || lot.chromatogramKey || lot.massSpecKey ? 'Document recorded' : 'None recorded'}</span>
                </article>
              ))}
            </div>
          </div>
        )}
        {!loaded.unavailable && (page > 1 || loaded.data?.lots.hasNext) && (
          <nav aria-label="Lot pages" className="mt-6 flex gap-3">
            {page > 1 && <Link href={`/manage/lots?status=${encodeURIComponent(status)}&q=${encodeURIComponent(query)}&owner=${encodeURIComponent(owner)}&due=${due ?? ''}&page=${page - 1}`} className="action-secondary">Previous page</Link>}
            {loaded.data?.lots.hasNext && <Link href={`/manage/lots?status=${encodeURIComponent(status)}&q=${encodeURIComponent(query)}&owner=${encodeURIComponent(owner)}&due=${due ?? ''}&page=${page + 1}`} className="action-secondary">Next page</Link>}
          </nav>
        )}
      </section>
    </main>
  );
}
