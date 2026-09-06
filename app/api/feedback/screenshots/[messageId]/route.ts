import { and, eq } from 'drizzle-orm';
import { env } from 'cloudflare:workers';
import { getDb } from '@/db';
import { feedbackConversations, feedbackMessages } from '@/db/feedback-schema';
import { feedbackToken, feedbackTokenHash } from '@/lib/feedback-core';
import { canHandleFeedback, getStaffFromRequest } from '@/lib/staff-auth';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ messageId: string }> },
) {
  const { messageId } = await params;
  if (!/^fbm_[a-f0-9]{32}$/.test(messageId))
    return new Response('Not found', { status: 404 });
  const token = feedbackToken(request);
  const staff = await getStaffFromRequest(request);
  const tokenHash = token ? await feedbackTokenHash(token) : null;
  const [record] = await getDb()
    .select({
      key: feedbackMessages.screenshotKey,
      mime: feedbackMessages.screenshotMime,
      owner: feedbackConversations.visitorTokenHash,
    })
    .from(feedbackMessages)
    .innerJoin(
      feedbackConversations,
      eq(feedbackMessages.conversationId, feedbackConversations.id),
    )
    .where(
      and(
        eq(feedbackMessages.id, messageId),
        eq(feedbackMessages.sender, 'visitor'),
      ),
    )
    .limit(1);
  if (
    !record?.key ||
    !(
      (tokenHash && tokenHash === record.owner) ||
      (staff && canHandleFeedback(staff))
    )
  )
    return new Response('Not found', { status: 404 });
  const object = await env.DOCS.get(record.key);
  if (!object) return new Response('Not found', { status: 404 });
  return new Response(object.body, {
    headers: {
      'Content-Type': record.mime || 'application/octet-stream',
      'Content-Length': String(object.size),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  });
}
