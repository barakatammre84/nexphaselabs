import type { Metadata } from 'next';
import Link from 'next/link';
import { Lock } from 'lucide-react';
import { CaseForm } from '@/components/manage/case-form';
import { assignableStaff } from '@/lib/operational-controls';
import {
  CASE_STATUS_LABEL,
  CASE_TYPE_LABEL,
  caseSummary,
  listOperationalCases,
  type CaseStatus,
  type CaseType,
} from '@/lib/operational-cases';
import { requireStaff } from '@/lib/staff-auth';
import { createCaseAction } from './actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Operational cases', robots: { index: false, follow: false } };

export default async function CasesPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const staff = await requireStaff('/manage/cases');
  const requested = (await searchParams).view;
  const view = requested === 'closed' || requested === 'all' ? requested : 'open';
  const [rows, people, summary] = await Promise.all([
    listOperationalCases(view),
    assignableStaff(),
    caseSummary(staff.id),
  ]);
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  return (
    <main className="bg-background text-foreground">
      <section className="mx-auto max-w-[1200px] px-5 py-12 sm:px-8 lg:px-12">
        <p className="utility-label flex items-center gap-3 text-primary"><Lock className="size-4" /> Internal · cases</p>
        <h1 className="mt-6 page-title">Operational cases</h1>
        <p className="mt-4 max-w-3xl text-sm leading-6 text-muted-foreground">Complaints, deviations, supplier issues, incidents, corrective actions and recalls stay in one accountable queue with evidence and history.</p>
        <div className="mt-8 grid gap-px bg-border sm:grid-cols-4">
          {[[summary.open, 'open'], [summary.critical, 'critical'], [summary.overdue, 'overdue'], [summary.mine, 'assigned to me']].map(([n, label]) => <div key={String(label)} className="bg-background p-5"><p className="font-display text-3xl font-extrabold">{n}</p><p className="mt-2 text-xs text-muted-foreground">{label}</p></div>)}
        </div>
        <nav className="mt-6 flex gap-3 text-sm font-semibold">
          {['open', 'closed', 'all'].map((item) => <Link key={item} href={`/manage/cases?view=${item}`} className={view === item ? 'text-primary underline' : 'text-muted-foreground'}>{item[0].toUpperCase() + item.slice(1)}</Link>)}
        </nav>
        <div className="mt-6 overflow-x-auto border border-border">
          <table className="w-full min-w-[850px] border-collapse text-sm">
            <thead><tr className="border-b border-border bg-secondary text-left"><th className="p-4">Case</th><th className="p-4">Type / severity</th><th className="p-4">Owner</th><th className="p-4">Due</th><th className="p-4">Status</th></tr></thead>
            <tbody>{rows.length === 0 ? <tr><td colSpan={5} className="p-6 text-muted-foreground">No cases in this view.</td></tr> : rows.map((row) => <tr key={row.id} className="border-b border-border last:border-0"><td className="p-4"><Link href={`/manage/cases/${row.caseNumber}`} className="font-mono text-xs font-semibold text-primary">{row.caseNumber}</Link><span className="mt-1 block font-semibold">{row.title}</span></td><td className="p-4">{CASE_TYPE_LABEL[row.type as CaseType]}<span className="block text-xs text-muted-foreground">{row.severity}</span></td><td className="p-4">{row.ownerName}</td><td className={row.status !== 'closed' && row.dueOn < today ? 'p-4 font-semibold text-destructive' : 'p-4'}>{row.dueOn.toISOString().slice(0, 10)}</td><td className="p-4">{CASE_STATUS_LABEL[row.status as CaseStatus]}</td></tr>)}</tbody>
          </table>
        </div>
        <section className="mt-14 border-t border-border pt-10">
          <h2 className="font-display text-2xl font-extrabold">Open a case</h2>
          <CaseForm action={createCaseAction} people={people} staff={{ id: staff.id, role: staff.role }} mode="create" />
        </section>
      </section>
    </main>
  );
}
