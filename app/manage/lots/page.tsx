import type { Metadata } from 'next';
import Link from 'next/link';
import { Lock, Plus } from 'lucide-react';
import { CatalogUnavailable } from '@/components/site/catalog-unavailable';
import { loadCatalog } from '@/lib/catalog-data';
import { LotAlerts } from '@/components/manage/lot-alerts';
import { lotAlerts } from '@/lib/lot-alerts';
import { LOT_STATUS_LABEL, listLots, type LotStatus } from '@/lib/lots-admin';
import { requireStaff } from '@/lib/staff-auth';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Lots', robots: { index: false, follow: false } };

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

export default async function LotsPage() {
  await requireStaff('/manage/lots');
  const loaded = await loadCatalog(async () => ({ lots: await listLots(), alerts: await lotAlerts() }));
  const items = loaded.data?.lots ?? [];
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
          The lot is the unit of truth. Every lot arrives in quarantine and is only sellable after a named release.
        </p>

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
          <p className="mt-10 border border-border bg-secondary p-6 text-sm">No lots received yet.</p>
        ) : (
          <div className="mt-10 overflow-x-auto border border-border">
            <table className="w-full min-w-[960px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary text-left">
                  <th className="p-4 font-semibold">Lot</th>
                  <th className="p-4 font-semibold">Product</th>
                  <th className="p-4 font-semibold">Received</th>
                  <th className="p-4 font-semibold">Manufacturer</th>
                  <th className="p-4 font-semibold">On hand</th>
                  <th className="p-4 font-semibold">Retest</th>
                  <th className="p-4 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((lot) => (
                  <tr key={lot.id} className="border-b border-border last:border-b-0">
                    <td className="p-4 font-mono text-xs">
                      <Link href={`/manage/lots/${encodeURIComponent(lot.lotNumber)}`} className="font-semibold text-primary">
                        {lot.lotNumber}
                      </Link>
                    </td>
                    <td className="p-4">
                      {lot.productName} <span className="font-mono text-xs text-muted-foreground">{lot.productCode}</span>
                    </td>
                    <td className="p-4 font-mono text-xs">{day(lot.receivedAt)}</td>
                    <td className="p-4 text-muted-foreground">{lot.manufacturerName ?? <span className="text-destructive">Not recorded</span>}</td>
                    <td className="p-4 font-mono text-xs">{lot.quantityRemaining ?? '—'}</td>
                    <td className="p-4 font-mono text-xs">{day(lot.retestDate)}</td>
                    <td className="p-4">
                      <span className={`inline-block px-2 py-1 font-mono text-[11px] uppercase tracking-[0.08em] ${STATUS_CLASS[lot.status as LotStatus] ?? ''}`}>
                        {LOT_STATUS_LABEL[lot.status as LotStatus] ?? lot.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
