import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sameOrigin: vi.fn(),
  getStaff: vi.fn(),
  canHandle: vi.fn(),
  allow: vi.fn(),
  reply: vi.fn(),
  status: vi.fn(),
  publish: vi.fn(),
  note: vi.fn(),
  workflow: vi.fn(),
}));
vi.mock('@/lib/staff-auth', () => ({
  sameOrigin: mocks.sameOrigin,
  getStaffFromRequest: mocks.getStaff,
  canHandleFeedback: mocks.canHandle,
}));
vi.mock('@/lib/rate-limit', () => ({
  allow: mocks.allow,
  rateLimitKey: (scope: string, id: string) => `${scope}:${id}`,
}));
vi.mock('@/lib/feedback', () => ({
  recordStaffFeedback: mocks.reply,
  setFeedbackStatus: mocks.status,
  recordFeedbackNote: mocks.note,
  updateFeedbackWorkflow: mocks.workflow,
  publishFeedback: mocks.publish,
}));

import { POST } from '@/app/api/manage/feedback/[publicId]/route';

const staff = {
  id: 'staff1',
  name: 'Operations',
  email: 'ops@example.org',
  role: 'ops',
  sessionId: 'session1',
  mustChangePassword: false,
};
const request = (body: Record<string, unknown>) =>
  new Request(
    'https://test.example.org/api/manage/feedback/FB-260905-ABCDEF12',
    {
      method: 'POST',
      headers: {
        host: 'test.example.org',
        origin: 'https://test.example.org',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  );
const context = { params: Promise.resolve({ publicId: 'FB-260905-ABCDEF12' }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sameOrigin.mockReturnValue(true);
  mocks.getStaff.mockResolvedValue(staff);
  mocks.canHandle.mockReturnValue(true);
  mocks.allow.mockResolvedValue(true);
  mocks.reply.mockResolvedValue({
    message: { id: 'message1' },
    event: { type: 'message', conversation: 'FB-260905-ABCDEF12' },
  });
  mocks.status.mockResolvedValue({
    type: 'status',
    conversation: 'FB-260905-ABCDEF12',
    status: 'closed',
  });
  mocks.publish.mockResolvedValue(undefined);
  mocks.note.mockResolvedValue(true);
  mocks.workflow.mockResolvedValue(true);
});

describe('staff feedback route', () => {
  it('requires same-origin, authenticated operations access', async () => {
    mocks.sameOrigin.mockReturnValue(false);
    expect(
      (await POST(request({ action: 'reply', message: 'Reply' }), context))
        .status,
    ).toBe(403);
    mocks.sameOrigin.mockReturnValue(true);
    mocks.getStaff.mockResolvedValue(null);
    expect(
      (await POST(request({ action: 'reply', message: 'Reply' }), context))
        .status,
    ).toBe(401);
    mocks.getStaff.mockResolvedValue(staff);
    mocks.canHandle.mockReturnValue(false);
    expect(
      (await POST(request({ action: 'reply', message: 'Reply' }), context))
        .status,
    ).toBe(403);
  });

  it('persists a reply before announcing it to live clients', async () => {
    const response = await POST(
      request({ action: 'reply', message: '  Recorded reply  ' }),
      context,
    );
    expect(response.status).toBe(200);
    expect(mocks.reply).toHaveBeenCalledWith(
      'FB-260905-ABCDEF12',
      'Recorded reply',
      staff,
    );
    expect(mocks.reply.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.publish.mock.invocationCallOrder[0],
    );
  });

  it('records bounded status transitions and rejects unsupported actions', async () => {
    expect(
      (await POST(request({ action: 'status', status: 'closed' }), context))
        .status,
    ).toBe(200);
    expect(mocks.status).toHaveBeenCalledWith(
      'FB-260905-ABCDEF12',
      'closed',
      staff,
    );
    expect(
      (await POST(request({ action: 'status', status: 'deleted' }), context))
        .status,
    ).toBe(422);
  });

  it('records private notes and structured developer triage', async () => {
    expect(
      (
        await POST(
          request({ action: 'note', message: 'Reproduced on mobile.' }),
          context,
        )
      ).status,
    ).toBe(200);
    expect(mocks.note).toHaveBeenCalledWith(
      'FB-260905-ABCDEF12',
      'Reproduced on mobile.',
      staff,
    );
    expect(
      (
        await POST(
          request({
            action: 'workflow',
            priority: 'high',
            labels: ['checkout'],
            issueUrl: 'https://example.org/issues/42',
          }),
          context,
        )
      ).status,
    ).toBe(200);
    expect(mocks.workflow).toHaveBeenCalled();
  });
});
