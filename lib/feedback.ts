import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { env } from 'cloudflare:workers';
import { emailProviderConfigured } from '@/lib/email-provider';
import { getDb } from '@/db';
import {
  feedbackConversations,
  feedbackEvents,
  feedbackMessages,
  feedbackNotes,
  type FeedbackConversation,
  type FeedbackMessage,
  type FeedbackNote,
} from '@/db/feedback-schema';
import {
  feedbackId,
  feedbackPublicId,
  feedbackSubject,
  feedbackTokenHash,
  type FeedbackProfile,
  type FeedbackReport,
} from '@/lib/feedback-core';
import { randomToken } from '@/lib/staff-auth-core';
import type { StaffPrincipal } from '@/lib/staff-auth';
import { notifications } from '@/db/notifications-schema';
import { staffUsers } from '@/db/schema';

export type FeedbackThread = {
  conversation: FeedbackConversation;
  messages: FeedbackMessage[];
  hasOlderMessages: boolean;
};

export type FeedbackSummary = Pick<
  FeedbackConversation,
  | 'publicId'
  | 'subject'
  | 'kind'
  | 'severity'
  | 'status'
  | 'priority'
  | 'unreadForVisitor'
  | 'lastSender'
  | 'lastMessageAt'
  | 'createdAt'
  | 'updatedAt'
>;

export type FeedbackRealtimeEvent = {
  type: 'message' | 'status';
  conversation: string;
  messageId?: string;
  status?: string;
  at: string;
};

const MAX_TRANSCRIPT_MESSAGES = 200;

async function conversationForToken(token: string, publicId?: string) {
  const [conversation] = await getDb()
    .select()
    .from(feedbackConversations)
    .where(
      and(
        eq(
          feedbackConversations.visitorTokenHash,
          await feedbackTokenHash(token),
        ),
        publicId ? eq(feedbackConversations.publicId, publicId) : undefined,
      ),
    )
    .orderBy(desc(feedbackConversations.lastMessageAt))
    .limit(1);
  return conversation ?? null;
}

export async function visitorFeedbackConversations(
  token: string,
): Promise<FeedbackSummary[]> {
  return getDb()
    .select({
      publicId: feedbackConversations.publicId,
      subject: feedbackConversations.subject,
      kind: feedbackConversations.kind,
      severity: feedbackConversations.severity,
      status: feedbackConversations.status,
      priority: feedbackConversations.priority,
      unreadForVisitor: feedbackConversations.unreadForVisitor,
      lastSender: feedbackConversations.lastSender,
      lastMessageAt: feedbackConversations.lastMessageAt,
      createdAt: feedbackConversations.createdAt,
      updatedAt: feedbackConversations.updatedAt,
    })
    .from(feedbackConversations)
    .where(
      eq(
        feedbackConversations.visitorTokenHash,
        await feedbackTokenHash(token),
      ),
    )
    .orderBy(desc(feedbackConversations.lastMessageAt))
    .limit(25);
}

async function threadFor(
  conversation: FeedbackConversation,
): Promise<FeedbackThread> {
  const rows = await getDb()
    .select()
    .from(feedbackMessages)
    .where(eq(feedbackMessages.conversationId, conversation.id))
    .orderBy(desc(feedbackMessages.createdAt), sql`rowid DESC`)
    .limit(MAX_TRANSCRIPT_MESSAGES + 1);
  const selected = rows.slice(0, MAX_TRANSCRIPT_MESSAGES).reverse();
  return {
    conversation,
    messages: selected,
    hasOlderMessages: rows.length > MAX_TRANSCRIPT_MESSAGES,
  };
}

export async function visitorFeedbackThread(
  token: string,
  markRead = true,
  publicId?: string,
): Promise<FeedbackThread | null> {
  const conversation = await conversationForToken(token, publicId);
  if (!conversation) return null;
  const thread = await threadFor(conversation);
  if (markRead && conversation.unreadForVisitor > 0) {
    const cleared = await getDb()
      .update(feedbackConversations)
      .set({ unreadForVisitor: 0 })
      .where(
        and(
          eq(feedbackConversations.id, conversation.id),
          eq(feedbackConversations.updatedAt, conversation.updatedAt),
          eq(
            feedbackConversations.unreadForVisitor,
            conversation.unreadForVisitor,
          ),
        ),
      )
      .returning({ id: feedbackConversations.id });
    if (cleared.length)
      return {
        ...thread,
        conversation: { ...conversation, unreadForVisitor: 0 },
      };
    const latest = await conversationForToken(token, conversation.publicId);
    return latest ? threadFor(latest) : null;
  }
  return thread;
}

