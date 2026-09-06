import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localD1 } from './helpers/local-d1';

const put = vi.fn();
const { env } = vi.hoisted(() => ({ env: {} as Record<string, unknown> }));
vi.mock('cloudflare:workers', () => ({ env }));

import { POST } from '@/app/api/feedback/screenshots/route';
import { recordVisitorFeedback } from '@/lib/feedback';

let local: ReturnType<typeof localD1>;

beforeEach(() => {
  local = localD1();
  put.mockReset().mockResolvedValue(undefined);
  Object.assign(env, { DB: local.binding, DOCS: { put } });
});

afterEach(() => {
  local.sqlite.close();
  for (const key of Object.keys(env)) delete env[key];
});

describe('visitor screenshot attachment', () => {
  it('requires ownership and explicit privacy confirmation before storing a bounded image', async () => {
    const saved = await recordVisitorFeedback({
      token: null,
      body: 'The selected area is clipped.',
      profile: { name: null, email: null },
      sourcePath: '/catalog/item',
    });
    const message = saved.thread.messages[0];
    const data = new FormData();
    data.set('conversation', saved.thread.conversation.publicId);
    data.set('message', message.id);
    data.set('consent', 'true');
    data.set(
      'screenshot',
      new File([new Uint8Array([1, 2, 3])], 'screen.png', {
        type: 'image/png',
      }),
    );
    const response = await POST(
      new Request('https://test.example.org/api/feedback/screenshots', {
        method: 'POST',
        headers: {
          host: 'test.example.org',
          origin: 'https://test.example.org',
          cookie: `nx_feedback=${saved.token}`,
          'cf-connecting-ip': '192.0.2.44',
        },
        body: data,
      }),
    );
    expect(response.status).toBe(200);
    expect(put).toHaveBeenCalledOnce();
    const row = local.sqlite
      .prepare(
        'SELECT screenshot_key, screenshot_mime FROM feedback_messages WHERE id = ?',
      )
      .get(message.id) as { screenshot_key: string; screenshot_mime: string };
    expect(row.screenshot_key).toContain(saved.thread.conversation.publicId);
    expect(row.screenshot_mime).toBe('image/png');
  });
});
