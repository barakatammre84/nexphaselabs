'use client';

import Link from 'next/link';
import { MessageSquareText, Send, X } from 'lucide-react';
import { SUPPORT } from '@/lib/support';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';

type Message = {
  id: string;
  sender: 'visitor' | 'staff';
  body: string;
  staffName: string | null;
  createdAt: string;
  screenshot: string | null;
};
type ConversationSummary = {
  id: string;
  subject: string | null;
  kind: 'bug' | 'improvement' | 'comment';
  severity: 'blocking' | 'major' | 'minor' | 'suggestion';
  status: string;
  priority: 'urgent' | 'high' | 'normal' | 'low';
  unread: number;
  lastSender: 'visitor' | 'staff';
  lastMessageAt: string;
};
type Thread = {
  conversation: null | {
    id: string;
    status: string;
    subject: string | null;
    kind: 'bug' | 'improvement' | 'comment';
    severity: 'blocking' | 'major' | 'minor' | 'suggestion';
    expectedBehavior: string | null;
    visitorName: string | null;
    visitorEmail: string | null;
    unread: number;
    priority: 'urgent' | 'high' | 'normal' | 'low';
    resolutionSummary: string | null;
  };
  messages: Message[];
  conversations: ConversationSummary[];
  hasOlderMessages?: boolean;
};

type Annotation = {
  kind: 'element' | 'text';
  selector: string;
  label: string;
  selectedText?: string;
  rect: { x: number; y: number; width: number; height: number };
};

const empty: Thread = { conversation: null, messages: [], conversations: [] };

function selectorFor(element: Element): string {
  if (element === document.body) return 'body';
  if (element === document.documentElement) return 'html';
  if (element.id) return `#${CSS.escape(element.id)}`;
  const testId = element.getAttribute('data-testid');
  if (testId) return `[data-testid="${CSS.escape(testId)}"]`;
  const parts: string[] = [];
  let current: Element | null = element;
  while (current && current !== document.body && parts.length < 8) {
    let part = current.tagName.toLowerCase();
    const parent: Element | null = current.parentElement;
    if (parent) {
      const peers = [...parent.children].filter(
        (child) => child.tagName === current!.tagName,
      );
      if (peers.length > 1)
        part += `:nth-of-type(${peers.indexOf(current) + 1})`;
    }
    parts.unshift(part);
    current = parent;
  }
  return `body > ${parts.join(' > ')}`;
}

function annotationFor(
  element: Element,
  kind: Annotation['kind'],
  selectedText?: string,
  rangeRect?: DOMRect,
): Annotation {
  const rect = rangeRect ?? element.getBoundingClientRect();
  const text =
    element.getAttribute('aria-label') ||
    element.textContent?.replace(/\s+/g, ' ').trim() ||
    element.tagName.toLowerCase();
  return {
    kind,
    selector: selectorFor(element),
    label: text.slice(0, 200),
    selectedText: selectedText?.replace(/\s+/g, ' ').trim().slice(0, 500),
    rect: {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    },
  };
}

