import { DurableObject } from 'cloudflare:workers';
import type { FeedbackRealtimeEvent } from '@/lib/feedback';

/**
 * One hibernating fan-out room per feedback conversation. D1 owns the
 * transcript; this object only announces that persisted state changed.
 */
export class FeedbackRoom extends DurableObject<Cloudflare.Env> {
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }
    const role = request.headers.get('X-Feedback-Role');
    if (role !== 'visitor' && role !== 'staff')
      return new Response('Unauthorized', { status: 401 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.serializeAttachment({ role });
    this.ctx.acceptWebSocket(server);
    server.send(
      JSON.stringify({ type: 'connected', at: new Date().toISOString() }),
    );
    return new Response(null, { status: 101, webSocket: client });
  }

  publish(event: FeedbackRealtimeEvent): number {
    const payload = JSON.stringify(event);
    if (payload.length > 1000)
      throw new Error('Realtime feedback event is too large');
    let delivered = 0;
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(payload);
        delivered++;
      } catch {
        socket.close(1011, 'Connection could not receive the update');
      }
    }
    return delivered;
  }

  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): void {
    if (typeof message === 'string' && message === 'ping') {
      socket.send(
        JSON.stringify({ type: 'pong', at: new Date().toISOString() }),
      );
      return;
    }
    socket.close(
      1008,
      'Messages must be sent through the durable transcript endpoint',
    );
  }

  webSocketError(_socket: WebSocket, error: unknown): void {
    console.error('[feedback-room] websocket error', error);
  }
}