export async function recordVisitorFeedback(input: {
  token: string | null;
  conversationPublicId?: string | null;
  body: string;
  profile: FeedbackProfile;
  report?: FeedbackReport;
  sourcePath: string;
  now?: Date;
}): Promise<{
  thread: FeedbackThread;
  token: string;
  created: boolean;
  event: FeedbackRealtimeEvent;
}> {
  const now = input.now ?? new Date();
  const existing =
    input.token && input.conversationPublicId
      ? await conversationForToken(input.token, input.conversationPublicId)
      : null;
  if (input.conversationPublicId && !existing)
    throw new Error('Feedback conversation is not owned by this visitor');
  const token = input.token ?? randomToken();
  const conversationId = existing?.id ?? feedbackId('fbc');
  const publicId = existing?.publicId ?? feedbackPublicId(now);
  const messageId = feedbackId('fbm');
  const body = input.body;
  const report = input.report ?? {
    kind: 'comment',
    severity: 'suggestion',
    title: null,
    expectedBehavior: null,
    browserContext: null,
  };
  const db = getDb();

  if (!existing) {
    await db.batch([
      db.insert(feedbackConversations).values({
        id: conversationId,
        publicId,
        visitorTokenHash: await feedbackTokenHash(token),
        visitorName: input.profile.name,
        visitorEmail: input.profile.email,
        subject: report.title ?? feedbackSubject(body),
        kind: report.kind,
        severity: report.severity,
        expectedBehavior: report.expectedBehavior,
        browserContext: report.browserContext,
        status: 'new',
        sourcePath: input.sourcePath,
        unreadForStaff: 1,
        lastSender: 'visitor',
        lastMessageAt: now,
        createdAt: now,
        updatedAt: now,
      }),
      db.insert(feedbackMessages).values({
        id: messageId,
        conversationId,
        sender: 'visitor',
        body,
        reportTitle: report.title,
        reportKind: report.kind,
        reportSeverity: report.severity,
        expectedBehavior: report.expectedBehavior,
        browserContext: report.browserContext,
        sourcePath: input.sourcePath,
        createdAt: now,
      }),
      db.insert(feedbackEvents).values({
        id: feedbackId('fbe'),
        conversationId,
        action: 'created',
        actor: 'visitor',
        detail: `Started from ${input.sourcePath}`,
        createdAt: now,
      }),
    ]);
  } else {
    const status = existing.status === 'closed' ? 'open' : existing.status;
    await db.batch([
      db.insert(feedbackMessages).values({
        id: messageId,
        conversationId,
        sender: 'visitor',
        body,
        reportTitle: report.title,
        reportKind: report.kind,
        reportSeverity: report.severity,
        expectedBehavior: report.expectedBehavior,
        browserContext: report.browserContext,
        sourcePath: input.sourcePath,
        createdAt: now,
      }),
      db
        .update(feedbackConversations)
        .set({
          visitorName: input.profile.name ?? existing.visitorName,
          visitorEmail: input.profile.email ?? existing.visitorEmail,
          subject: report.title ?? existing.subject,
          kind: report.kind,
          severity: report.severity,
          expectedBehavior:
            report.expectedBehavior ?? existing.expectedBehavior,
          browserContext: report.browserContext ?? existing.browserContext,
          status,
          sourcePath: input.sourcePath,
          unreadForStaff: sql`${feedbackConversations.unreadForStaff} + 1`,
          unreadForVisitor: 0,
          lastSender: 'visitor',
          lastMessageAt: now,
          updatedAt: now,
        })
        .where(eq(feedbackConversations.id, conversationId)),
      ...(existing.status === 'closed'
        ? [
            db.insert(feedbackEvents).values({
              id: feedbackId('fbe'),
              conversationId,
              action: 'reopened',
              actor: 'visitor',
              detail: 'A new visitor message reopened the conversation.',
              createdAt: now,
            }),
          ]
        : []),
    ]);
  }
  const conversation = await conversationForToken(token, publicId);
  if (!conversation) throw new Error('Feedback conversation was not persisted');
  return {
    thread: await threadFor(conversation),
    token,
    created: !existing,
    event: {
      type: 'message',
      conversation: publicId,
      messageId,
      at: now.toISOString(),
    },
  };
}

