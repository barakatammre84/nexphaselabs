import { allow, rateLimitKey } from '@/lib/rate-limit';
import { normalizeFeedbackMessage } from '@/lib/feedback-core';
import {
  publishFeedback,
  recordFeedbackNote,
  recordStaffFeedback,
  setFeedbackStatus,
  updateFeedbackWorkflow,
} from '@/lib/feedback';
import {
  canHandleFeedback,
  getStaffFromRequest,
  sameOrigin,
} from '@/lib/staff-auth';

const PUBLIC_ID = /^FB-\d{6}-[A-F0-9]{8}$/;
const reply = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  });

export async function POST(
  request: Request,
  context: { params: Promise<{ publicId: string }> },
) {
  if (!sameOrigin(request)) return reply({ error: 'Forbidden' }, 403);
  const staff = await getStaffFromRequest(request);
  if (!staff) return reply({ error: 'Unauthorized' }, 401);
  if (!canHandleFeedback(staff)) return reply({ error: 'Forbidden' }, 403);
  if (!(await allow(rateLimitKey('staff-feedback', staff.id), 120, 3600)))
    return reply({ error: 'Reply limit reached. Try again later.' }, 429);
  const { publicId } = await context.params;
  if (!PUBLIC_ID.test(publicId))
    return reply({ error: 'Conversation not found.' }, 404);
  let input: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > 8_000)
      return reply({ error: 'The request is too large.' }, 413);
    input = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return reply({ error: 'The request could not be read.' }, 400);
  }
  if (input.action === 'reply') {
    const body = normalizeFeedbackMessage(input.message);
    if (!body)
      return reply(
        { error: 'Write a reply between 1 and 2,000 characters.' },
        422,
      );
    const saved = await recordStaffFeedback(publicId, body, staff);
    if (!saved) return reply({ error: 'Conversation not found.' }, 404);
    await publishFeedback(saved.event);
    return reply({ ok: true, messageId: saved.message.id });
  }
  const statuses = [
    'new',
    'open',
    'waiting_customer',
    'closed',
  ] as const;
  if (input.action === 'status' && statuses.includes(input.status as never)) {
    const event = await setFeedbackStatus(
      publicId,
      input.status as (typeof statuses)[number],
      staff,
    );
    if (!event) return reply({ error: 'Conversation not found.' }, 404);
    await publishFeedback(event);
    return reply({ ok: true, status: input.status });
  }
  if (input.action === 'note') {
    const body = normalizeFeedbackMessage(input.message);
    if (!body)
      return reply(
        { error: 'Write a note between 1 and 2,000 characters.' },
        422,
      );
    if (!(await recordFeedbackNote(publicId, body, staff)))
      return reply({ error: 'Conversation not found.' }, 404);
    return reply({ ok: true });
  }
  if (input.action === 'workflow') {
    const priority = ['urgent', 'high', 'normal', 'low'].includes(
      String(input.priority),
    )
      ? (input.priority as 'urgent' | 'high' | 'normal' | 'low')
      : undefined;
    const labels = Array.isArray(input.labels)
      ? input.labels.filter(
          (label): label is string => typeof label === 'string',
        )
      : undefined;
    const saved = await updateFeedbackWorkflow(
      publicId,
      {
        priority,
        labels,
        issueUrl:
          typeof input.issueUrl === 'string' ? input.issueUrl : undefined,
        resolutionSummary:
          typeof input.resolutionSummary === 'string'
            ? input.resolutionSummary
            : undefined,
      },
      staff,
    );
    return saved
      ? reply({ ok: true })
      : reply({ error: 'Check the workflow details.' }, 422);
  }
  return reply({ error: 'Unsupported action.' }, 422);
}
