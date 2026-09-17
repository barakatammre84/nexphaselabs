import type { Metadata } from 'next';
import Link from 'next/link';
import { BellRing } from 'lucide-react';
import { canEditCatalog, requireStaff } from '@/lib/staff-auth';
import { waitlistSummary } from '@/lib/waitlist';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Waitlist', robots: { index: false, follow: false } };

type Props = { searchParams: Promise<{ product?: string }> };

const when = (date: Date | null) =>
  date ? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'America/Los_Angeles' }).format(date) : '—';

/**
 * Demand that has nowhere to go: customers waiting on a pack size with no released lot.
 * Catalog staff use it to decide what to release next; the notices themselves go out
 * automatically on release (app/manage/lots/actions.ts) and on the five-minute sweep.
 */
export default async function WaitlistDeskPage({ searchParams }: Props) {
  const staff = await requireStaff('/manage/waitlist');
  const { product } = await searchParams;
  const filter = product?.trim().toUpperCase() || null;
  const rows = canEditCatalog(staff) ? await waitlistSummary() : [];
  const shown = filter ? rows.filter((row) => row.productCode === filter) : rows;
  const waiting = shown.reduce((sum, row) => sum + row.waiting, 0);

  return (
    <main className="mx-auto max-w-6xl px-5 py-10">
      <div className="flex items-center gap-3">
        <BellRing className="size-6 text-primary" />
        <h1 className="text-2xl font-semibold">Waitlist</h1>
      </div>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
        Customers who asked to be told when a pack size can be ordered. Releasing a lot on{' '}
        <Link href="/manage/lots" className="font-semibold text-primary">Lots</Link> sends each waiting
        customer one email; nothing here is sent by hand and nobody is emailed twice.
      </p>

      {!canEditCatalog(staff) && (
        <p className="mt-6 rounded-lg border border-border bg-secondary p-4 text-sm">
          The waitlist is visible to catalog and administrator roles.
        </p>
      )}

      {canEditCatalog(staff) && (
        <>
          <p className="mt-6 text-sm">
            {filter ? (
              <>
                Showing <span className="font-semibold">{filter}</span> ·{' '}
                <Link href="/manage/waitlist" className="text-primary">all materials</Link>
              </>
            ) : (
              `${shown.length} pack size${shown.length === 1 ? '' : 's'} with requests`
            )}
            {' · '}
            {waiting} waiting
          </p>
          {shown.length === 0 ? (
            <p className="mt-4 rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
              No requests{filter ? ' for this material' : ''} yet.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-secondary text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Material</th>
                    <th className="px-4 py-3">Pack size</th>
                    <th className="px-4 py-3 text-right">Waiting</th>
                    <th className="px-4 py-3 text-right">Notified</th>
                    <th className="px-4 py-3">Latest request</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((row) => (
                    <tr key={`${row.productCode}-${row.sku}`} className="border-t border-border">
                      <td className="px-4 py-3">
                        <span className="font-semibold">{row.productName}</span>
                        <span className="ml-2 font-mono text-xs text-muted-foreground">{row.productCode}</span>
                      </td>
                      <td className="px-4 py-3">
                        {row.pack}
                        <span className="ml-2 font-mono text-xs text-muted-foreground">{row.sku}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold">{row.waiting}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{row.notified}</td>
                      <td className="px-4 py-3 text-muted-foreground">{when(row.latestAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </main>
  );
}
