import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, CircleCheck } from 'lucide-react';
import { PoTransitionForm } from '@/components/manage/procurement-forms';
import { getPurchaseOrder } from '@/lib/procurement';
import { PO_STATUS_LABEL, PO_TRANSITIONS, poNumberFromParam, type PoStatus } from '@/lib/procurement-rules';
import { canFulfil, requireStaff } from '@/lib/staff-auth';
import { purchaseOrderTransitionAction } from '../../actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Purchase order', robots: { index: false, follow: false } };
type Props = { params: Promise<{ poNumber: string }>; searchParams: Promise<{ saved?: string; moved?: string }> };
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '—');
const dollars = (c: number) => `$${(c / 100).toFixed(2)}`;

export default async function PurchaseOrderPage({ params, searchParams }: Props) {
  const { poNumber } = await params;
  const { saved, moved } = await searchParams;
  const staff = await requireStaff(`/manage/procurement/orders/${encodeURIComponent(poNumber)}`);
  if (!canFulfil(staff)) redirect('/manage?denied=1');
  const number = poNumberFromParam(poNumber);
  if (!number) notFound();
  const detail = await getPurchaseOrder(number);
  if (!detail) notFound();
  const { order, lines, events, supplier } = detail;
  const material = lines.reduce((a, l) => a + l.lineCostCents, 0);
  const next = PO_TRANSITIONS[order.status as PoStatus] ?? [];

  return (
    <main className="bg-background text-foreground">
      <section className="mx-auto max-w-[1200px] px-5 py-12 sm:px-8 lg:px-12">
        <Link href="/manage/procurement" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-primary">
          <ArrowLeft className="size-4" /> Procurement
        </Link>
        <p className="mt-6 font-mono text-xs text-muted-foreground">
          {order.id} &middot; created {day(order.createdAt)} by {order.createdBy}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-4">
          <h1 className="font-display text-4xl font-extrabold tracking-[-0.05em]">{order.poNumber}</h1>
          <span className="inline-block bg-secondary px-2 py-1 font-mono text-[11px] uppercase tracking-[0.08em]">{PO_STATUS_LABEL[order.status as PoStatus] ?? order.status}</span>
        </div>
        {(saved || moved) && (
          <p role="status" className="mt-6 flex items-center gap-2 border border-border bg-secondary p-4 text-sm">
            <CircleCheck className="size-4 text-primary" /> {saved ? 'Purchase order created as a draft.' : `Order is now ${PO_STATUS_LABEL[moved as PoStatus] ?? moved}.`}
          </p>
        )}
        <dl className="mt-8 grid gap-x-10 gap-y-2 border-t border-border pt-4 text-sm sm:grid-cols-2">
          <div className="flex justify-between border-b border-border py-2"><dt className="text-muted-foreground">Supplier</dt><dd>{supplier ? <Link href={`/manage/procurement/suppliers/${supplier.id}`} className="font-semibold text-primary hover:underline">{order.supplierName}</Link> : order.supplierName}</dd></div>
          <div className="flex justify-between border-b border-border py-2"><dt className="text-muted-foreground">Supplier reference</dt><dd>{order.supplierReference ?? '—'}</dd></div>
          <div className="flex justify-between border-b border-border py-2"><dt className="text-muted-foreground">Ordered</dt><dd className="font-mono text-xs">{day(order.orderedOn)}</dd></div>
          <div className="flex justify-between border-b border-border py-2"><dt className="text-muted-foreground">Expected</dt><dd className="font-mono text-xs">{day(order.expectedOn)}</dd></div>
          <div className="flex justify-between border-b border-border py-2"><dt className="text-muted-foreground">Material</dt><dd className="font-mono text-xs">{dollars(material)}</dd></div>
          <div className="flex justify-between border-b border-border py-2"><dt className="text-muted-foreground">Freight + duty</dt><dd className="font-mono text-xs">{dollars(order.freightCents)} + {dollars(order.dutyCents)}</dd></div>
        </dl>
        {order.note && <p className="mt-4 text-sm text-muted-foreground">{order.note}</p>}

        <h2 className="mt-10 utility-label text-primary">Lines</h2>
        <div className="mt-4 overflow-x-auto border border-border">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary">
                {['#', 'Product', 'Ordered', 'Received', 'Line cost', 'Landed cost', 'Lots'].map((h) => (
                  <th key={h} className="p-3 font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id} className="border-b border-border last:border-b-0">
                  <td className="p-3 font-mono text-xs">{l.lineNo}</td>
                  <td className="p-3">
                    {l.productName} <span className="font-mono text-xs text-muted-foreground">{l.productCode}</span>
                  </td>
                  <td className="p-3 font-mono text-xs">{l.quantity}</td>
                  <td className="p-3 font-mono text-xs">
                    {l.receivedQuantity ?? '—'}
                    {l.closedAt ? <span className="ml-2 text-primary">complete</span> : null}
                  </td>
                  <td className="p-3 font-mono text-xs">{dollars(l.lineCostCents)}</td>
                  <td className="p-3 font-mono text-xs">{dollars(l.landedCostCents)}</td>
                  <td className="p-3 font-mono text-xs">
                    {l.lots.length === 0
                      ? '—'
                      : l.lots.map((lot) => (
                          <Link key={lot.lotNumber} href={`/manage/lots/${encodeURIComponent(lot.lotNumber)}`} className="mr-2 font-semibold text-primary hover:underline">
                            {lot.lotNumber}
                          </Link>
                        ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Landed cost = line cost + the line&rsquo;s share of freight and duty, allocated by line cost. It becomes the lot&rsquo;s landed cost at intake unless a different cost is typed.</p>

        {next.length > 0 && (
          <div className="mt-8 flex flex-col gap-4">
            {next.includes('sent') && <PoTransitionForm to="sent" label="Mark sent to supplier" action={purchaseOrderTransitionAction.bind(null, order.poNumber)} />}
            {next.includes('received') && <PoTransitionForm to="received" label="Close short (nothing more is coming)" needsNote action={purchaseOrderTransitionAction.bind(null, order.poNumber)} />}
            {next.includes('cancelled') && <PoTransitionForm to="cancelled" label="Cancel order" needsNote action={purchaseOrderTransitionAction.bind(null, order.poNumber)} />}
          </div>
        )}
        {(order.status === 'sent' || order.status === 'partially_received') && (
          <p className="mt-6 border border-border bg-secondary p-4 text-sm">
            Open lines are offered as expected receipts on{' '}
            <Link href="/manage/lots/new" className="font-semibold text-primary hover:underline">
              Receive a lot
            </Link>
            .
          </p>
        )}

        <h2 className="mt-10 utility-label text-primary">History</h2>
        <ul className="mt-4 divide-y divide-border border border-border text-sm">
          {events.map((e) => (
            <li key={e.id} className="p-3">
              <span className="font-mono text-xs">{day(e.createdAt)}</span> &middot; {e.fromStatus} &rarr; <span className="font-semibold">{e.toStatus}</span> &middot; {e.actor}
              {e.note && <p className="mt-1 text-muted-foreground">{e.note}</p>}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
