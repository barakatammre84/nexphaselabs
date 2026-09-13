import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { CaseForm } from '@/components/manage/case-form';
import { assignableStaff } from '@/lib/operational-controls';
import { CASE_STATUS_LABEL, CASE_TYPE_LABEL, getOperationalCase, type CaseStatus, type CaseType } from '@/lib/operational-cases';
import { requireStaff } from '@/lib/staff-auth';
import { updateCaseAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Operational case', robots: { index: false, follow: false } };

export default async function CasePage({ params }: { params: Promise<{ caseNumber: string }> }) {
  const { caseNumber: raw } = await params;
  const caseNumber = decodeURIComponent(raw).slice(0, 80);
  const staff = await requireStaff(`/manage/cases/${encodeURIComponent(caseNumber)}`);
  const [detail, people] = await Promise.all([getOperationalCase(caseNumber), assignableStaff()]);
  if (!detail) notFound();
  const { record, events } = detail;
  const initial = Object.fromEntries(Object.entries({
    type: record.type,
    severity: record.severity,
    status: record.status,
    title: record.title,
    summary: record.summary,
    ownerId: record.ownerId,
    dueOn: record.dueOn.toISOString().slice(0, 10),
    linkedLotNumber: record.linkedLotNumber,
    linkedOrderNumber: record.linkedOrderNumber,
    linkedSupplierId: record.linkedSupplierId,
    containment: record.containment,
    rootCause: record.rootCause,
    correctiveAction: record.correctiveAction,
    preventiveAction: record.preventiveAction,
    evidenceUrl: record.evidenceUrl,
    effectivenessCheck: record.effectivenessCheck,
    closureSummary: record.closureSummary,
  }).map(([key, value]) => [key, value ?? '']));
  return (
    <main className="bg-background text-foreground">
      <section className="mx-auto max-w-[1100px] px-5 py-12 sm:px-8 lg:px-12">
        <Link href="/manage/cases" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-primary"><ArrowLeft className="size-4" /> Cases</Link>
        <p className="mt-6 font-mono text-xs text-primary">{record.caseNumber}</p>
        <h1 className="mt-2 page-title">{record.title}</h1>
        <dl className="mt-6 grid gap-px bg-border sm:grid-cols-4">
          {[
            ['Type', CASE_TYPE_LABEL[record.type as CaseType]],
            ['Severity', record.severity],
            ['Status', CASE_STATUS_LABEL[record.status as CaseStatus]],
            ['Owner', record.ownerName],
          ].map(([term, value]) => <div key={term} className="bg-background p-4"><dt className="text-xs font-semibold text-muted-foreground">{term}</dt><dd className="mt-1 text-sm font-semibold">{value}</dd></div>)}
        </dl>
        {record.evidenceUrl && <a href={record.evidenceUrl} target="_blank" rel="noreferrer" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary underline">Open evidence <ExternalLink className="size-4" /></a>}
        <section className="mt-10 border-t border-border pt-8">
          <h2 className="font-display text-2xl font-extrabold">Case record</h2>
          <CaseForm action={updateCaseAction.bind(null, record.caseNumber)} initial={initial} people={people} staff={{ id: staff.id, role: staff.role }} mode="edit" editable={staff.role === 'admin' || staff.id === record.ownerId} />
        </section>
        <section className="mt-14 border-t border-border pt-8">
          <h2 className="font-display text-2xl font-extrabold">History</h2>
          <ol className="mt-5 divide-y divide-border border-y border-border">
            {events.map((event) => <li key={event.id} className="py-4 text-sm"><span className="font-mono text-xs text-muted-foreground">{event.createdAt.toISOString().slice(0, 16).replace('T', ' ')}</span><p className="mt-1"><span className="font-semibold">{event.action}</span> · {event.fromStatus ?? 'new'} → {event.toStatus} · {event.ownerName}</p><p className="mt-1 text-xs text-muted-foreground">{event.actor}{event.note ? ` · ${event.note}` : ''}</p></li>)}
          </ol>
        </section>
      </section>
    </main>
  );
}