export async function feedbackConversation(
  publicId: string,
  markRead = false,
): Promise<FeedbackThread | null> {
  const [conversation] = await getDb()
    .select()
    .from(feedbackConversations)
    .where(eq(feedbackConversations.publicId, publicId))
    .limit(1);
  if (!conversation) return null;
  const thread = await threadFor(conversation);
  if (markRead && conversation.unreadForStaff > 0) {
    await getDb()
      .update(feedbackConversations)
      .set({ unreadForStaff: 0 })
      .where(
        and(
          eq(feedbackConversations.id, conversation.id),
          eq(feedbackConversations.updatedAt, conversation.updatedAt),
          eq(feedbackConversations.unreadForStaff, conversation.unreadForStaff),
        ),
      );
  }
  return thread;
}

export async function recordStaffFeedback(
  publicId: string,
  body: string,
  staff: StaffPrincipal,
  now = new Date(),
): Promise<{ message: FeedbackMessage; event: FeedbackRealtimeEvent } | null> {
  const [conversation] = await getDb()
    .select()
    .from(feedbackConversations)
    .where(eq(feedbackConversations.publicId, publicId))
    .limit(1);
  if (!conversation) return null;
  const messageId = feedbackId('fbm');
  await getDb().batch([
    getDb().insert(feedbackMessages).values({
      id: messageId,
      conversationId: conversation.id,
      sender: 'staff',
      body,
      staffId: staff.id,
      staffName: staff.name,
      createdAt: now,
    }),
    getDb()
      .update(feedbackConversations)
      .set({
        status: 'waiting_customer',
        assignedTo: staff.id,
        unreadForStaff: 0,
        unreadForVisitor: sql`${feedbackConversations.unreadForVisitor} + 1`,
        lastSender: 'staff',
        lastMessageAt: now,
        updatedAt: now,
      })
      .where(eq(feedbackConversations.id, conversation.id)),
    getDb()
      .insert(feedbackEvents)
      .values({
        id: feedbackId('fbe'),
        conversationId: conversation.id,
        action: 'staff_reply',
        actor: `${staff.name} (${staff.id})`,
        createdAt: now,
      }),
  ]);
  if (conversation.visitorEmail && emailProviderConfigured()) {
    await getDb()
      .insert(notifications)
      .values({
        id: crypto.randomUUID(),
        orderNumber: publicId,
        category: 'feedback',
        actionPath: conversation.sourcePath,
        recipient: conversation.visitorEmail,
        subject: `Reply to website feedback ${publicId}`,
        body: `${staff.name} replied:\n\n${body}`,
        status: 'pending',
        nextAttemptAt: now,
        createdAt: now,
      });
  }
  const [message] = await getDb()
    .select()
    .from(feedbackMessages)
    .where(eq(feedbackMessages.id, messageId))
    .limit(1);
  if (!message) throw new Error('Staff feedback reply was not persisted');
  return {
    message,
    event: {
      type: 'message',
      conversation: publicId,
      messageId,
      at: now.toISOString(),
    },
  };
}

export async function setFeedbackStatus(
  publicId: string,
  status:
    | 'new'
    | 'open'
    | 'waiting_customer'
    | 'closed',
  staff: StaffPrincipal,
  now = new Date(),
): Promise<FeedbackRealtimeEvent | null> {
  const [conversation] = await getDb()
    .update(feedbackConversations)
    .set({ status, assignedTo: staff.id, updatedAt: now })
    .where(eq(feedbackConversations.publicId, publicId))
    .returning({ id: feedbackConversations.id });
  if (!conversation) return null;
  await getDb()
    .insert(feedbackEvents)
    .values({
      id: feedbackId('fbe'),
      conversationId: conversation.id,
      action: status,
      actor: `${staff.name} (${staff.id})`,
      createdAt: now,
    });
  return {
    type: 'status',
    conversation: publicId,
    status,
    at: now.toISOString(),
  };
}

export async function feedbackNotesFor(
  publicId: string,
): Promise<FeedbackNote[]> {
  return getDb()
    .select()
    .from(feedbackNotes)
    .where(
      sql`${feedbackNotes.conversationId} = (SELECT id FROM feedback_conversations WHERE public_id = ${publicId} LIMIT 1)`,
    )
    .orderBy(asc(feedbackNotes.createdAt), asc(feedbackNotes.id))
    .limit(200);
}

