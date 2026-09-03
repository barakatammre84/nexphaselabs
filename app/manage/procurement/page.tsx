import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Lock, Plus } from 'lucide-react';
import { CatalogUnavailable } from '@/components/site/catalog-unavailable';
import { loadCatalog } from '@/lib/catalog-data';
import { listPurchaseOrders, listSuppliers } from '@/lib/procurement';
import { PO_STATUS_LABEL, type PoStatus } from '@/lib/procurement-rules';
import { canFulfil, requireStaff } from '@/lib/staff-auth';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Procurement', robots: { index: false, follow: false } };
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '—');
const dollars = (c: number) => `$${(c / 100).toFixed(2)}`;

export default async function ProcurementPage() {
  const staff = await requireStaff('/manage/procurement');
  if (!canFulfil(staff)) redirect('/manage?denied=1');
  const loaded = await loadCatalog(async () => ({ suppliers: await listSuppliers(), orders: await listPurchaseOrders() }));
  const suppliers = loaded.data?.suppliers ?? [];
  const orders = loaded.data?.orders ?? [];
  const open = orders.filter((o) => o.status === 'sent' || o.status === 'partially_received');
  // Committed = open lines' material plus their share of freight and duty; closed lines are netted off.
  const openMaterial = open.reduce((acc, o) => acc + o.openLineCostCents + (o.materialCents > 0 ? Math.round(((o.freightCents + o.dutyCents) * o.openLineCostCents) / o.materialCents) : 0), 0);

  return (
    <main className="bg-background text-foreground">
      <section className="mx-auto max-w-[1400px] px-5 py-14 sm:px-8 lg:px-12">
        <p className="utility-label flex items-center gap-3 text-primary">
          <Lock className="size-4" /> Internal &middot; procurement
        </p>
        <h1 className="mt-6 font-display text-[clamp(2.2rem,4.2vw,3.6rem)] font-extrabold leading-[0.95] tracking-[-0.05em]">Procurement</h1>
        <p className="mt-6 max-w-2xl text-sm leading-6 text-muted-foreground">
          Suppliers are qualified by a named admin before an order can be raised on them. A sent purchase order&rsquo;s lines are the
          expected receipts offered at lot intake, and carry the supplier and the landed cost onto the lot.
        </p>
        {loaded.unavailable ? (
          <div className="mt-10">
            <CatalogUnavailable />
          </div>
        ) : (
          <>
            <div className="mt-10 flex flex-wrap items-end justify-between gap-6">
              <h2 className="utility-label text-primary">Purchase orders</h2>
              <Link href="/manage/procurement/orders/new" className="inline-flex h-11 items-center gap-2 bg-primary px-5 text-sm font-bold text-primary-foreground hover:bg-primary/90">
                <Plus className="size-4" /> New purchase order
              </Link>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              {open.length} open order{open.length === 1 ? '' : 's'} &middot; {dollars(openMaterial)} still to arrive, including freight and duty.
            </p>
            <div className="mt-4 overflow-x-auto border border-border">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary">
                    {['Order', 'Supplier', 'Status', 'Ordered', 'Expected', 'Lines', 'Material', 'Freight + duty'].map((h) => (
                      <th key={h} className="p-4 font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {orders.length === 0 && (
                    <tr>
                      <td className="p-4 text-muted-foreground" colSpan={8}>
                        No purchase orders yet.
                      </td>
                    </tr>
                  )}
                  {orders.map((o) => (
                    <tr key={o.id} className="border-b border-border last:border-b-0">
                      <td className="p-4 font-mono text-xs">
                        <Link href={`/manage/procurement/orders/${o.poNumber}`} className="font-semibold text-primary hover:underline">
                          {o.poNumber}
                        </Link>
                      </td>
                      <td className="p-4">{o.supplierName}</td>
                      <td className="p-4">{PO_STATUS_LABEL[o.status as PoStatus] ?? o.status}</td>
                      <td className="p-4 font-mono text-xs">{day(o.orderedOn)}</td>
                      <td className="p-4 font-mono text-xs">{day(o.expectedOn)}</td>
                      <td className="p-4 font-mono text-xs">{o.lineCount}</td>
                      <td className="p-4 font-mono text-xs">{dollars(o.materialCents)}</td>
                      <td className="p-4 font-mono text-xs">{dollars(o.freightCents + o.dutyCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-14 flex flex-wrap items-end justify-between gap-6">
              <h2 className="utility-label text-primary">Suppliers</h2>
              <Link href="/manage/procurement/suppliers/new" className="inline-flex h-11 items-center gap-2 border border-foreground/20 px-5 text-sm font-semibold hover:border-primary hover:text-primary">
                <Plus className="size-4" /> New supplier
              </Link>
            </div>
            <div className="mt-4 overflow-x-auto border border-border">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary">
                    {['Supplier', 'Country', 'Qualification', 'Qualified by', 'Open orders', 'Contact'].map((h) => (
                      <th key={h} className="p-4 font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {suppliers.length === 0 && (
                    <tr>
                      <td className="p-4 text-muted-foreground" colSpan={6}>
                        No suppliers yet.
                      </td>
                    </tr>
                  )}
                  {suppliers.map((s) => (
                    <tr key={s.id} className="border-b border-border last:border-b-0">
                      <td className="p-4 font-semibold">
                        <Link href={`/manage/procurement/suppliers/${s.id}`} className="text-primary hover:underline">
                          {s.name}
                        </Link>
                        {!s.active && <span className="ml-2 font-mono text-[11px] text-muted-foreground">inactive</span>}
                      </td>
                      <td className="p-4">{s.country ?? '—'}</td>
                      <td className="p-4">{s.qualificationStatus}</td>
                      <td className="p-4 text-xs text-muted-foreground">{s.qualifiedBy ? `${s.qualifiedBy} · ${day(s.qualifiedAt)}` : '—'}</td>
                      <td className="p-4 font-mono text-xs">{s.openOrders}</td>
                      <td className="p-4 text-xs">{[s.contactName, s.contactEmail].filter(Boolean).join(' · ') || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
