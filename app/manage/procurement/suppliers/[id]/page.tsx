import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, CircleCheck } from 'lucide-react';
import { QualificationForm, SupplierForm } from '@/components/manage/procurement-forms';
import { getSupplier } from '@/lib/procurement';
import { PO_STATUS_LABEL, type PoStatus } from '@/lib/procurement-rules';
import { canFulfil, canVerifyAccounts, requireStaff } from '@/lib/staff-auth';
import { saveSupplierAction, supplierQualificationAction } from '../../actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Supplier', robots: { index: false, follow: false } };
type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; decided?: string }> };
const stamp = (d: Date | null) => (d ? d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : '—');

export default async function SupplierPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { saved, decided } = await searchParams;
  const staff = await requireStaff(`/manage/procurement/suppliers/${encodeURIComponent(id)}`);
  if (!canFulfil(staff)) redirect('/manage?denied=1');
  if (!/^sup_[a-f0-9]{8,32}$/.test(id)) notFound();
  const detail = await getSupplier(id);
  if (!detail) notFound();
  const { supplier, events, orders } = detail;
  const initial = Object.fromEntries(Object.entries({ name: supplier.name, address: supplier.address, country: supplier.country, contactName: supplier.contactName, contactEmail: supplier.contactEmail, phone: supplier.phone, website: supplier.website, notes: supplier.notes }).map(([k, v]) => [k, v ?? '']));

  return (
    <main className="bg-background text-foreground">
      <section className="mx-auto max-w-[1100px] px-5 py-12 sm:px-8 lg:px-12">
        <Link href="/manage/procurement" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-primary">
          <ArrowLeft className="size-4" /> Procurement
        </Link>
        <p className="mt-6 font-mono text-xs text-muted-foreground">
          {supplier.id} &middot; {supplier.qualificationStatus}
          {supplier.qualifiedBy ? ` by ${supplier.qualifiedBy} on ${stamp(supplier.qualifiedAt).slice(0, 10)}` : ''}
        </p>
        <h1 className="mt-2 font-display text-4xl font-extrabold tracking-[-0.05em]">{supplier.name}</h1>
        {(saved || decided) && (
          <p role="status" className="mt-6 flex items-center gap-2 border border-border bg-secondary p-4 text-sm">
            <CircleCheck className="size-4 text-primary" /> {saved ? 'Supplier saved.' : `Supplier is now ${decided === 'qualified' ? 'qualified' : 'suspended'}.`}
          </p>
        )}
        <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_360px]">
          <SupplierForm initial={initial} mode="update" action={saveSupplierAction.bind(null, { kind: 'update', id: supplier.id })} />
          <div className="flex flex-col gap-6">
            {canVerifyAccounts(staff) ? (
              <QualificationForm
                status={supplier.qualificationStatus}
                initial={{
                  scope: supplier.qualificationScope ?? '',
                  evidenceUrl: supplier.qualificationEvidenceUrl ?? '',
                  reviewDueOn:
                    supplier.qualificationReviewDueOn
                      ?.toISOString()
                      .slice(0, 10) ?? '',
                }}
                action={supplierQualificationAction.bind(null, supplier.id)}
              />
            ) : (
              <p className="border border-border bg-secondary p-4 text-sm text-muted-foreground">Only an admin can qualify or suspend a supplier.</p>
            )}
            <div>
              <h2 className="utility-label text-primary">Orders ({orders.length})</h2>
              <ul className="mt-3 divide-y divide-border border border-border text-sm">
                {orders.length === 0 && <li className="p-3 text-muted-foreground">None.</li>}
                {orders.map((o) => (
                  <li key={o.id} className="flex justify-between gap-3 p-3">
                    <Link href={`/manage/procurement/orders/${o.poNumber}`} className="font-mono text-xs font-semibold text-primary hover:underline">
                      {o.poNumber}
                    </Link>
                    <span className="text-xs text-muted-foreground">{PO_STATUS_LABEL[o.status as PoStatus] ?? o.status}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
        <dl className="mt-8 grid gap-4 border border-border p-5 text-sm sm:grid-cols-3">
          <div><dt className="font-semibold">Qualified scope</dt><dd className="mt-1 text-muted-foreground">{supplier.qualificationScope ?? '—'}</dd></div>
          <div><dt className="font-semibold">Evidence</dt><dd className="mt-1">{supplier.qualificationEvidenceUrl ? <a className="text-primary underline" href={supplier.qualificationEvidenceUrl} target="_blank" rel="noreferrer">Open evidence</a> : '—'}</dd></div>
          <div><dt className="font-semibold">Next review</dt><dd className="mt-1 text-muted-foreground">{supplier.qualificationReviewDueOn?.toISOString().slice(0, 10) ?? '—'}</dd></div>
        </dl>
        <h2 className="mt-12 utility-label text-primary">History</h2>
        <ul className="mt-4 divide-y divide-border border border-border text-sm">
          {events.map((e) => (
            <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 p-3">
              <span className="font-mono text-xs">{stamp(e.createdAt)}</span>
              <span className="font-semibold">{e.action}</span>
              <span className="text-muted-foreground">{e.actor}</span>
              {e.detail && <span className="text-xs text-muted-foreground">{e.detail}</span>}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
