import { clientAddress, allow, rateLimitKey } from '@/lib/rate-limit';
import {
  feedbackCookie,
  feedbackRequestIsSecure,
  feedbackSameOrigin,
  feedbackToken,
  normalizeFeedbackMessage,
  normalizeFeedbackProfile,
  normalizeFeedbackReport,
  normalizeSourcePath,
} from '@/lib/feedback-core';
import {
  publishFeedback,
  queueFeedbackStaffAlerts,
  recordVisitorFeedback,
  visitorFeedbackThread,
  visitorFeedbackConversations,
} from '@/lib/feedback';

const headers = { 'Cache-Control': 'private, no-store' };

/**
 * The visitor's report list as components/site/feedback-chat.tsx reads it:
 * `id` and `unread`, never the stored `publicId` / `unreadForVisitor`. Every
 * response that carries the list goes through here, so it has one shape.
 */
async function publicConversations(token: string) {
  return (await visitorFeedbackConversations(token)).map((conversation) => ({
    id: conversation.publicId,
    subject: conversation.subject,
    kind: conversation.kind,
    severity: conversation.severity,
    status: conversation.status,
    priority: conversation.priority,
    unread: conversation.unreadForVisitor,
    lastSender: conversation.lastSender,
    lastMessageAt: conversation.lastMessageAt.toISOString(),
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
  }));
}

async function publicThread(
  thread: NonNullable<Awaited<ReturnType<typeof visitorFeedbackThread>>>,
  token: string,
) {
  return {
    conversation: {
      id: thread.conversation.publicId,
      status: thread.conversation.status,
      subject: thread.conversation.subject,
      kind: thread.conversation.kind,
      severity: thread.conversation.severity,
      expectedBehavior: thread.conversation.expectedBehavior,
      visitorName: thread.conversation.visitorName,
      visitorEmail: thread.conversation.visitorEmail,
      unread: thread.conversation.unreadForVisitor,
      priority: thread.conversation.priority,
      resolutionSummary: thread.conversation.resolutionSummary,
      createdAt: thread.conversation.createdAt.toISOString(),
      updatedAt: thread.conversation.updatedAt.toISOString(),
    },
    messages: thread.messages.map((message) => ({
      id: message.id,
      sender: message.sender,
      body: message.body,
      staffName: message.sender === 'staff' ? message.staffName : null,
      createdAt: message.createdAt.toISOString(),
      screenshot: message.screenshotKey
        ? `/api/feedback/screenshots/${encodeURIComponent(message.id)}`
        : null,
    })),
    hasOlderMessages: thread.hasOlderMessages,
    conversations: await publicConversations(token),
  };
}

export async function GET(request: Request) {
  const token = feedbackToken(request);
  if (!token)
    return Response.json(
      { conversation: null, messages: [], conversations: [] },
      { headers },
    );
  const url = new URL(request.url);
  const markRead = url.searchParams.get('peek') !== '1';
  const selected = url.searchParams.get('conversation') ?? undefined;
  if (selected && !/^FB-\d{6}-[A-F0-9]{8}$/.test(selected))
    return Response.json(
      { error: 'Invalid conversation.' },
      { status: 400, headers },
    );
  const thread = await visitorFeedbackThread(token, markRead, selected);
  return Response.json(
    thread
      ? await publicThread(thread, token)
      : {
          conversation: null,
          messages: [],
          conversations: await publicConversations(token),
        },
    { headers },
  );
}

export async function POST(request: Request) {
  const reply = (body: unknown, status = 200, cookie?: string) =>
    Response.json(body, {
      status,
      headers: { ...headers, ...(cookie ? { 'Set-Cookie': cookie } : {}) },
    });
  if (!feedbackSameOrigin(request)) return reply({ error: 'Forbidden' }, 403);
  const length = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(length) && length > 8_000)
    return reply({ error: 'The message is too large.' }, 413);
  const address = clientAddress(request);
  if (
    !(await allow(rateLimitKey('feedback-minute', address), 12, 60)) ||
    !(await allow(rateLimitKey('feedback-day', address), 100, 86_400))
  )
    return reply({ error: 'Message limit reached. Try again later.' }, 429);
  let input: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > 8_000)
      return reply({ error: 'The message is too large.' }, 413);
    input = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return reply({ error: 'The message could not be read.' }, 400);
  }
  const body = normalizeFeedbackMessage(input.message);
  const profile = normalizeFeedbackProfile(input.name, input.email);
  const report = normalizeFeedbackReport(input);
  const conversationPublicId =
    typeof input.conversation === 'string' &&
    /^FB-\d{6}-[A-F0-9]{8}$/.test(input.conversation)
      ? input.conversation
      : null;
  if (input.conversation && !conversationPublicId)
    return reply({ error: 'Invalid conversation.' }, 422);
  if (!body)
    return reply(
      { error: 'Write a message between 1 and 2,000 characters.' },
      422,
    );
  if (!profile)
    return reply({ error: 'Check the name and email fields.' }, 422);
  if (!report)
    return reply({ error: 'Check the report details and try again.' }, 422);
  try {
    const saved = await recordVisitorFeedback({
      token: feedbackToken(request),
      conversationPublicId,
      body,
      profile,
      report,
      sourcePath: normalizeSourcePath(input.page),
    });
    await publishFeedback(saved.event);
    await queueFeedbackStaffAlerts(
      saved.thread.conversation.publicId,
      saved.thread.conversation.subject ?? 'Website report',
      body,
    );
    return reply(
      await publicThread(saved.thread, saved.token),
      saved.created ? 201 : 200,
      feedbackCookie(saved.token, feedbackRequestIsSecure(request)),
    );
  } catch (error) {
    console.error(
      '[feedback] visitor message failed',
      error instanceof Error ? error.message : error,
    );
    return reply({ error: 'Your message could not be saved. Try again.' }, 503);
  }
}
