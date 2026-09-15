'use client';

import { FormEvent, useEffect, useState } from 'react';
import { SUPPORT } from '@/lib/support';
import { useRouter } from 'next/navigation';

export type FeedbackStaffMessage = {
  id: string;
  sender: string;
  body: string;
  reportTitle: string | null;
  reportKind: string | null;
  reportSeverity: string | null;
  expectedBehavior: string | null;
  browserContext: string | null;
  staffName: string | null;
  sourcePath: string | null;
  screenshot: string | null;
  createdAt: string;
};

function annotationsFrom(value: string | null) {
  if (!value) return [];
  try {
    const context = JSON.parse(value) as {
      annotation?: {
        kind?: string;
        selector?: string;
        label?: string;
        selectedText?: string;
      };
      annotations?: Array<{
        kind?: string;
        selector?: string;
        label?: string;
        selectedText?: string;
      }>;
    };
    return context.annotations?.length
      ? context.annotations
      : context.annotation
        ? [context.annotation]
        : [];
  } catch {
    return [];
  }
}

export function FeedbackStaffThread({
  publicId,
  status,
  priority,
  labels,
  issueUrl,
  resolutionSummary,
  notes,
  messages,
  visitorEmail,
  repliesEmailed,
}: {
  publicId: string;
  status: string;
  priority: string;
  labels: string[];
  issueUrl: string | null;
  resolutionSummary: string | null;
  notes: Array<{
    id: string;
    body: string;
    staffName: string;
    createdAt: string;
  }>;
  messages: FeedbackStaffMessage[];
  /** The address the visitor gave, if any. */
  visitorEmail: string | null;
  /** Whether the site can email a reply: an email provider is configured. */
  repliesEmailed: boolean;
}) {
  const router = useRouter();
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [live, setLive] = useState(false);
  const [note, setNote] = useState('');
  const [workflowPriority, setWorkflowPriority] = useState(priority);
  const [workflowLabels, setWorkflowLabels] = useState(labels.join(', '));
  const [workflowIssueUrl, setWorkflowIssueUrl] = useState(issueUrl ?? '');
  const [workflowResolution, setWorkflowResolution] = useState(
    resolutionSummary ?? '',
  );
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    let socket: WebSocket | null = null;
    let retryTimer = 0;
    let heartbeat = 0;
    let stopped = false;
    let attempt = 0;
    const connect = () => {
      socket = new WebSocket(
        `${protocol}//${location.host}/api/feedback/realtime?conversation=${encodeURIComponent(publicId)}`,
      );
      socket.addEventListener('open', () => {
        attempt = 0;
        setLive(true);
        heartbeat = window.setInterval(() => {
          if (socket?.readyState === WebSocket.OPEN) socket.send('ping');
        }, 25_000);
      });
      socket.addEventListener('close', () => {
        setLive(false);
        window.clearInterval(heartbeat);
        if (!stopped)
          retryTimer = window.setTimeout(
            connect,
            Math.min(30_000, 1_000 * 2 ** attempt++),
          );
      });
      socket.addEventListener('error', () => setLive(false));
      socket.addEventListener('message', (event) => {
        try {
          const update = JSON.parse(String(event.data)) as { type?: string };
          if (update.type === 'message' || update.type === 'status')
            router.refresh();
        } catch {
          // The persisted transcript is authoritative.
        }
      });
    };
    connect();
    const poll = window.setInterval(() => router.refresh(), 10_000);
    return () => {
      stopped = true;
      window.clearInterval(poll);
      window.clearInterval(heartbeat);
      window.clearTimeout(retryTimer);
      socket?.close(1000, 'Conversation closed');
    };
  }, [publicId, router]);

  async function action(body: Record<string, unknown>) {
    setSending(true);
    setError('');
    try {
      const response = await fetch(
        `/api/manage/feedback/${encodeURIComponent(publicId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      const result = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(result.error || 'The action could not be saved.');
      setReply('');
      if (body.action === 'note') setNote('');
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'The action could not be saved.',
      );
    } finally {
      setSending(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (reply.trim()) await action({ action: 'reply', message: reply });
  }

  function developerBrief() {
    const visitorMessages = messages
      .filter((message) => message.sender === 'visitor')
      .map((message) => `- ${message.body}`)
      .join('\n');
    return `# ${messages.find((message) => message.reportTitle)?.reportTitle ?? publicId}\n\nReport: ${publicId}\nPriority: ${workflowPriority}\nStatus: ${status}\nLabels: ${workflowLabels || 'none'}\n\n## Visitor report\n${visitorMessages}\n\n## Resolution\n${workflowResolution || 'Not recorded'}\n`;
  }

  async function copyDeveloperBrief() {
    await navigator.clipboard.writeText(developerBrief());
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  const issueTitle =
    messages.find((message) => message.reportTitle)?.reportTitle ?? publicId;
  const githubIssueHref = `https://github.com/barakatammre84/nexphaselabs.net/issues/new?title=${encodeURIComponent(`[Feedback ${publicId}] ${issueTitle}`)}&body=${encodeURIComponent(developerBrief().slice(0, 6000))}`;

  return (
    <section
      className="feedback-staff-ledger"
      aria-labelledby="staff-transcript-title"
    >
      <div className="feedback-staff-ledger-head">
        <h2 id="staff-transcript-title">Conversation record</h2>
        <p>
          <span
            className={
              live ? 'feedback-signal feedback-signal-live' : 'feedback-signal'
            }
          />{' '}
          {live ? 'Live' : 'Saved; reconnecting'}
        </p>
      </div>
      <div className="feedback-staff-transcript" aria-live="polite">
        {messages.map((message) => {
          const annotations = annotationsFrom(message.browserContext);
          return (
            <article
              key={message.id}
              className={`feedback-staff-entry feedback-staff-entry-${message.sender}`}
            >
              <div>
                <strong>
                  {message.sender === 'staff'
                    ? message.staffName || 'Staff'
                    : 'Website visitor'}
                </strong>
                <time dateTime={message.createdAt}>
                  {message.createdAt.replace('T', ' ').slice(0, 16)} UTC
                </time>
              </div>
              {message.reportTitle && <h3>{message.reportTitle}</h3>}
              {message.reportKind && (
                <small>
                  {message.reportKind} · {message.reportSeverity}
                </small>
              )}
              <p>{message.body}</p>
              {message.expectedBehavior && (
                <p className="feedback-expected">
                  <strong>Expected:</strong> {message.expectedBehavior}
                </p>
              )}
              {annotations.map((annotation, index) => (
                <dl
                  className="feedback-focus-record"
                  key={`${message.id}-focus-${index}`}
                >
                  <dt>
                    {annotation.kind === 'text'
                      ? 'Highlighted text'
                      : 'Selected area'}
                  </dt>
                  <dd>{annotation.selectedText || annotation.label}</dd>
                  {annotation.selector && (
                    <>
                      <dt>Element selector</dt>
                      <dd>
                        <code>{annotation.selector}</code>
                      </dd>
                    </>
                  )}
                </dl>
              ))}
              {message.screenshot && (
                <a
                  href={message.screenshot}
                  target="_blank"
                  rel="noreferrer"
                  className="feedback-staff-screenshot"
                >
                  <img
                    src={message.screenshot}
                    alt="Visitor-provided screenshot"
                  />
                  <span>Open full screenshot</span>
                </a>
              )}
              {message.sourcePath && (
                <small>Sent from {message.sourcePath}</small>
              )}
            </article>
          );
        })}
      </div>
      <section
        className="feedback-staff-workflow"
        aria-labelledby="feedback-workflow-title"
      >
        <h3 id="feedback-workflow-title">Triage and developer handoff</h3>
        <div className="feedback-workflow-grid">
          <label>
            Status
            <select
              value={status}
              onChange={(event) =>
                void action({ action: 'status', status: event.target.value })
              }
              disabled={sending}
            >
              <option value="new">New</option>
              <option value="open">Open</option>
              <option value="waiting_customer">Waiting for customer</option>
              <option value="closed">Closed</option>
            </select>
          </label>
          <label>
            Priority
            <select
              value={workflowPriority}
              onChange={(event) => setWorkflowPriority(event.target.value)}
            >
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="normal">Normal</option>
              <option value="low">Low</option>
            </select>
          </label>
          <label className="feedback-workflow-wide">
            Labels, separated by commas
            <input
              value={workflowLabels}
              onChange={(event) => setWorkflowLabels(event.target.value)}
              placeholder="checkout, mobile, catalog"
            />
          </label>
          <label className="feedback-workflow-wide">
            Developer issue URL
            <input
              type="url"
              value={workflowIssueUrl}
              onChange={(event) => setWorkflowIssueUrl(event.target.value)}
              placeholder="https://…"
            />
          </label>
          <label className="feedback-workflow-wide">
            Resolution summary
            <textarea
              value={workflowResolution}
              onChange={(event) => setWorkflowResolution(event.target.value)}
              maxLength={1000}
              rows={3}
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className="action-primary"
            disabled={sending}
            onClick={() =>
              void action({
                action: 'workflow',
                priority: workflowPriority,
                labels: workflowLabels
                  .split(',')
                  .map((label) => label.trim())
                  .filter(Boolean),
                issueUrl: workflowIssueUrl,
                resolutionSummary: workflowResolution,
              })
            }
          >
            Save triage
          </button>
          <button
            type="button"
            className="action-secondary"
            onClick={() => void copyDeveloperBrief()}
          >
            {copied ? 'Developer brief copied' : 'Copy developer brief'}
          </button>
          <a
            className="action-secondary"
            href={githubIssueHref}
            target="_blank"
            rel="noreferrer"
          >
            Open GitHub issue draft
          </a>
        </div>
      </section>
      <section
        className="feedback-staff-notes"
        aria-labelledby="feedback-notes-title"
      >
        <h3 id="feedback-notes-title">Internal notes</h3>
        {notes.length > 0 && (
          <ol>
            {notes.map((entry) => (
              <li key={entry.id}>
                <p>{entry.body}</p>
                <small>
                  {entry.staffName} ·{' '}
                  {entry.createdAt.replace('T', ' ').slice(0, 16)} UTC
                </small>
              </li>
            ))}
          </ol>
        )}
        <label>
          Add a staff-only note
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={2000}
            rows={3}
          />
        </label>
        <button
          type="button"
          className="action-secondary"
          disabled={sending || !note.trim()}
          onClick={() => void action({ action: 'note', message: note })}
        >
          Save internal note
        </button>
      </section>
      <form onSubmit={submit} className="feedback-staff-reply">
        <label>
          Reply to this visitor
          <textarea
            value={reply}
            onChange={(event) => setReply(event.target.value)}
            maxLength={2000}
            rows={5}
            required
          />
        </label>
        {!visitorEmail ? (
          <p className="text-sm text-muted-foreground">
            This visitor left no email address. They see your reply only when they reopen this
            conversation in the same browser.
          </p>
        ) : !repliesEmailed ? (
          <p role="note" className="text-sm font-semibold text-destructive">
            Not emailed: the site cannot send email yet. Reply to {visitorEmail} from {SUPPORT.email} as
            well.
          </p>
        ) : null}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <button
            className="action-primary"
            disabled={sending || !reply.trim()}
          >
            {sending ? 'Saving…' : 'Send reply'}
          </button>
        </div>
      </form>
    </section>
  );
}
