import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { env } = vi.hoisted(() => ({ env: {} as Record<string, string> }));
vi.mock('cloudflare:workers', () => ({ env }));

import { sendEmail } from '@/lib/email';
import { notificationEnvelope } from '@/lib/notification-delivery';
import { replyToFor } from '@/lib/senders';

beforeEach(() => {
  for (const key of Object.keys(env)) delete env[key];
});
afterEach(() => vi.restoreAllMocks());

describe('reply-to addresses', () => {
  it('sends no Reply-To until the purpose sender scheme is on', () => {
    expect(replyToFor('orders')).toBeNull();
    expect(notificationEnvelope('customer@example.org', 'Order shipped', 'Body')).not.toHaveProperty('replyTo');
  });

  it('points replies at the purpose mailbox once the scheme is on', () => {
    env.EMAIL_SENDER_SCHEME = 'purpose';
    expect(notificationEnvelope('customer@example.org', 'Order shipped', 'Body').replyTo).toBe('orders@nexphaselabs.net');
    expect(notificationEnvelope('customer@example.org', 'Feedback', 'Body', 'support').replyTo).toBe('support@nexphaselabs.net');
    env.EMAIL_FROM_QUALITY = 'Quality Desk <qa@nexphaselabs.net>';
    expect(replyToFor('quality')).toBe('qa@nexphaselabs.net');
  });

  it('carries the reply-to through an immediate account email', async () => {
    Object.assign(env, {
      EMAIL_SENDER_SCHEME: 'purpose',
      APP_ENV: 'staging',
      TEST_EMAIL_ALLOWLIST: 'customer@example.org',
      RESEND_API_KEY: 'resend-test-key',
    });
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({ id: 'resend-message-2' }));
    expect(await sendEmail({ to: 'customer@example.org', subject: 'Confirm', text: 'Link' })).toEqual({
      ok: true,
      id: 'resend-message-2',
    });
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body)).reply_to).toBe('accounts@nexphaselabs.net');
  });
});
