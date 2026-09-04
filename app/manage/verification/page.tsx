import type { Metadata } from 'next';
import Link from 'next/link';
import { Lock } from 'lucide-react';
import { CatalogUnavailable } from '@/components/site/catalog-unavailable';
import { loadCatalog } from '@/lib/catalog-data';
import { listVerificationQueue } from '@/lib/organizations';
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
  searchParams: Promise<{ status?: string }>;
}) {
  await requireStaff('/manage/verification');
  const loaded = await loadCatalog(listVerificationQueue);
  const requested = (await searchParams).status ?? '';
  const status = Object.hasOwn(STATUS_LABEL, requested) ? requested : '';
  const rows = (loaded.data ?? []).filter(
    (row) => !status || row.organization.verificationStatus === status,
  );

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
          <div className="mt-10 overflow-x-auto border border-border">
            <table className="w-full min-w-[900px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary text-left">
                  <th className="p-4 font-semibold">Organisation</th>
                  <th className="p-4 font-semibold">Applicant</th>
                  <th className="p-4 font-semibold">Domain</th>
                  <th className="p-4 font-semibold">Submitted</th>
                  <th className="p-4 font-semibold">Flags</th>
                  <th className="p-4 font-semibold">Status</th>
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
                      {STATUS_LABEL[organization.verificationStatus] ??
                        organization.verificationStatus}
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
