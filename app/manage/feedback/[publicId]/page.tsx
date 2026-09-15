import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { asc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { feedbackEvents } from '@/db/feedback-schema';
import { FeedbackStaffThread } from '@/components/manage/feedback-staff-thread';
import { feedbackConversation, feedbackNotesFor } from '@/lib/feedback';
import { emailProviderConfigured } from '@/lib/email-provider';
import { canHandleFeedback, requireStaff } from '@/lib/staff-auth';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Feedback conversation',
  robots: { index: false, follow: false },
};
const stamp = (value: Date) =>
  value.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';

function contextRows(value: string | null) {
  if (!value) return [];
  try {
    const context = JSON.parse(value) as Record<string, unknown>;
    const viewport = context.viewport as
      | { width?: unknown; height?: unknown }
      | undefined;
    const annotation = context.annotation as
      | { selector?: unknown; label?: unknown; selectedText?: unknown }
      | undefined;
    return [
      ['Browser', context.userAgent],
      [
        'Viewport',
        viewport
          ? `${viewport.width ?? '?'} × ${viewport.height ?? '?'}`
          : null,
      ],
      ['Language', context.language],
      ['Timezone', context.timezone],
      ['Latest page focus', annotation?.selectedText ?? annotation?.label],
      ['Latest selector', annotation?.selector],
    ].filter((row): row is [string, string] => typeof row[1] === 'string');
  } catch {
    return [];
  }
}

function labelsFrom(value: string): string[] {
  try {
    const labels = JSON.parse(value) as unknown;
    return Array.isArray(labels)
      ? labels.filter((label): label is string => typeof label === 'string')
      : [];
  } catch {
    return [];
  }
}

function focusHref(path: string, publicId: string): string {
  const [pathname, hash] = path.split('#', 2);
  return `${pathname}?nx_feedback_focus=${encodeURIComponent(publicId)}${hash ? `#${hash}` : ''}`;
}

export default async function FeedbackConversationPage({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  const { publicId } = await params;
  const staff = await requireStaff(`/manage/feedback/${publicId}`);
  if (!canHandleFeedback(staff)) redirect('/manage?denied=1');
  if (!/^FB-\d{6}-[A-F0-9]{8}$/.test(publicId)) notFound();
  const [thread, notes] = await Promise.all([
    feedbackConversation(publicId, true),
    feedbackNotesFor(publicId),
  ]);
  if (!thread) notFound();
  const events = await getDb()
    .select()
    .from(feedbackEvents)
    .where(eq(feedbackEvents.conversationId, thread.conversation.id))
    .orderBy(asc(feedbackEvents.createdAt), asc(feedbackEvents.id))
    .limit(200);
  const conversation = thread.conversation;
  const technicalContext = contextRows(conversation.browserContext);
  return (
    <main className="mx-auto max-w-[1200px] px-5 py-14 text-foreground sm:px-8 lg:px-12">
      <Link
        href="/manage/feedback"
        className="text-sm font-semibold text-primary hover:underline"
      >
        ← Feedback queue
      </Link>
      <div className="mt-7 grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div>
          <div className="border-b border-border pb-6">
            <p className="font-mono text-sm text-primary">{publicId}</p>
            <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight">
              {conversation.subject || 'Website feedback'}
            </h1>
          </div>
          <FeedbackStaffThread
            publicId={publicId}
            visitorEmail={conversation.visitorEmail}
            repliesEmailed={emailProviderConfigured()}
            status={conversation.status}
            priority={conversation.priority}
            labels={labelsFrom(conversation.labels)}
            issueUrl={conversation.issueUrl}
            resolutionSummary={conversation.resolutionSummary}
            notes={notes.map((note) => ({
              id: note.id,
              body: note.body,
              staffName: note.staffName,
              createdAt: note.createdAt.toISOString(),
            }))}
            messages={thread.messages.map((message) => ({
              id: message.id,
              sender: message.sender,
              body: message.body,
              reportTitle: message.reportTitle,
              reportKind: message.reportKind,
              reportSeverity: message.reportSeverity,
              expectedBehavior: message.expectedBehavior,
              browserContext: message.browserContext,
              staffName: message.staffName,
              sourcePath: message.sourcePath,
              screenshot: message.screenshotKey
                ? `/api/feedback/screenshots/${message.id}`
                : null,
              createdAt: message.createdAt.toISOString(),
            }))}
          />
        </div>
        <aside className="feedback-record-card">
          <h2>Conversation record</h2>
          <dl>
            <div>
              <dt>Status</dt>
              <dd>{conversation.status.replace('_', ' ')}</dd>
            </div>
            <div>
              <dt>Priority</dt>
              <dd>{conversation.priority}</dd>
            </div>
            {conversation.issueUrl && (
              <div>
                <dt>Developer issue</dt>
                <dd>
                  <a href={conversation.issueUrl}>Open linked issue</a>
                </dd>
              </div>
            )}
            <div>
              <dt>Type and impact</dt>
              <dd>
                {conversation.kind} · {conversation.severity}
              </dd>
            </div>
            {conversation.expectedBehavior && (
              <div>
                <dt>Expected behavior</dt>
                <dd>{conversation.expectedBehavior}</dd>
              </div>
            )}
            <div>
              <dt>Visitor</dt>
              <dd>{conversation.visitorName || 'Not provided'}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{conversation.visitorEmail || 'Not provided'}</dd>
            </div>
            <div>
              <dt>Started</dt>
              <dd>{stamp(conversation.createdAt)}</dd>
            </div>
            <div>
              <dt>Latest</dt>
              <dd>{stamp(conversation.lastMessageAt)}</dd>
            </div>
            <div>
              <dt>Source page</dt>
              <dd>
                <Link
                  href={focusHref(conversation.sourcePath, publicId)}
                  target="_blank"
                >
                  Open affected page and highlight it
                </Link>
              </dd>
            </div>
            {technicalContext.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <details className="mt-6">
            <summary>Workflow history</summary>
            <ol className="mt-3 space-y-3">
              {events.map((event) => (
                <li key={event.id} className="text-xs leading-5">
                  <strong>{event.action.replace('_', ' ')}</strong>
                  <br />
                  {stamp(event.createdAt)}
                  <br />
                  {event.actor}
                  {event.detail && (
                    <>
                      <br />
                      {event.detail}
                    </>
                  )}
                </li>
              ))}
            </ol>
          </details>
        </aside>
      </div>
    </main>
  );
}
