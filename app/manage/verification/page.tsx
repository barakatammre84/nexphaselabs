import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { canVerifyAccounts } from '@/lib/staff-auth';
import Link from 'next/link';
import { Lock } from 'lucide-react';
import { CatalogUnavailable } from '@/components/site/catalog-unavailable';
import { loadCatalog } from '@/lib/catalog-data';
import { listVerificationQueue, verificationQueuePage } from '@/lib/organizations';
import { requireStaff } from '@/lib/staff-auth';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Verification queue',
  robots: { index: false, follow: false },
};

const STATUS_LABEL: Record<string, string> = {
  submitted: 'Awaiting review',
  more_info: 'More info requested',
  approved: 'Approved',
  declined: 'Declined',
  revoked: 'Revoked',
};

export default async function VerificationQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; owner?: string; due?: string; page?: string }>;
}) {
  // The decision has always required this capability; so must reading the dossier, which holds
  // an applicant's legal name, address and uploaded identity documents.
  const staff = await requireStaff('/manage/verification');
  if (!canVerifyAccounts(staff)) redirect('/manage?denied=1');
  const params = await searchParams;
  const requested = params.status ?? '';
  const status = Object.hasOwn(STATUS_LABEL, requested) ? requested : '';
  const query = (params.q ?? '').trim().slice(0, 120);
  const owner = (params.owner ?? '').trim().slice(0, 120);
  const due = ['overdue', 'today', 'upcoming', 'unset'].includes(params.due ?? '') ? params.due as 'overdue' | 'today' | 'upcoming' | 'unset' : undefined;
  const page = verificationQueuePage(params.page);
  const loaded = await loadCatalog(() => listVerificationQueue({ query, status, owner, due, page }));
  const rows = loaded.data?.rows ?? [];

  return (
    <main className="bg-background text-foreground">
      <section className="mx-auto max-w-[1500px] px-5 py-14 sm:px-8 lg:px-12">
        <p className="utility-label flex items-center gap-3 text-primary">
          <Lock className="size-4" /> Internal &middot; verification
        </p>
        <h1 className="mt-6 font-display text-[clamp(2.2rem,4.2vw,3.6rem)] font-extrabold leading-[0.95] tracking-[-0.05em]">
          Verification queue
        </h1>
        <p className="mt-6 max-w-2xl text-sm leading-6 text-muted-foreground">
          Every organisation is reviewed by a person before pricing is shown.
          Check the domain, the address and the documents against the
          research-use policy.
        </p>
        <form method="get" className="mt-6 flex flex-wrap items-end gap-3">
          <label className="grid gap-2 text-sm font-semibold">
            Review status
            <select
              name="status"
              defaultValue={status}
              className="min-h-11 rounded-md border border-input bg-background px-3"
            >
              <option value="">All statuses</option>
              {Object.entries(STATUS_LABEL).map(([value, label]) => (
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
            Organisation, applicant, or domain
            <input type="search" name="q" defaultValue={query} maxLength={120}
              className="min-h-11 rounded-md border border-input px-3" />
          </label>
          <button className="action-primary" type="submit">
            Apply filter
          </button>
        </form>
        {loaded.unavailable ? (
          <div className="mt-10">
            <CatalogUnavailable />
          </div>
        ) : rows.length === 0 ? (
          <p className="mt-10 border border-border bg-secondary p-6 text-sm">
            No submissions match this status.
          </p>
        ) : (
          <div className="mt-10 border border-border">
            <table className="hidden w-full border-collapse text-sm md:table">
              <thead>
                <tr className="border-b border-border bg-secondary text-left">
                  <th className="p-4 font-semibold">Organisation</th>
                  <th className="p-4 font-semibold">Applicant</th>
                  <th className="p-4 font-semibold">Domain</th>
                  <th className="p-4 font-semibold">Submitted</th>
                  <th className="p-4 font-semibold">Flags</th>
                  <th className="p-4 font-semibold">Owner / due</th>
                  <th className="p-4 font-semibold">Status / blocker / next action</th>
                  <th className="p-4 font-semibold">Latest evidence</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ organization, account }) => (
                  <tr
                    key={organization.id}
                    className="border-b border-border last:border-b-0"
                  >
                    <td className="p-4">
                      <Link
                        href={`/manage/verification/${organization.id}`}
                        className="font-semibold text-primary"
                      >
                        {organization.legalName}
                      </Link>
                    </td>
                    <td className="p-4">
                      {account.name}{' '}
                      <span className="font-mono text-xs text-muted-foreground">
                        {account.email}
                      </span>
                    </td>
                    <td className="p-4 font-mono text-xs">
                      {organization.website}
                    </td>
                    <td className="p-4 font-mono text-xs">
                      {organization.submittedAt.toISOString().slice(0, 10)}
                    </td>
                    <td className="p-4 text-muted-foreground">
                      {organization.reviewFlags.length || '—'}
                    </td>
                    <td className="p-4">
                       {organization.assignedName ?? 'Unassigned'}<span className="block text-xs text-muted-foreground">due {organization.serviceDueAt?.toISOString().slice(0, 10) ?? '—'}</span>
                    </td>
                    <td className="p-4">
                      {STATUS_LABEL[organization.verificationStatus] ??
                        organization.verificationStatus}
                      <span className="mt-1 block text-xs text-muted-foreground">Blocker: {organization.reviewNote ?? (organization.reviewFlags.length ? `${organization.reviewFlags.length} review flag(s)` : 'None recorded')}<br />Next: {organization.verificationStatus === 'submitted' ? 'Review dossier and evidence' : 'Monitor resubmission or renewal'}</span>
                    </td>
                    <td className="p-4 text-xs text-muted-foreground">
                      {organization.reviewedAt ? `Decision ${organization.reviewedAt.toISOString().slice(0, 10)}` : 'Submission documents'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="grid divide-y divide-border md:hidden">
              {rows.map(({ organization, account }) => (
                <article key={organization.id} className="grid gap-2 p-4 text-sm">
                  <Link href={`/manage/verification/${organization.id}`} className="font-semibold text-primary">{organization.legalName}</Link>
                  <span>{account.name} · {account.email}</span>
                   <span className="text-muted-foreground">Owner: {organization.assignedName ?? 'Unassigned'} · Due: {organization.serviceDueAt?.toISOString().slice(0, 10) ?? '—'}</span>
                  <span>Blocker: {organization.reviewNote ?? (organization.reviewFlags.length ? `${organization.reviewFlags.length} review flag(s)` : 'None recorded')} · Next: {organization.verificationStatus === 'submitted' ? 'Review dossier and evidence' : 'Monitor resubmission or renewal'}</span>
                  <span className="text-xs text-muted-foreground">Latest evidence: {organization.reviewedAt ? `Decision ${organization.reviewedAt.toISOString().slice(0, 10)}` : 'Submission documents'}</span>
                </article>
              ))}
            </div>
          </div>
        )}
        {!loaded.unavailable && (page > 1 || loaded.data?.hasNext) && (
          <nav aria-label="Verification pages" className="mt-6 flex gap-3">
            {page > 1 && <Link href={`/manage/verification?status=${encodeURIComponent(status)}&q=${encodeURIComponent(query)}&owner=${encodeURIComponent(owner)}&due=${due ?? ''}&page=${page - 1}`} className="action-secondary">Previous page</Link>}
            {loaded.data?.hasNext && <Link href={`/manage/verification?status=${encodeURIComponent(status)}&q=${encodeURIComponent(query)}&owner=${encodeURIComponent(owner)}&due=${due ?? ''}&page=${page + 1}`} className="action-secondary">Next page</Link>}
          </nav>
        )}
      </section>
    </main>
  );
}
