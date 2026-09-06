import { canHandleFeedback, getStaffFromRequest } from '@/lib/staff-auth';
import { feedbackConversation } from '@/lib/feedback';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ publicId: string }> },
) {
  const staff = await getStaffFromRequest(request);
  if (!staff || !canHandleFeedback(staff))
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { publicId } = await params;
  if (!/^FB-\d{6}-[A-F0-9]{8}$/.test(publicId))
    return Response.json({ error: 'Not found' }, { status: 404 });
  const thread = await feedbackConversation(publicId);
  if (!thread) return Response.json({ error: 'Not found' }, { status: 404 });
  const contexts = [...thread.messages]
    .reverse()
    .map((message) => message.browserContext)
    .filter(Boolean);
  for (const value of contexts) {
    try {
      const context = JSON.parse(value!) as {
        annotation?: { selector?: string };
        annotations?: Array<{ selector?: string }>;
      };
      const selectors = (
        context.annotations?.length
          ? context.annotations
          : context.annotation
            ? [context.annotation]
            : []
      )
        .map((annotation) => annotation.selector)
        .filter((selector): selector is string => Boolean(selector));
      if (selectors.length)
        return Response.json(
          { selectors: selectors.slice(0, 5) },
          { headers: { 'Cache-Control': 'private, no-store' } },
        );
    } catch {
      // Continue to an earlier valid message context.
    }
  }
  return Response.json({ selectors: [] });
}
