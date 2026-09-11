import {
  parseShippoTrackEvent,
  processShippoTrackingEvent,
  shippoWebhookConfigurationError,
  validShippoWebhookToken,
} from '@/lib/shippo-tracking';

export async function POST(request: Request) {
  if (shippoWebhookConfigurationError())
    return new Response('Not configured', { status: 404 });
  const url = new URL(request.url);
  if (!(await validShippoWebhookToken(url.searchParams.get('token'))))
    return new Response('Unauthorized', { status: 401 });
  const raw = await request.text();
  if (raw.length > 128 * 1024)
    return new Response('Too large', { status: 413 });
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return new Response('Bad JSON', { status: 400 });
  }
  const event = parseShippoTrackEvent(value);
  if (!event) return new Response('Bad event', { status: 400 });
  try {
    const result = await processShippoTrackingEvent(event);
    return Response.json(
      { ok: result.ok, outcome: result.outcome },
      { status: result.status },
    );
  } catch (error) {
    console.error(
      '[shipping] Shippo tracking webhook failed',
      error instanceof Error ? error.message : error,
    );
    return new Response('Error', { status: 500 });
  }
}
