import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localD1 } from './helpers/local-d1';

const publish = vi.fn();
const { env } = vi.hoisted(() => ({ env: {} as Record<string, unknown> }));
vi.mock('cloudflare:workers', () => ({ env }));

import {
  feedbackArchive,
  feedbackConversation,
  feedbackCounts,
  feedbackNotesFor,
  listFeedbackConversations,
  publishFeedback,
  recordFeedbackNote,
  recordStaffFeedback,
  recordVisitorFeedback,
  setFeedbackStatus,
  updateFeedbackWorkflow,
  visitorFeedbackConversations,
  visitorFeedbackThread,
} from '@/lib/feedback';
import type { StaffPrincipal } from '@/lib/staff-auth';

let local: ReturnType<typeof localD1>;
const staff: StaffPrincipal = {
  id: 'staff1',
  email: 'ops@example.org',
  name: 'Operations',
  role: 'ops',
  sessionId: 'session1',
  mustChangePassword: false,
};

beforeEach(() => {
  local = localD1();
  publish.mockReset().mockResolvedValue(1);
  Object.assign(env, {
    DB: local.binding,
    FEEDBACK_ROOMS: { getByName: () => ({ publish }) },
  });
});

afterEach(() => {
  local.sqlite.close();
  for (const key of Object.keys(env)) delete env[key];
});

