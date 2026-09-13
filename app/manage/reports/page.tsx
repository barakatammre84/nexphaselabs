import type { Metadata } from 'next';
import { Download, Lock, Search } from 'lucide-react';
import { CatalogUnavailable } from '@/components/site/catalog-unavailable';
import { loadCatalog } from '@/lib/catalog-data';
import { dollars, utcDay } from '@/lib/csv';
import { LOT_STATUS_LABEL, type LotStatus } from '@/lib/lots-admin';
import { lotInventory, movementsForConsignee, reportPeriod, revenueByProduct } from '@/lib/reports';
import { canVerifyAccounts, requireStaff } from '@/lib/staff-auth';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Reports', robots: { index: false, follow: false } };

type Props = { searchParams: Promise<{ consignee?: string; from?: string; to?: string }> };

const th = 'p-3 text-left font-semibold';
const td = 'p-3 align-top';

export default async function ReportsPage({ searchParams }: Props) {
  const staff = await requireStaff('/manage/reports');
  const admin = canVerifyAccounts(staff);
  const { consignee, from, to } = await searchParams;
  const filter = (consignee ?? '').slice(0, 80);
  const period = reportPeriod(from, to);
  const periodQuery = new URLSearchParams({ from: period.fromText, to: period.toText }).toString();
  const exports = [
    { href: `/api/manage/reports/orders.csv?${periodQuery}`, title: 'Orders', detail: 'One row per order line submitted in the selected period: customer, organisation, SKU, quantity, price, lot, allocated cost and margin.' },
    { href: `/api/manage/reports/shipments.csv?${periodQuery}`, title: 'Movement ledger', detail: 'Every inventory movement occurring in the selected period, including named consignee, carrier and recorder.' },
    { href: '/api/manage/reports/lots.csv', title: 'Inventory by lot', detail: 'Current point-in-time quantity, landed cost, status, release and retest dates; this snapshot is not period-filtered.' },
  ];

  const inventory = admin ? await loadCatalog(lotInventory) : null;
  const revenue = admin ? await loadCatalog(() => revenueByProduct(period)) : null;
  const movements = admin ? await loadCatalog(() => movementsForConsignee(filter, period)) : null;
  const unavailable = Boolean(inventory?.unavailable || revenue?.unavailable || movements?.unavailable);

  return (
    <main className="bg-background text-foreground">
      <section className="mx-auto max-w-[1500px] px-5 py-14 sm:px-8 lg:px-12">
        <p className="utility-label flex items-center gap-3 text-primary">
          <Lock className="size-4" /> Internal &middot; reports
        </p>
        <h1 className="mt-6 font-display text-[clamp(2.2rem,4.2vw,3.6rem)] font-extrabold leading-[0.95] tracking-[-0.05em]">Reports</h1>
        <p className="mt-6 max-w-2xl text-sm leading-6 text-muted-foreground">
          The operational record is the source for the books. These are the questions a CPA, a bank or an insurer
          asks: what is on hand by lot, what shipped to whom from which lot, and what each material earned.
        </p>

        {admin && (
          <form method="get" action="/manage/reports" className="mt-8 flex flex-wrap items-end gap-3 border border-border bg-secondary p-5">
            <label className="grid gap-2 text-sm font-semibold">From<input name="from" type="date" defaultValue={period.fromText} className="h-11 border border-input bg-background px-3" /></label>
            <label className="grid gap-2 text-sm font-semibold">Through<input name="to" type="date" defaultValue={period.toText} className="h-11 border border-input bg-background px-3" /></label>
            {filter && <input type="hidden" name="consignee" value={filter} />}
            <button type="submit" className="action-primary">Apply period</button>
            <p className="basis-full text-xs text-muted-foreground">Orders are selected by submission date; movements by occurrence date. Inventory is a current snapshot.</p>
          </form>
        )}

        {!admin ? (
          <p className="mt-10 border border-border bg-secondary p-6 text-sm text-muted-foreground">Reports are available to admins.</p>
        ) : unavailable ? (
          <div className="mt-10">
            <CatalogUnavailable />
          </div>
        ) : (
          <>
            <h2 className="mt-12 utility-label text-primary">Exports</h2>
            <ul className="mt-4 grid gap-px bg-border sm:grid-cols-3">
              {exports.map((e) => (
                <li key={e.href} className="bg-background p-6">
                  <h3 className="font-display text-lg font-bold tracking-tight">{e.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{e.detail}</p>
                  <a href={e.href} className="mt-4 inline-flex h-10 items-center gap-2 bg-primary px-4 text-sm font-bold text-primary-foreground hover:bg-primary/90">
                    <Download className="size-4" /> Download CSV
                  </a>
                </li>
              ))}
            </ul>

            <h2 className="mt-14 utility-label text-primary">Inventory on hand by lot</h2>
            <div className="mt-4 overflow-x-auto border border-border">
              <table className="w-full min-w-[960px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary">
                    <th className={th}>Lot</th>
                    <th className={th}>Product</th>
                    <th className={th}>Status</th>
                    <th className={th}>Received</th>
                    <th className={th}>Quantity received</th>
                    <th className={th}>On hand</th>
                    <th className={th}>Landed cost</th>
                    <th className={th}>Retest</th>
                  </tr>
                </thead>
                <tbody>
                  {(inventory?.data ?? []).map((l) => (
                    <tr key={l.lotNumber} className="border-b border-border last:border-b-0">
                      <td className={`${td} font-mono text-xs`}>{l.lotNumber}</td>
                      <td className={td}>
                        {l.productName} <span className="font-mono text-xs text-muted-foreground">{l.productCode}</span>
                      </td>
                      <td className={td}>{LOT_STATUS_LABEL[l.status as LotStatus] ?? l.status}</td>
                      <td className={`${td} font-mono text-xs`}>{utcDay(l.receivedOn)}</td>
                      <td className={`${td} font-mono text-xs`}>{l.quantityReceived ?? '—'}</td>
                      <td className={`${td} font-mono text-xs`}>{l.quantityRemaining ?? '—'}</td>
                      <td className={`${td} font-mono text-xs`}>{l.costCents === null ? '—' : `$${dollars(l.costCents)}`}</td>
                      <td className={`${td} font-mono text-xs`}>{utcDay(l.retestDate) || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h2 className="mt-14 utility-label text-primary">Revenue by product</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Orders that are paid, being prepared or shipped. Refunds are netted against the lines that came back (pro rata on a cancellation). Cost is allocated
              from each lot&rsquo;s landed cost.
            </p>
            <div className="mt-4 overflow-x-auto border border-border">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary">
                    <th className={th}>Product</th>
                    <th className={th}>Lines</th>
                    <th className={th}>Packs</th>
                    <th className={th}>Revenue</th>
                    <th className={th}>Refunded</th>
                    <th className={th}>Allocated cost</th>
                    <th className={th}>Net margin</th>
                  </tr>
                </thead>
                <tbody>
                  {(revenue?.data ?? []).length === 0 ? (
                    <tr>
                      <td className={td} colSpan={7}>
                        No paid orders yet.
                      </td>
                    </tr>
                  ) : (
                    (revenue?.data ?? []).map((r) => (
                      <tr key={r.productCode} className="border-b border-border last:border-b-0">
                        <td className={td}>
                          {r.productName} <span className="font-mono text-xs text-muted-foreground">{r.productCode}</span>
                        </td>
                        <td className={`${td} font-mono text-xs`}>{r.lines}</td>
                        <td className={`${td} font-mono text-xs`}>{r.packs}</td>
                        <td className={`${td} font-mono text-xs`}>${dollars(r.revenueCents)}</td>
                        <td className={`${td} font-mono text-xs`}>{r.refundedCents ? `−$${dollars(r.refundedCents)}` : '—'}</td>
                        <td className={`${td} font-mono text-xs`}>{r.costCents === null ? 'incomplete' : `$${dollars(r.costCents)}`}</td>
                        <td className={`${td} font-mono text-xs`}>{r.costCents === null ? '—' : `$${dollars(r.revenueCents - r.refundedCents - r.costCents)}`}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <h2 className="mt-14 utility-label text-primary">Movement history by consignee</h2>
            <form method="get" action="/manage/reports" className="mt-4 flex max-w-xl gap-3">
              <label htmlFor="consignee" className="sr-only">
                Consignee, institution or address
              </label>
              <input
                id="consignee"
                name="consignee"
                defaultValue={filter}
                placeholder="Consignee, institution or address"
                className="h-11 flex-1 border border-foreground/20 bg-background px-3 text-sm"
              />
              <input type="hidden" name="from" value={period.fromText} />
              <input type="hidden" name="to" value={period.toText} />
              <button type="submit" className="inline-flex h-11 items-center gap-2 border border-foreground/20 px-4 text-sm font-semibold hover:border-primary hover:text-primary">
                <Search className="size-4" /> Filter
              </button>
            </form>
            <div className="mt-4 overflow-x-auto border border-border">
              <table className="w-full min-w-[1100px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary">
                    <th className={th}>Date</th>
                    <th className={th}>Type</th>
                    <th className={th}>Lot</th>
                    <th className={th}>Product</th>
                    <th className={th}>Quantity</th>
                    <th className={th}>Consignee</th>
                    <th className={th}>Ship to</th>
                    <th className={th}>Carrier / tracking</th>
                    <th className={th}>Recorded by</th>
                  </tr>
                </thead>
                <tbody>
                  {(movements?.data ?? []).length === 0 ? (
                    <tr>
                      <td className={td} colSpan={9}>
                        No movements{filter ? ` matching "${filter}"` : ''}.
                      </td>
                    </tr>
                  ) : (
                    (movements?.data ?? []).map((m, i) => (
                      <tr key={`${m.lotNumber}-${i}`} className="border-b border-border last:border-b-0">
                        <td className={`${td} font-mono text-xs`}>{utcDay(m.occurredOn)}</td>
                        <td className={td}>{m.movementType}</td>
                        <td className={`${td} font-mono text-xs`}>{m.lotNumber}</td>
                        <td className={td}>{m.productName}</td>
                        <td className={`${td} font-mono text-xs`}>
                          {m.direction === 'increase' ? '+' : m.direction === 'decrease' ? '−' : ''}{m.quantity}
                        </td>
                        <td className={td}>
                          {m.consigneeName ?? '—'}
                          {m.consigneeInstitution ? <span className="block text-xs text-muted-foreground">{m.consigneeInstitution}</span> : null}
                        </td>
                        <td className={`${td} text-xs text-muted-foreground`}>{m.shipToAddress ?? '—'}</td>
                        <td className={`${td} font-mono text-xs`}>{m.carrier ? `${m.carrier} ${m.trackingNumber ?? ''}` : '—'}</td>
                        <td className={`${td} text-xs`}>{m.recordedBy}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