export async function recordFeedbackNote(
  publicId: string,
  body: string,
  staff: StaffPrincipal,
  now = new Date(),
): Promise<boolean> {
  const [conversation] = await getDb()
    .select({ id: feedbackConversations.id })
    .from(feedbackConversations)
    .where(eq(feedbackConversations.publicId, publicId))
    .limit(1);
  if (!conversation) return false;
  await getDb().batch([
    getDb()
      .insert(feedbackNotes)
      .values({
        id: feedbackId('fbn'),
        conversationId: conversation.id,
        staffId: staff.id,
        staffName: staff.name,
        body,
        createdAt: now,
      }),
    getDb()
      .insert(feedbackEvents)
      .values({
        id: feedbackId('fbe'),
        conversationId: conversation.id,
        action: 'internal_note',
        actor: `${staff.name} (${staff.id})`,
        detail: body.slice(0, 200),
        createdAt: now,
      }),
  ]);
  return true;
}

export async function updateFeedbackWorkflow(
  publicId: string,
  input: {
    priority?: 'urgent' | 'high' | 'normal' | 'low';
    labels?: string[];
    issueUrl?: string | null;
    resolutionSummary?: string | null;
  },
  staff: StaffPrincipal,
  now = new Date(),
): Promise<boolean> {
  const labels = input.labels
    ?.map((label) => label.trim().toLowerCase())
    .filter((label) => /^[a-z0-9][a-z0-9 -]{0,29}$/.test(label))
    .slice(0, 10);
  const issueUrl = input.issueUrl?.trim() || null;
  if (issueUrl && (!issueUrl.startsWith('https://') || issueUrl.length > 500))
    return false;
  const resolutionSummary = input.resolutionSummary?.trim() || null;
  if (resolutionSummary && resolutionSummary.length > 1000) return false;
  const [updated] = await getDb()
    .update(feedbackConversations)
    .set({
      ...(input.priority ? { priority: input.priority } : {}),
      ...(labels ? { labels: JSON.stringify(labels) } : {}),
      ...(input.issueUrl !== undefined ? { issueUrl } : {}),
      ...(input.resolutionSummary !== undefined ? { resolutionSummary } : {}),
      assignedTo: staff.id,
      updatedAt: now,
    })
    .where(eq(feedbackConversations.publicId, publicId))
    .returning({ id: feedbackConversations.id });
  if (!updated) return false;
  await getDb()
    .insert(feedbackEvents)
    .values({
      id: feedbackId('fbe'),
      conversationId: updated.id,
      action: 'workflow_updated',
      actor: `${staff.name} (${staff.id})`,
      detail: JSON.stringify({
        priority: input.priority,
        labels,
        issueUrl: issueUrl ? '[linked]' : undefined,
        resolutionSummary: resolutionSummary ? '[recorded]' : undefined,
      }),
      createdAt: now,
    });
  return true;
}

export async function listFeedbackConversations(
  input: {
    status?: string;
    kind?: string;
    query?: string;
    limit?: number;
  } = {},
) {
  const status = [
    'new',
    'open',
    'waiting_customer',
    'closed',
  ].includes(input.status ?? '')
    ? input.status!
    : null;
  const query = input.query?.trim().toLowerCase().slice(0, 100) ?? '';
  const kind = ['bug', 'improvement', 'comment'].includes(input.kind ?? '')
    ? input.kind!
    : null;
  const where = and(
    status ? eq(feedbackConversations.status, status) : undefined,
    kind ? eq(feedbackConversations.kind, kind) : undefined,
    query
      ? sql`(
          instr(lower(${feedbackConversations.publicId}), ${query}) > 0 OR
          instr(lower(COALESCE(${feedbackConversations.visitorName}, '')), ${query}) > 0 OR
          instr(lower(COALESCE(${feedbackConversations.visitorEmail}, '')), ${query}) > 0 OR
          instr(lower(COALESCE(${feedbackConversations.subject}, '')), ${query}) > 0
        )`
      : undefined,
  );
  return getDb()
    .select()
    .from(feedbackConversations)
    .where(where)
    .orderBy(
      desc(feedbackConversations.lastMessageAt),
      desc(feedbackConversations.id),
    )
    .limit(Math.max(1, Math.min(100, input.limit ?? 100)));
}

