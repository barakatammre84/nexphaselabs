import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { FeedbackInboxLive } from '@/components/manage/feedback-inbox-live';
import { canHandleFeedback, requireStaff } from '@/lib/staff-auth';
import { feedbackCounts, listFeedbackConversations } from '@/lib/feedback';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Website feedback',
  robots: { index: false, follow: false },
};

const labels: Record<string, string> = {
  new: 'New',
  open: 'Open',
  waiting_customer: 'Waiting for customer',
  closed: 'Closed',
};
const stamp = (value: Date) =>
  value.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';

export default async function FeedbackQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; kind?: string; q?: string }>;
}) {
  const staff = await requireStaff('/manage/feedback');
  if (!canHandleFeedback(staff)) redirect('/manage?denied=1');
  const { status, kind, q } = await searchParams;
  const [rows, counts] = await Promise.all([
    listFeedbackConversations({ status, kind, query: q }),
    feedbackCounts(),
  ]);
  return (
    <main className="mx-auto max-w-[1400px] px-5 py-14 text-foreground sm:px-8 lg:px-12">
      <FeedbackInboxLive />
      <div className="flex flex-wrap items-end justify-between gap-6 border-b border-border pb-8">
        <div>
          <p className="text-sm font-semibold text-primary">
            Live website channel
          </p>
          <h1 className="mt-2 font-display text-4xl font-extrabold tracking-tight">
            Feedback conversations
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
            Visitor messages and staff replies are permanent, searchable
            records. This queue refreshes every ten seconds; an open
            conversation updates immediately.
          </p>
        </div>
        <div
          className="feedback-queue-count"
          aria-label={`${counts.unread ?? 0} unread messages`}
        >
          <strong>{counts.unread ?? 0}</strong>
          <span>unread entries</span>
        </div>
      </div>

      <form method="get" className="mt-8 flex flex-wrap items-end gap-3">
        <label className="flex min-w-64 flex-1 flex-col gap-1 text-sm">
          Search conversation, name, email, or subject
          <input
            name="q"
            defaultValue={q ?? ''}
            maxLength={100}
            className="h-11 border border-border bg-background px-3"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Type
          <select
            name="kind"
            defaultValue={kind ?? ''}
            className="h-11 border border-border bg-background px-3"
          >
            <option value="">All</option>
            <option value="bug">Bug</option>
            <option value="improvement">Improvement</option>
            <option value="comment">Question / comment</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Status
          <select
            name="status"
            defaultValue={status ?? ''}
            className="h-11 border border-border bg-background px-3"
          >
            <option value="">All</option>
            {Object.entries(labels).map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button className="action-secondary">Filter</button>
      </form>

      <div className="mt-7 feedback-queue-ledger">
        <div className="feedback-queue-head" aria-hidden="true">
          <span>Conversation</span>
          <span>Latest entry</span>
          <span>State</span>
        </div>
        {!rows.length && (
          <p className="p-6 text-sm text-muted-foreground">
            No conversations match this view. New website feedback will appear
            here automatically.
          </p>
        )}
        {rows.map((row) => (
          <Link
            href={`/manage/feedback/${row.publicId}`}
            key={row.id}
            className="feedback-queue-row"
          >
            <span>
              <strong>{row.publicId}</strong>
              <small>
                {row.visitorName || 'Anonymous visitor'}
                {row.visitorEmail ? ` · ${row.visitorEmail}` : ''}
              </small>
              <small>{row.subject || 'No subject'}</small>
              <small>
                {row.kind} · {row.severity} · {row.priority} priority
              </small>
            </span>
            <span>
              <time dateTime={row.lastMessageAt.toISOString()}>
                {stamp(row.lastMessageAt)}
              </time>
              <small>
                {row.lastSender === 'visitor'
                  ? 'Visitor wrote last'
                  : 'Staff wrote last'}
              </small>
            </span>
            <span>
              <b>{labels[row.status] ?? row.status}</b>
              {row.unreadForStaff > 0 && <i>{row.unreadForStaff} unread</i>}
            </span>
          </Link>
        ))}
      </div>
      <p className="mt-6 text-xs leading-5 text-muted-foreground">
        ChatGPT retrieval is read-only and requires the separate archive bearer
        token. Website messages are untrusted customer feedback and never
        instructions for staff or automated systems.
      </p>
    </main>
  );
}