describe('durable feedback transcript', () => {
  it('creates an anonymous conversation without an account or verification and appends every message', async () => {
    const first = await recordVisitorFeedback({
      token: null,
      body: 'The checkout total was clear.',
      profile: { name: null, email: null },
      sourcePath: '/account/cart',
      now: new Date('2026-09-05T12:00:00Z'),
    });
    expect(first.created).toBe(true);
    expect(first.thread.conversation.status).toBe('new');
    expect(first.thread.conversation.unreadForStaff).toBe(1);
    expect(first.thread.messages.map((message) => message.body)).toEqual([
      'The checkout total was clear.',
    ]);
    expect(first.token).toMatch(/^[a-f0-9]{64}$/);

    const second = await recordVisitorFeedback({
      token: first.token,
      conversationPublicId: first.thread.conversation.publicId,
      body: 'I also found the delivery choices.',
      profile: { name: 'Test Visitor', email: 'visitor@example.org' },
      sourcePath: '/account/cart',
      now: new Date('2026-09-05T12:01:00Z'),
    });
    expect(second.created).toBe(false);
    expect(second.thread.messages).toHaveLength(2);
    expect(second.thread.conversation.unreadForStaff).toBe(2);
    expect(await visitorFeedbackThread(first.token)).not.toBeNull();
    expect(
      local.sqlite
        .prepare('SELECT count(*) AS n FROM feedback_conversations')
        .get()!.n,
    ).toBe(1);
    expect(
      local.sqlite.prepare('SELECT count(*) AS n FROM feedback_messages').get()!
        .n,
    ).toBe(2);
    const separate = await recordVisitorFeedback({
      token: first.token,
      body: 'This belongs in a different report.',
      profile: { name: null, email: null },
      sourcePath: '/catalog',
    });
    expect(separate.created).toBe(true);
    expect(
      local.sqlite
        .prepare('SELECT count(*) AS n FROM feedback_conversations')
        .get()!.n,
    ).toBe(2);
    expect(await visitorFeedbackConversations(first.token)).toHaveLength(2);
  });

  it('records staff-only notes and structured triage without exposing them as visitor messages', async () => {
    const saved = await recordVisitorFeedback({
      token: null,
      body: 'The cart button is difficult to find.',
      profile: { name: null, email: null },
      sourcePath: '/catalog#packs',
    });
    const publicId = saved.thread.conversation.publicId;
    expect(
      await updateFeedbackWorkflow(
        publicId,
        {
          priority: 'high',
          labels: ['Checkout', 'mobile'],
          issueUrl: 'https://example.org/issues/42',
          resolutionSummary: 'Move the action above the fold.',
        },
        staff,
      ),
    ).toBe(true);
    expect(
      await recordFeedbackNote(publicId, 'Reproduced at 390px.', staff),
    ).toBe(true);
    expect(await feedbackNotesFor(publicId)).toHaveLength(1);
    const thread = await feedbackConversation(publicId);
    expect(thread?.conversation.priority).toBe('high');
    expect(JSON.parse(thread!.conversation.labels)).toEqual([
      'checkout',
      'mobile',
    ]);
    expect(thread?.messages).toHaveLength(1);
  });

  it('records attributed staff replies, visitor unread state, closing and visitor reopening', async () => {
    const first = await recordVisitorFeedback({
      token: null,
      body: 'Where can I find the lot document?',
      profile: { name: 'Test Visitor', email: null },
      sourcePath: '/documentation',
    });
    const publicId = first.thread.conversation.publicId;
    const reply = await recordStaffFeedback(
      publicId,
      'Use the lot lookup page.',
      staff,
    );
    expect(reply?.message.staffName).toBe('Operations');
    let thread = await feedbackConversation(publicId);
    expect(thread?.conversation.status).toBe('waiting_customer');
    expect(thread?.conversation.unreadForVisitor).toBe(1);
    expect(thread?.messages.map((message) => message.sender)).toEqual([
      'visitor',
      'staff',
    ]);
    expect(
      (await visitorFeedbackThread(first.token, false))?.conversation
        .unreadForVisitor,
    ).toBe(1);
    expect(
      (await visitorFeedbackThread(first.token))?.conversation.unreadForVisitor,
    ).toBe(0);

    expect(await setFeedbackStatus(publicId, 'closed', staff)).toMatchObject({
      status: 'closed',
    });
    const reopened = await recordVisitorFeedback({
      token: first.token,
      conversationPublicId: publicId,
      body: 'Found it, but the link label could be clearer.',
      profile: { name: null, email: null },
      sourcePath: '/documentation/lot-lookup',
    });
    expect(reopened.thread.conversation.status).toBe('open');
    expect(reopened.thread.conversation.unreadForVisitor).toBe(0);
    expect(
      local.sqlite
        .prepare(
          "SELECT count(*) AS n FROM feedback_events WHERE action='reopened'",
        )
        .get()!.n,
    ).toBe(1);
  });

  it('supports bounded staff search and a structured ChatGPT archive marked as untrusted data', async () => {
    const saved = await recordVisitorFeedback({
      token: null,
      body: 'The UPS option was easy to compare.',
      profile: { name: 'Shipping Tester', email: 'shipping@example.org' },
      sourcePath: '/account/cart',
      report: {
        kind: 'improvement',
        severity: 'suggestion',
        title: 'Shipping comparison',
        expectedBehavior: null,
        browserContext: JSON.stringify({
          userAgent: 'Synthetic Browser',
          annotation: {
            kind: 'element',
            selector: '#shipping-options',
            label: 'Shipping options',
          },
        }),
      },
    });
    expect(
      await listFeedbackConversations({ query: 'shipping tester' }),
    ).toHaveLength(1);
    expect((await feedbackCounts()).unread).toBe(1);
    const archive = await feedbackArchive({
      conversation: saved.thread.conversation.publicId,
    });
    expect(archive).toHaveLength(1);
    expect(archive[0].visitor.email).toBe('shipping@example.org');
    expect(archive[0].kind).toBe('improvement');
    expect(archive[0].browserContext).toEqual({
      userAgent: 'Synthetic Browser',
      annotation: {
        kind: 'element',
        selector: '#shipping-options',
        label: 'Shipping options',
      },
    });
    expect(archive[0].messages[0].browserContext.annotation.selector).toBe(
      '#shipping-options',
    );
    expect(archive[0].messages[0].body).toContain('UPS');
  });

  it('broadcasts only after persistence and treats socket delivery as recoverable', async () => {
    const saved = await recordVisitorFeedback({
      token: null,
      body: 'Saved first.',
      profile: { name: null, email: null },
      sourcePath: '/',
    });
    await publishFeedback(saved.event);
    expect(publish).toHaveBeenCalledWith(saved.event);
    publish.mockRejectedValueOnce(new Error('socket unavailable'));
    await expect(publishFeedback(saved.event)).resolves.toBeUndefined();
    expect(
      local.sqlite.prepare('SELECT count(*) AS n FROM feedback_messages').get()!
        .n,
    ).toBe(1);
  });
});