export async function feedbackCounts() {
  const rows = await getDb()
    .select({
      status: feedbackConversations.status,
      count: sql<number>`count(*)`.mapWith(Number),
    })
    .from(feedbackConversations)
    .groupBy(feedbackConversations.status);
  const unread = await getDb()
    .select({
      count:
        sql<number>`COALESCE(sum(${feedbackConversations.unreadForStaff}), 0)`.mapWith(
          Number,
        ),
    })
    .from(feedbackConversations);
  return {
    ...Object.fromEntries(rows.map((row) => [row.status, row.count])),
    unread: unread[0]?.count ?? 0,
  };
}

export async function feedbackArchive(input: {
  status?: string;
  kind?: string;
  query?: string;
  conversation?: string;
  limit?: number;
}) {
  const conversations = input.conversation
    ? await getDb()
        .select()
        .from(feedbackConversations)
        .where(eq(feedbackConversations.publicId, input.conversation))
        .limit(1)
    : await listFeedbackConversations({
        status: input.status,
        kind: input.kind,
        query: input.query,
        limit: Math.min(50, input.limit ?? 25),
      });
  if (!conversations.length) return [];
  const messages = await getDb()
    .select()
    .from(feedbackMessages)
    .where(
      sql`${feedbackMessages.conversationId} IN (SELECT value FROM json_each(${JSON.stringify(
        conversations.map((conversation) => conversation.id),
      )}))`,
    )
    .orderBy(asc(feedbackMessages.createdAt), sql`rowid ASC`)
    .limit(5000);
  const byConversation = new Map<string, FeedbackMessage[]>();
  for (const message of messages) {
    const list = byConversation.get(message.conversationId) ?? [];
    list.push(message);
    byConversation.set(message.conversationId, list);
  }
  return conversations.map((conversation) => ({
    id: conversation.publicId,
    status: conversation.status,
    subject: conversation.subject,
    kind: conversation.kind,
    severity: conversation.severity,
    priority: conversation.priority,
    labels: JSON.parse(conversation.labels) as string[],
    resolutionSummary: conversation.resolutionSummary,
    issueUrl: conversation.issueUrl,
    expectedBehavior: conversation.expectedBehavior,
    browserContext: conversation.browserContext
      ? JSON.parse(conversation.browserContext)
      : null,
    visitor: {
      name: conversation.visitorName,
      email: conversation.visitorEmail,
    },
    sourcePath: conversation.sourcePath,
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
    messages: (byConversation.get(conversation.id) ?? []).map((message) => ({
      id: message.id,
      sender: message.sender,
      body: message.body,
      reportTitle: message.reportTitle,
      kind: message.reportKind,
      severity: message.reportSeverity,
      expectedBehavior: message.expectedBehavior,
      browserContext: message.browserContext
        ? JSON.parse(message.browserContext)
        : null,
      staffName: message.staffName,
      sourcePath: message.sourcePath,
      createdAt: message.createdAt.toISOString(),
    })),
  }));
}

export async function publishFeedback(
  event: FeedbackRealtimeEvent,
): Promise<void> {
  try {
    await env.FEEDBACK_ROOMS.getByName(event.conversation).publish(event);
  } catch (error) {
    // Persistence already succeeded. A missed live signal is recovered by the
    // client's transcript refresh/polling rather than duplicating the message.
    console.error(
      '[feedback] real-time publish failed',
      error instanceof Error ? error.message : error,
    );
  }
}

/** Email alerts are durable when a provider is configured; the manager-wide
 * unread badge remains the no-credential fallback. */
export async function queueFeedbackStaffAlerts(
  publicId: string,
  subject: string,
  body: string,
): Promise<number> {
  if (!emailProviderConfigured()) return 0;
  const recipients = await getDb()
    .select({ email: staffUsers.email })
    .from(staffUsers)
    .where(
      and(
        eq(staffUsers.active, true),
        inArray(staffUsers.role, ['admin', 'ops']),
      ),
    );
  if (!recipients.length) return 0;
  const now = new Date();
  await getDb()
    .insert(notifications)
    .values(
      recipients.map(({ email }) => ({
        id: crypto.randomUUID(),
        orderNumber: publicId,
        category: 'feedback',
        actionPath: `/manage/feedback/${encodeURIComponent(publicId)}`,
        recipient: email,
        subject: `Website feedback ${publicId}: ${subject}`.slice(0, 240),
        body: body.slice(0, 2000),
        status: 'pending',
        nextAttemptAt: now,
        createdAt: now,
      })),
    );
  return recipients.length;
}
