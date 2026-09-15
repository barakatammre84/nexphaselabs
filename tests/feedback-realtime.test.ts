import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localD1 } from './helpers/local-d1';

const { env } = vi.hoisted(() => ({ env: {} as Record<string, unknown> }));
vi.mock('cloudflare:workers', () => ({ env }));

import { getDb } from '@/db';
import { staffSessions, staffUsers } from '@/db/schema';
import { recordVisitorFeedback } from '@/lib/feedback';
import { feedbackRealtime } from '@/lib/feedback-realtime';
import { sha256Hex } from '@/lib/staff-auth-core';

let local: ReturnType<typeof localD1>;
const roomFetch = vi.fn();

beforeEach(() => {
  local = localD1();
  roomFetch
    .mockReset()
    .mockResolvedValue(new Response('connected', { status: 200 }));
  Object.assign(env, { DB: local.binding });
});

afterEach(() => {
  local.sqlite.close();
  for (const key of Object.keys(env)) delete env[key];
});

function socketRequest(
  publicId: string,
  cookie?: string,
  origin = 'https://test.example.org',
) {
  return new Request(
    `https://test.example.org/api/feedback/realtime?conversation=${publicId}`,
    {
      headers: {
        Upgrade: 'websocket',
        Origin: origin,
        ...(cookie ? { Cookie: cookie } : {}),
      },
    },
  );
}

describe('feedback realtime authorization', () => {
  it('allows only the visitor token owning that conversation and strips the cookie before room handoff', async () => {
    const saved = await recordVisitorFeedback({
      token: null,
      body: 'Realtime test',
      profile: { name: null, email: null },
      sourcePath: '/',
    });
    const runtime = {
      DB: local.binding,
      FEEDBACK_ROOMS: { getByName: () => ({ fetch: roomFetch }) },
    } as unknown as Cloudflare.Env;
    const response = await feedbackRealtime(
      socketRequest(
        saved.thread.conversation.publicId,
        `nx_feedback=${saved.token}`,
      ),
      runtime,
    );
    expect(response.status).toBe(200);
    const handedOff = roomFetch.mock.calls[0][0] as Request;
    expect(handedOff.headers.get('X-Feedback-Role')).toBe('visitor');
    expect(handedOff.headers.get('cookie')).toBeNull();
  });

  it('blocks missing ownership, cross-origin sockets, and non-upgrade requests', async () => {
    const runtime = {
      DB: local.binding,
      FEEDBACK_ROOMS: { getByName: () => ({ fetch: roomFetch }) },
    } as unknown as Cloudflare.Env;
    expect(
      (await feedbackRealtime(socketRequest('FB-260905-ABCDEF12'), runtime))
        .status,
    ).toBe(401);
    expect(
      (
        await feedbackRealtime(
          socketRequest(
            'FB-260905-ABCDEF12',
            `nx_feedback=${'a'.repeat(64)}`,
            'https://evil.example',
          ),
          runtime,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await feedbackRealtime(
          new Request('https://test.example.org/api/feedback/realtime'),
          runtime,
        )
      ).status,
    ).toBe(426);
    expect(roomFetch).not.toHaveBeenCalled();
  });

  it('admits a staff session only with the permission that governs feedback everywhere else', async () => {
    const saved = await recordVisitorFeedback({
      token: null,
      body: 'Realtime staff test',
      profile: { name: null, email: null },
      sourcePath: '/',
    });
    const publicId = saved.thread.conversation.publicId;
    const runtime = {
      DB: local.binding,
      FEEDBACK_ROOMS: { getByName: () => ({ fetch: roomFetch }) },
    } as unknown as Cloudflare.Env;
    const session = async (role: 'admin' | 'qc' | 'ops', token: string) => {
      await getDb().insert(staffUsers).values({
        id: `stf_${role}`,
        email: `${role}@example.invalid`,
        name: role,
        role,
        passwordHash: 'unused',
      });
      await getDb().insert(staffSessions).values({
        id: `ses_${role}`,
        tokenHash: await sha256Hex(token),
        userId: `stf_${role}`,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });
      return `nx_staff=${token}`;
    };
    for (const [role, token] of [
      ['admin', 'a'.repeat(64)],
      ['ops', 'b'.repeat(64)],
    ] as const) {
      roomFetch.mockClear();
      expect(
        (await feedbackRealtime(socketRequest(publicId, await session(role, token)), runtime))
          .status,
      ).toBe(200);
      expect(
        (roomFetch.mock.calls[0][0] as Request).headers.get('X-Feedback-Role'),
      ).toBe('staff');
    }
    // QC holds no feedback.manage (canHandleFeedback), so its session opens no socket either.
    roomFetch.mockClear();
    expect(
      (await feedbackRealtime(socketRequest(publicId, await session('qc', 'c'.repeat(64))), runtime))
        .status,
    ).toBe(401);
    expect(roomFetch).not.toHaveBeenCalled();
  });
});
