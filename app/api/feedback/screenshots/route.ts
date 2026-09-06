import { and, eq } from 'drizzle-orm';
import { env } from 'cloudflare:workers';
import { getDb } from '@/db';
import { feedbackConversations, feedbackMessages } from '@/db/feedback-schema';
import {
  feedbackSameOrigin,
  feedbackToken,
  feedbackTokenHash,
} from '@/lib/feedback-core';
import { allow, clientAddress, rateLimitKey } from '@/lib/rate-limit';

const TYPES = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/webp', 'webp'],
]);
const MAX_BYTES = 2 * 1024 * 1024;

export async function POST(request: Request) {
  if (!feedbackSameOrigin(request))
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  const token = feedbackToken(request);
  if (!token)
    return Response.json({ error: 'No feedback session.' }, { status: 401 });
  if (
    !(await allow(
      rateLimitKey('feedback-screenshot', clientAddress(request)),
      12,
      3600,
    ))
  )
    return Response.json(
      { error: 'Screenshot limit reached.' },
      { status: 429 },
    );
  const data = await request.formData();
  const conversation = String(data.get('conversation') ?? '');
  const messageId = String(data.get('message') ?? '');
  const file = data.get('screenshot');
  if (
    !/^FB-\d{6}-[A-F0-9]{8}$/.test(conversation) ||
    !/^fbm_[a-f0-9]{32}$/.test(messageId) ||
    !(file instanceof File) ||
    data.get('consent') !== 'true'
  )
    return Response.json(
      { error: 'Check the screenshot details.' },
      { status: 422 },
    );
  const extension = TYPES.get(file.type);
  if (!extension || file.size < 1 || file.size > MAX_BYTES)
    return Response.json(
      { error: 'Use a PNG, JPEG, or WebP image no larger than 2 MB.' },
      { status: 422 },
    );
  const tokenHash = await feedbackTokenHash(token);
  const [owned] = await getDb()
    .select({ id: feedbackMessages.id })
    .from(feedbackMessages)
    .innerJoin(
      feedbackConversations,
      eq(feedbackMessages.conversationId, feedbackConversations.id),
    )
    .where(
      and(
        eq(feedbackMessages.id, messageId),
        eq(feedbackMessages.sender, 'visitor'),
        eq(feedbackConversations.publicId, conversation),
        eq(feedbackConversations.visitorTokenHash, tokenHash),
      ),
    )
    .limit(1);
  if (!owned)
    return Response.json({ error: 'Report not found.' }, { status: 404 });
  const key = `feedback/${conversation}/${messageId}.${extension}`;
  await env.DOCS.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type },
    customMetadata: { conversation, messageId },
  });
  await getDb()
    .update(feedbackMessages)
    .set({
      screenshotKey: key,
      screenshotMime: file.type,
      screenshotSize: file.size,
    })
    .where(eq(feedbackMessages.id, messageId));
  return Response.json({
    ok: true,
    screenshot: `/api/feedback/screenshots/${messageId}`,
  });
}
