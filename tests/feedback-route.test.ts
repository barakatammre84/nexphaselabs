import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localD1 } from './helpers/local-d1';

const publish = vi.fn();
const { env } = vi.hoisted(() => ({ env: {} as Record<string, unknown> }));
vi.mock('cloudflare:workers', () => ({ env }));

import {
  GET as getFeedback,
  POST as postFeedback,
} from '@/app/api/feedback/route';
import { GET as getArchive } from '@/app/api/feedback/archive/route';

let local: ReturnType<typeof localD1>;
const request = (
  body: Record<string, unknown>,
  origin = 'https://test.example.org',
) =>
  new Request('https://test.example.org/api/feedback', {
    method: 'POST',
    headers: {
      host: 'test.example.org',
      origin,
      'content-type': 'application/json',
      'cf-connecting-ip': '192.0.2.10',
    },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  local = localD1();
  publish.mockReset().mockResolvedValue(1);
  Object.assign(env, {
    DB: local.binding,
    FEEDBACK_ROOMS: { getByName: () => ({ publish }) },
    CHATGPT_FEEDBACK_READ_TOKEN:
      'archive-secret-at-least-thirty-two-characters',
  });
});

afterEach(() => {
  local.sqlite.close();
  for (const key of Object.keys(env)) delete env[key];
});

describe('public feedback and ChatGPT archive routes', () => {
  it('saves a message, returns a private cookie, and reads only that visitor thread', async () => {
    const response = await postFeedback(
      request({
        message: 'The product page needs a clearer document link.',
        title: 'Document link is hard to find',
        kind: 'bug',
        severity: 'major',
        expectedBehavior: 'The lot document link should be beside the lot.',
        context: {
          userAgent: 'Synthetic Browser',
          viewport: { width: 1280, height: 800 },
          annotation: {
            kind: 'element',
            selector: '#lot-documents',
            label: 'Lot documents',
            rect: { x: 50, y: 100, width: 400, height: 80 },
          },
        },
        page: '/catalog/bpc-157',
      }),
    );
    expect(response.status).toBe(201);
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    const body = (await response.json()) as {
      conversation: {
        id: string;
        unread: number;
        kind: string;
        severity: string;
      };
      messages: unknown[];
    };
    expect(body.conversation.id).toMatch(/^FB-/);
    expect(body.conversation.unread).toBe(0);
    expect(body.conversation.kind).toBe('bug');
    expect(body.conversation.severity).toBe('major');
    expect(body.messages).toHaveLength(1);
    const cookie = response.headers.get('set-cookie')!;
    const read = await getFeedback(
      new Request('https://test.example.org/api/feedback', {
        headers: { cookie },
      }),
    );
    expect(
      ((await read.json()) as { messages: unknown[] }).messages,
    ).toHaveLength(1);
  });

  it('blocks cross-origin writes and invalid messages', async () => {
    expect(
      (await postFeedback(request({ message: 'test' }, 'https://evil.example')))
        .status,
    ).toBe(403);
    expect((await postFeedback(request({ message: '' }))).status).toBe(422);
  });

  it('lists reports in the shape the widget reads, whether or not a report is open', async () => {
    const created = await postFeedback(
      request({
        message: 'The catalog search clears my query.',
        title: 'Search clears the query',
        kind: 'bug',
        severity: 'minor',
        page: '/catalog',
      }),
    );
    const cookie = created.headers.get('set-cookie')!;
    const read = async (query = '') =>
      (await (
        await getFeedback(
          new Request(`https://test.example.org/api/feedback${query}`, {
            headers: { cookie },
          }),
        )
      ).json()) as {
        conversation: { id: string } | null;
        conversations: Record<string, unknown>[];
      };
    const open = await read();
    // A well-formed reference this visitor does not own opens no report, but
    // the list beside it must still be one the widget can render.
    const unopened = await read('?conversation=FB-000000-00000000');
    expect(unopened.conversation).toBeNull();
    expect(unopened.conversations).toEqual(open.conversations);
    // components/site/feedback-chat.tsx keys, opens and badges reports by `id` and `unread`.
    expect(unopened.conversations).toEqual([
      {
        id: open.conversation!.id,
        subject: expect.any(String),
        kind: 'bug',
        severity: 'minor',
        status: expect.any(String),
        priority: expect.any(String),
        unread: 0,
        lastSender: 'visitor',
        lastMessageAt: expect.any(String),
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      },
    ]);
  });

  it('keeps the archive unavailable without its independent bearer token and returns safe structured records with it', async () => {
    await postFeedback(
      request({ message: 'Searchable feedback', name: 'Test', page: '/faq' }),
    );
    const unauthorized = await getArchive(
      new Request('https://test.example.org/api/feedback/archive', {
        headers: { 'cf-connecting-ip': '192.0.2.20' },
      }),
    );
    expect(unauthorized.status).toBe(401);
    const authorized = await getArchive(
      new Request(
        'https://test.example.org/api/feedback/archive?q=searchable',
        {
          headers: {
            authorization:
              'Bearer archive-secret-at-least-thirty-two-characters',
            'cf-connecting-ip': '192.0.2.20',
          },
        },
      ),
    );
    expect(authorized.status).toBe(200);
    const body = (await authorized.json()) as { safety: string; count: number };
    expect(body.safety).toContain('untrusted feedback');
    expect(body.count).toBe(1);
  });
});