export function FeedbackChat() {
  // Render the launcher in the initial HTML so it remains discoverable while
  // the client bundle is loading. Hydration then removes it from staff-only
  // workspaces, where the dedicated inbox is already available.
  const [available, setAvailable] = useState(true);
  const [open, setOpen] = useState(false);
  const [thread, setThread] = useState<Thread>(empty);
  const [message, setMessage] = useState('');
  const [kind, setKind] = useState<'bug' | 'improvement' | 'comment'>('comment');
  const [severity, setSeverity] = useState<'blocking' | 'major' | 'minor'>(
    'minor',
  );
  const [title, setTitle] = useState('');
  const [expectedBehavior, setExpectedBehavior] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [live, setLive] = useState(false);
  const [view, setView] = useState<'thread' | 'reports' | 'new'>('thread');
  const [pickerMode, setPickerMode] = useState<'element' | 'text' | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState('');
  const [screenshotConsent, setScreenshotConsent] = useState(false);
  const transcript = useRef<HTMLDivElement>(null);
  const selectedElement = useRef<Element | null>(null);

  useEffect(() => {
    setAvailable(
      !location.pathname.startsWith('/manage') &&
        !location.pathname.startsWith('/staff'),
    );
  }, []);

  const load = useCallback(
    async (markRead = true, conversation?: string, hydrateDraft = false) => {
      try {
        const query = new URLSearchParams();
        if (!markRead) query.set('peek', '1');
        if (conversation) query.set('conversation', conversation);
        const response = await fetch(
          `/api/feedback${query.size ? `?${query}` : ''}`,
          { cache: 'no-store' },
        );
        if (!response.ok) throw new Error('Feedback could not be loaded.');
        const next = (await response.json()) as Thread;
        setThread(next);
        if (hydrateDraft) {
          if (next.conversation?.visitorName)
            setName(next.conversation.visitorName);
          if (next.conversation?.visitorEmail)
            setEmail(next.conversation.visitorEmail);
          if (next.conversation) {
            setKind(next.conversation.kind);
            if (
              ['blocking', 'major', 'minor'].includes(
                next.conversation.severity,
              )
            )
              setSeverity(
                next.conversation.severity as 'blocking' | 'major' | 'minor',
              );
            setTitle(next.conversation.subject ?? '');
            setExpectedBehavior(next.conversation.expectedBehavior ?? '');
          }
        }
      } catch {
        setError('The saved conversation could not be loaded. Try again.');
      }
    },
    [],
  );

  useEffect(() => {
    if (!screenshot) {
      setScreenshotPreview('');
      return;
    }
    const preview = URL.createObjectURL(screenshot);
    setScreenshotPreview(preview);
    return () => URL.revokeObjectURL(preview);
  }, [screenshot]);

  useEffect(() => {
    if (!available) return;
    // 16.1: this fired on every page load, so every visitor's first impression
    // included a server round-trip for a support widget they had not opened. The
    // unread badge and saved draft can arrive once the browser is idle.
    const start = () => void load(false, undefined, true);
    if (typeof window.requestIdleCallback === 'function') {
      const handle = window.requestIdleCallback(start, { timeout: 3000 });
      return () => window.cancelIdleCallback?.(handle);
    }
    const timer = window.setTimeout(start, 1200);
    return () => window.clearTimeout(timer);
  }, [available, load]);

  useEffect(() => {
    const publicId = new URLSearchParams(location.search).get(
      'nx_feedback_focus',
    );
    if (!publicId || !/^FB-\d{6}-[A-F0-9]{8}$/.test(publicId)) return;
    fetch(`/api/manage/feedback/${encodeURIComponent(publicId)}/focus`, {
      cache: 'no-store',
    })
      .then(async (response) =>
        response.ok
          ? ((await response.json()) as { selectors?: string[] })
          : null,
      )
      .then((result: { selectors?: string[] } | null) => {
        const elements = (result?.selectors ?? [])
          .map((selector) => {
            try {
              return document.querySelector(selector);
            } catch {
              return null;
            }
          })
          .filter((element): element is Element => Boolean(element));
        for (const element of elements)
          element.setAttribute('data-nx-feedback-selected', 'true');
        elements[0]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    load(true).finally(() => setLoading(false));
  }, [load, open]);

  useEffect(() => {
    if (!thread.conversation) return;
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    let socket: WebSocket | null = null;
    let retryTimer = 0;
    let heartbeat = 0;
    let stopped = false;
    let attempt = 0;
    const connect = () => {
      if (stopped) return;
      socket = new WebSocket(
        `${protocol}//${location.host}/api/feedback/realtime?conversation=${encodeURIComponent(thread.conversation!.id)}`,
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
        if (!stopped) {
          const wait = Math.min(30_000, 1_000 * 2 ** attempt++);
          retryTimer = window.setTimeout(connect, wait);
        }
      });
      socket.addEventListener('error', () => setLive(false));
      socket.addEventListener('message', (event) => {
        try {
          const update = JSON.parse(String(event.data)) as { type?: string };
          if (update.type === 'message' || update.type === 'status')
            void load(open, thread.conversation!.id);
        } catch {
          // Unknown frames cannot alter the transcript; the next poll recovers it.
        }
      });
    };
    connect();
    const poll = window.setInterval(
      () => void load(open, thread.conversation!.id),
      open ? 10_000 : 60_000,
    );
    return () => {
      stopped = true;
      window.clearInterval(poll);
      window.clearInterval(heartbeat);
      window.clearTimeout(retryTimer);
      socket?.close(1000, 'Panel closed');
    };
  }, [load, open, thread.conversation?.id]);

  useEffect(() => {
    transcript.current?.scrollTo({
      top: transcript.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [thread.messages.length]);

  useEffect(() => {
    if (!pickerMode) return;
    setOpen(false);
    document.body.classList.add(`feedback-picking-${pickerMode}`);
    let target: Element | null = null;
    const eligible = (eventTarget: EventTarget | null) => {
      const element = eventTarget instanceof Element ? eventTarget : null;
      return element?.closest('.feedback-chat, .feedback-picker-guide')
        ? null
        : element;
    };
    const clearTarget = () => {
      target?.removeAttribute('data-nx-feedback-target');
      target = null;
    };
    const complete = (next: Annotation, element: Element) => {
      selectedElement.current?.removeAttribute('data-nx-feedback-selected');
      selectedElement.current = element;
      element.setAttribute('data-nx-feedback-selected', 'true');
      setAnnotations((current) => [...current, next].slice(-5));
      setPickerMode(null);
      setOpen(true);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (pickerMode !== 'element') return;
      const next = eligible(event.target);
      if (next === target) return;
      clearTarget();
      target = next;
      target?.setAttribute('data-nx-feedback-target', 'true');
    };
    const onClick = (event: MouseEvent) => {
      if (pickerMode !== 'element') return;
      const element = eligible(event.target);
      if (!element) return;
      event.preventDefault();
      event.stopPropagation();
      complete(annotationFor(element, 'element'), element);
    };
    const onMouseUp = (event: MouseEvent) => {
      if (pickerMode !== 'text' || !eligible(event.target)) return;
      const selection = window.getSelection();
      const selectedText = selection?.toString().trim();
      if (!selection || !selectedText || !selection.rangeCount) return;
      const range = selection.getRangeAt(0);
      const container =
        range.commonAncestorContainer instanceof Element
          ? range.commonAncestorContainer
          : range.commonAncestorContainer.parentElement;
      if (!container || !eligible(container)) return;
      complete(
        annotationFor(
          container,
          'text',
          selectedText,
          range.getBoundingClientRect(),
        ),
        container,
      );
    };
    const cancel = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPickerMode(null);
    };
    document.addEventListener('pointermove', onPointerMove, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('mouseup', onMouseUp, true);
    document.addEventListener('keydown', cancel, true);
    return () => {
      clearTarget();
      document.body.classList.remove(`feedback-picking-${pickerMode}`);
      document.removeEventListener('pointermove', onPointerMove, true);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('mouseup', onMouseUp, true);
      document.removeEventListener('keydown', cancel, true);
    };
  }, [pickerMode]);

  function clearAnnotations() {
    selectedElement.current?.removeAttribute('data-nx-feedback-selected');
    selectedElement.current = null;
    setAnnotations([]);
  }

  function startNewReport() {
    setView('new');
    setMessage('');
    setTitle('');
    setExpectedBehavior('');
    setKind('comment');
    setSeverity('minor');
    clearAnnotations();
    setScreenshot(null);
    setScreenshotConsent(false);
    setError('');
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (
      !message.trim() ||
      sending ||
      (screenshot !== null && !screenshotConsent)
    )
      return;
    setSending(true);
    setError('');
    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          name,
          email,
          conversation: view === 'thread' ? thread.conversation?.id : undefined,
          page: `${location.pathname}${location.hash}`,
          kind,
          severity,
          title,
          expectedBehavior,
          context: {
            userAgent: navigator.userAgent,
            language: navigator.language,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            viewport: { width: window.innerWidth, height: window.innerHeight },
            scroll: { x: window.scrollX, y: window.scrollY },
            devicePixelRatio: window.devicePixelRatio,
            pageTitle: document.title,
            annotations,
          },
        }),
      });
      const body = (await response.json()) as Thread & { error?: string };
      if (!response.ok)
        throw new Error(body.error || 'The message could not be saved.');
      setThread(body);
      setView('thread');
      setMessage('');
      clearAnnotations();
      if (screenshot && body.conversation) {
        const sent = [...body.messages]
          .reverse()
          .find((entry) => entry.sender === 'visitor');
        if (sent) {
          const upload = new FormData();
          upload.set('conversation', body.conversation.id);
          upload.set('message', sent.id);
          upload.set('consent', 'true');
          upload.set('screenshot', screenshot);
          const uploaded = await fetch('/api/feedback/screenshots', {
            method: 'POST',
            body: upload,
          });
          if (!uploaded.ok) {
            const result = (await uploaded.json()) as { error?: string };
            setError(
              `Report saved, but the screenshot was not attached. ${result.error ?? 'Try attaching it again.'}`,
            );
          } else {
            await load(true, body.conversation.id);
          }
        }
      }
      setScreenshot(null);
      setScreenshotConsent(false);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'The message could not be saved.',
      );
    } finally {
      setSending(false);
    }
  }

  if (!available) return null;
  const composingNew = view === 'new' || !thread.conversation;
  const totalUnread = thread.conversations.reduce(
    (total, conversation) => total + conversation.unread,
    0,
  );
  return (
    <aside
      className={`feedback-chat ${open ? 'feedback-chat-open' : ''}`}
      aria-label="Questions and feedback"
    >
      {pickerMode && (
        <div className="feedback-picker-guide" role="status">
          <strong>
            {pickerMode === 'element'
              ? 'Click the exact area to comment on'
              : 'Drag across the exact text to highlight'}
          </strong>
          <span>Press Escape to cancel</span>
          <button type="button" onClick={() => setPickerMode(null)}>
            Cancel
          </button>
        </div>
      )}
      {open && (
        <section
          id="feedback-panel"
          className="feedback-panel"
          aria-labelledby="feedback-title"
        >
          <header className="feedback-panel-header">
            <div>
              <p className="feedback-kicker">Questions and feedback</p>
              <h2 id="feedback-title">Ask a question or report a problem</h2>
              <p className="feedback-scope">{SUPPORT.outOfScope}</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close chat"
              className="feedback-close"
            >
              <X aria-hidden="true" />
            </button>
          </header>
          <div className="feedback-presence" role="status">
            <span
              className={
                live
                  ? 'feedback-signal feedback-signal-live'
                  : 'feedback-signal'
              }
            />
            {thread.conversation
              ? live
                ? 'Live connection · replies appear here'
                : 'Messages are saved · reconnecting for replies'
              : 'Reports are saved with page and browser context'}
          </div>
          <nav
            className="feedback-report-nav"
            aria-label="Your feedback reports"
          >
            {thread.conversation && (
              <button
                type="button"
                aria-current={view === 'thread' ? 'page' : undefined}
                onClick={() => setView('thread')}
              >
                Current report
              </button>
            )}
            <button
              type="button"
              aria-current={view === 'reports' ? 'page' : undefined}
              onClick={() => setView('reports')}
            >
              My reports ({thread.conversations.length})
            </button>
            <button
              type="button"
              aria-current={view === 'new' ? 'page' : undefined}
              onClick={startNewReport}
            >
              New report
            </button>
          </nav>
          {view === 'reports' ? (
            <div className="feedback-report-list">
              {thread.conversations.length ? (
                thread.conversations.map((report) => (
                  <button
                    type="button"
                    key={report.id}
                    onClick={() => {
                      setView('thread');
                      setLoading(true);
                      load(true, report.id, true).finally(() =>
                        setLoading(false),
                      );
                    }}
                  >
                    <span>
                      <strong>{report.subject || 'Untitled report'}</strong>
                      <small>{report.id}</small>
                    </span>
                    <span>
                      <b>{report.status.replaceAll('_', ' ')}</b>
                      {report.unread > 0 && <i>{report.unread} new</i>}
                    </span>
                  </button>
                ))
              ) : (
                <p className="feedback-empty">
                  No reports yet. Start with the exact page area that needs
                  attention.
                </p>
              )}
            </div>
          ) : (
            <div
              className="feedback-transcript"
              ref={transcript}
              aria-live="polite"
            >
              {!composingNew && thread.conversation && (
                <div className="feedback-report-receipt">
                  <code>{thread.conversation.id}</code>
                  <span>{thread.conversation.status.replaceAll('_', ' ')}</span>
                </div>
              )}
              {!composingNew && thread.conversation?.resolutionSummary && (
                <p className="feedback-resolution">
                  <strong>Resolution:</strong>{' '}
                  {thread.conversation.resolutionSummary}
                </p>
              )}
              {loading ? (
                <p className="feedback-empty">
                  Opening your saved conversation…
                </p>
              ) : !composingNew && thread.messages.length ? (
                <>
                  {thread.hasOlderMessages && (
                    <p className="feedback-empty">
                      Earlier entries are preserved in the staff archive.
                    </p>
                  )}
                  {thread.messages.map((entry) => (
                    <article
                      key={entry.id}
                      className={`feedback-entry feedback-entry-${entry.sender}`}
                    >
                      <div className="feedback-entry-meta">
                        <span>
                          {entry.sender === 'staff'
                            ? entry.staffName || 'NexPhase Labs'
                            : 'You'}
                        </span>
                        <time dateTime={entry.createdAt}>
                          {new Date(entry.createdAt).toLocaleTimeString([], {
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </time>
                      </div>
                      <p>{entry.body}</p>
                      {entry.screenshot && (
                        <a
                          href={entry.screenshot}
                          target="_blank"
                          rel="noreferrer"
                          className="feedback-entry-screenshot"
                        >
                          <img
                            src={entry.screenshot}
                            alt="Attached screenshot"
                          />
                          <span>Open attached screenshot</span>
                        </a>
                      )}
                    </article>
                  ))}
                </>
              ) : (
                <p className="feedback-empty">
                  File a bug, suggest an improvement, or leave a comment. A team
                  member can follow up in this same recorded thread.
                </p>
              )}
            </div>
          )}
          {view !== 'reports' && (
            <form onSubmit={send} className="feedback-form">
              {composingNew && (
                <>
                  <fieldset className="feedback-kind-picker">
                    <legend>What is this about?</legend>
                    {(['comment', 'bug', 'improvement'] as const).map(
                      (value) => (
                        <label key={value}>
                          <input
                            type="radio"
                            name="feedback-kind"
                            value={value}
                            checked={kind === value}
                            onChange={() => setKind(value)}
                          />
                          <span>
                            {value === 'bug'
                              ? 'A problem with the site'
                              : value === 'improvement'
                                ? 'A suggestion'
                                : 'A question'}
                          </span>
                        </label>
                      ),
                    )}
                  </fieldset>
                  <label className="feedback-message-label">
                    Short title
                    <input
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      maxLength={100}
                      required
                      placeholder="A few words about it"
                    />
                  </label>
                  {kind === 'bug' && (
                    <label className="feedback-message-label">
                      Impact
                      <select
                        value={severity}
                        onChange={(event) =>
                          setSeverity(
                            event.target.value as
                              | 'blocking'
                              | 'major'
                              | 'minor',
                          )
                        }
                      >
                        <option value="blocking">
                          Stops me completing a task
                        </option>
                        <option value="major">
                          Task works, but with difficulty
                        </option>
                        <option value="minor">Small or visual problem</option>
                      </select>
                    </label>
                  )}
                </>
              )}
              <div className="feedback-annotation-tools">
                <p>Attach the exact place that needs attention</p>
                <div>
                  <button
                    type="button"
                    onClick={() => setPickerMode('element')}
                  >
                    Pick an area
                  </button>
                  <button type="button" onClick={() => setPickerMode('text')}>
                    Highlight text
                  </button>
                </div>
                {annotations.length > 0 && (
                  <div className="feedback-annotation-record">
                    <span>
                      {annotations.length} page{' '}
                      {annotations.length === 1 ? 'focus' : 'focuses'} attached
                    </span>
                    <button type="button" onClick={clearAnnotations}>
                      Clear
                    </button>
                    <ol>
                      {annotations.map((item, index) => (
                        <li key={`${item.selector}-${index}`}>
                          {item.selectedText || item.label}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
              <div className="feedback-screenshot-field">
                <label>
                  Optional screenshot
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      if (file && file.size > 2 * 1024 * 1024) {
                        setError('Use a screenshot no larger than 2 MB.');
                        event.target.value = '';
                        return;
                      }
                      setScreenshot(file);
                      setScreenshotConsent(false);
                    }}
                  />
                </label>
                {screenshotPreview && (
                  <div className="feedback-screenshot-preview">
                    <img src={screenshotPreview} alt="Screenshot preview" />
                    <button type="button" onClick={() => setScreenshot(null)}>
                      Remove
                    </button>
                  </div>
                )}
                {screenshot && (
                  <label className="feedback-screenshot-consent">
                    <input
                      type="checkbox"
                      checked={screenshotConsent}
                      onChange={(event) =>
                        setScreenshotConsent(event.target.checked)
                      }
                    />
                    I reviewed and cropped or redacted passwords, payment
                    details, and personal information.
                  </label>
                )}
              </div>
              <label className="feedback-message-label">
                {composingNew ? 'What happened?' : 'Add to this report'}
                <textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  maxLength={2000}
                  rows={3}
                  required
                  placeholder="What happened, and what did you expect?"
                />
              </label>
              {composingNew && kind === 'bug' && (
                <label className="feedback-message-label">
                  What did you expect? <span>optional</span>
                  <textarea
                    value={expectedBehavior}
                    onChange={(event) =>
                      setExpectedBehavior(event.target.value)
                    }
                    maxLength={2000}
                    rows={2}
                    placeholder="Describe the result you expected."
                  />
                </label>
              )}
              {composingNew && (
                <details className="feedback-contact-details">
                  <summary>Add contact details (optional)</summary>
                  <div className="feedback-profile">
                    <label>
                      Name
                      <input
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        maxLength={100}
                        autoComplete="name"
                      />
                    </label>
                    <label>
                      Email
                      <input
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        maxLength={254}
                        type="email"
                        autoComplete="email"
                      />
                    </label>
                  </div>
                </details>
              )}
              {error && (
                <p className="feedback-error" role="alert">
                  {error}
                </p>
              )}
              <div className="feedback-form-footer">
                <p>
                  Page, browser, viewport, and selected areas are recorded.
                  Screenshots are attached only when you choose one.{' '}
                  <Link href="/legal/privacy">Privacy</Link>
                </p>
                <button
                  type="submit"
                  disabled={
                    sending ||
                    !message.trim() ||
                    (screenshot !== null && !screenshotConsent)
                  }
                >
                  <Send aria-hidden="true" />{' '}
                  {sending ? 'Saving…' : 'Send message'}
                </button>
              </div>
            </form>
          )}
        </section>
      )}
      <button
        type="button"
        className="feedback-launcher"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="feedback-panel"
        aria-label={open ? 'Close chat' : 'Questions? Chat with us'}
      >
        <MessageSquareText aria-hidden="true" />
        <span>
          {open
            ? 'Close'
            : thread.conversations.length
              ? `Chat (${thread.conversations.length})`
              : 'Questions? Chat with us'}
        </span>
        {thread.conversations.length > 0 && !open && totalUnread === 0 && (
          <i aria-label="Saved conversation" />
        )}
        {!open && totalUnread > 0 && (
          <i
            className="feedback-unread"
            aria-label={`${totalUnread} unread replies`}
          >
            {totalUnread > 9 ? '9+' : totalUnread}
          </i>
        )}
      </button>
    </aside>
  );
}
