import type { Metadata } from 'next';
import Link from 'next/link';
import { notificationRecordHref } from '@/lib/notification-links';
import { redirect } from 'next/navigation';
import { desc, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { notificationEvents } from '@/db/notifications-schema';
import { canManageStaff, requireStaff } from '@/lib/staff-auth';
import { listNotifications, notificationCounts } from '@/lib/notifications';
import { loadCatalog } from '@/lib/catalog-data';
import { CatalogUnavailable } from '@/components/site/catalog-unavailable';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Operational notifications',
  robots: { index: false, follow: false },
};
const stamp = (value: Date | null) =>
  value
    ? value.toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
    : 'Not attempted';
const labels: Record<string, string> = {
  pending: 'Waiting',
  sending: 'Sending',
  retry: 'Retry scheduled',
  attention: 'Needs attention',
  accepted: 'Provider accepted',
  resolved: 'Handled separately',
};
const button =
  'min-h-11 border border-foreground/20 px-4 py-2 text-sm font-semibold hover:border-primary focus-visible:outline-2 focus-visible:outline-primary';

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; result?: string }>;
}) {
  const staff = await requireStaff('/manage/notifications');
  if (!canManageStaff(staff)) redirect('/manage?denied=1');
  const { status, result } = await searchParams;
  const loaded = await loadCatalog(async () => {
    const [rows, counts] = await Promise.all([
      listNotifications(status),
      notificationCounts(),
    ]);
    const events = rows.length
      ? await getDb()
          .select()
          .from(notificationEvents)
          .where(
            sql`${notificationEvents.notificationId} IN (SELECT value FROM json_each(${JSON.stringify(rows.map((row) => row.id))}))`,
          )
          .orderBy(desc(notificationEvents.createdAt))
          .limit(200)
      : [];
    return { rows, counts, events };
  });
  return (
    <main className="mx-auto max-w-[1400px] px-5 py-14 text-foreground sm:px-8 lg:px-12">
      <h1 className="font-display text-4xl font-extrabold tracking-tight">
        Operational notifications
      </h1>
      <p className="mt-5 max-w-2xl text-sm leading-6 text-muted-foreground">
        Order updates are saved with the business transaction and attempted
        every five minutes. Provider acceptance does not confirm inbox delivery.
        Verification and password-reset messages are handled separately; their
        tokens are never stored here.
      </p>
      {result && (
        <p
          role={result === 'failed' ? 'alert' : 'status'}
          className="mt-5 border border-border bg-secondary p-4 text-sm"
        >
          {result === 'failed'
            ? 'The action could not be completed. Reload and check the message state, configuration and retry limits.'
            : 'Action recorded. The current delivery state is shown below.'}
        </p>
      )}
      {loaded.unavailable ? (
        <div className="mt-8">
          <CatalogUnavailable />
        </div>
      ) : (
        <>
          <p className="mt-6 text-sm">
            <strong>
              {loaded.data?.counts.attention ?? 0} need attention.
            </strong>{' '}
            {(loaded.data?.counts.pending ?? 0) +
              (loaded.data?.counts.retry ?? 0)}{' '}
            waiting or scheduled. {loaded.data?.counts.accepted ?? 0} accepted
            by the provider.
          </p>
          <div className="mt-5 flex flex-wrap items-end gap-4">
            <form method="get" className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-sm">
                Show
                <select
                  name="status"
                  defaultValue={status ?? ''}
                  className="h-11 border border-border bg-background px-3"
                >
                  <option value="">All statuses</option>
                  {Object.entries(labels).map(([value, label]) => (
                    <option value={value} key={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <button className={button}>Filter</button>
            </form>
            <form method="post" action="/api/manage/notifications">
              <input type="hidden" name="action" value="dispatch" />
              <button className={button}>
                Process up to five due messages
              </button>
            </form>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Latest 100 messages and 200 handling events in this view. Retries
            stop before the provider&rsquo;s duplicate-protection window
            expires. For uncertain delivery, check provider history before
            contacting the customer separately.
          </p>
          <ul className="mt-6 divide-y divide-border border-y border-border">
            {!loaded.data?.rows.length && (
              <li className="py-6 text-sm text-muted-foreground">
                No notifications in this view. New order and website-feedback
                activity creates records automatically.
              </li>
            )}
            {loaded.data?.rows.map((row) => (
              <li key={row.id} className="py-6">
                <div className="flex flex-wrap justify-between gap-3">
                  <div>
                    <Link
                      className="font-semibold text-primary hover:underline"
                      href={notificationRecordHref(row.category, row.orderNumber)}
                    >
                      {row.orderNumber}
                    </Link>
                    <p className="mt-1 break-all text-sm">{row.recipient}</p>
                  </div>
                  <p
                    className={
                      row.status === 'attention'
                        ? 'font-semibold text-destructive'
                        : 'text-sm'
                    }
                  >
                    {labels[row.status] ?? row.status}
                  </p>
                </div>
                <p className="mt-3 text-sm">{row.subject}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Created {stamp(row.createdAt)} · {row.attempts} recorded
                  attempts ·{' '}
                  {row.acceptedAt
                    ? `Accepted ${stamp(row.acceptedAt)}`
                    : row.status === 'attention' || row.status === 'resolved'
                      ? 'No automatic attempt scheduled'
                      : `Next attempt ${stamp(row.nextAttemptAt)}`}
                </p>
                {row.lastError && (
                  <p className="mt-3 text-sm text-destructive">
                    {row.lastError}
                  </p>
                )}
                {row.status === 'attention' && (
                  <form
                    method="post"
                    action="/api/manage/notifications"
                    className="mt-4 flex flex-wrap items-end gap-3"
                  >
                    <input type="hidden" name="id" value={row.id} />
                    <label className="flex min-w-64 flex-1 flex-col gap-1 text-sm">
                      Handling note
                      <input
                        name="note"
                        required
                        maxLength={500}
                        placeholder="What was checked or how the customer was contacted"
                        className="h-11 border border-border bg-background px-3"
                      />
                    </label>
                    <button name="action" value="retry" className={button}>
                      Retry after configuration fix
                    </button>
                    <button name="action" value="resolve" className={button}>
                      Mark handled separately
                    </button>
                  </form>
                )}
                <details className="mt-4 text-sm">
                  <summary className="cursor-pointer font-semibold">
                    Message and handling history
                  </summary>
                  <p className="mt-3 max-w-3xl whitespace-pre-wrap text-muted-foreground">
                    {row.body}
                  </p>
                  <ul className="mt-3 space-y-2">
                    {loaded.data.events
                      .filter((event) => event.notificationId === row.id)
                      .map((event) => (
                        <li key={event.id}>
                          {stamp(event.createdAt)} — {event.action} —{' '}
                          {event.actor}
                          {event.detail ? `: ${event.detail}` : ''}
                        </li>
                      ))}
                  </ul>
                </details>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
