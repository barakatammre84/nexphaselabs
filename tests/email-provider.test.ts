import { beforeEach, describe, expect, it, vi } from 'vitest';

const { env } = vi.hoisted(() => ({ env: {} as Record<string, string> }));
vi.mock('cloudflare:workers', () => ({ env }));

import {
  deliverEmail,
  emailProviderConfigurationError,
  gmailRawMessage,
} from '@/lib/email-provider';

function decodeBase64Url(value: string): string {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  return Buffer.from(normalized, 'base64').toString('utf8');
}

async function privateKeyPem(): Promise<string> {
  const pair = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  );
  const exported = await crypto.subtle.exportKey('pkcs8', pair.privateKey);
  return `-----BEGIN PRIVATE KEY-----\n${Buffer.from(exported).toString('base64')}\n-----END PRIVATE KEY-----`;
}

beforeEach(() => {
  for (const key of Object.keys(env)) delete env[key];
  vi.restoreAllMocks();
});

describe('email providers', () => {
  it('requires the complete selected Google Workspace configuration', () => {
    env.EMAIL_PROVIDER = 'google_workspace';
    expect(emailProviderConfigurationError()).toContain('incomplete');
    Object.assign(env, {
      GOOGLE_WORKSPACE_SERVICE_ACCOUNT_EMAIL: 'mailer@project.iam.gserviceaccount.com',
      GOOGLE_WORKSPACE_PRIVATE_KEY: 'configured',
      GOOGLE_WORKSPACE_SENDER: 'sam@nexphaselabs.net',
    });
    expect(emailProviderConfigurationError()).toBeNull();
  });

  it('accepts a complete mailbox OAuth configuration', () => {
    Object.assign(env, {
      EMAIL_PROVIDER: 'google_workspace',
      GOOGLE_WORKSPACE_OAUTH_CLIENT_ID: 'client.apps.googleusercontent.com',
      GOOGLE_WORKSPACE_OAUTH_CLIENT_SECRET: 'client-secret',
      GOOGLE_WORKSPACE_OAUTH_REFRESH_TOKEN: 'refresh-token',
      GOOGLE_WORKSPACE_SENDER: 'sam@nexphaselabs.net',
    });
    expect(emailProviderConfigurationError()).toBeNull();
  });

  it('does not silently fall back when the selected provider name is invalid', () => {
    Object.assign(env, {
      EMAIL_PROVIDER: 'gmail',
      RESEND_API_KEY: 'present-but-not-selected',
    });
    expect(emailProviderConfigurationError()).toContain('not supported');
  });

  it('builds one deterministic RFC 5322 message and rejects header injection', async () => {
    const envelope = {
      from: 'NexPhase Labs <research@nexphaselabs.net>',
      to: ['customer@example.org'],
      subject: 'Order received',
      text: 'Thank you. ✓',
    };
    const first = await gmailRawMessage(envelope, 'order:event-1');
    const second = await gmailRawMessage(envelope, 'order:event-1');
    expect(first).toBe(second);
    const mime = decodeBase64Url(first);
    expect(mime).toContain('Message-ID: <');
    expect(mime).toContain('Content-Transfer-Encoding: base64');
    expect(
      Buffer.from(mime.split('\r\n\r\n')[1].replaceAll('\r\n', ''), 'base64').toString(
        'utf8',
      ),
    ).toBe(envelope.text);
    await expect(
      gmailRawMessage({ ...envelope, subject: 'Order\r\nBcc: thief@example.org' }, 'bad'),
    ).rejects.toThrow('Invalid subject');
  });

  it('names the reply mailbox in both providers', async () => {
    const envelope = {
      from: 'NexPhase Labs Orders <orders@nexphaselabs.net>',
      to: ['customer@example.org'],
      replyTo: 'orders@nexphaselabs.net',
      subject: 'Order received',
      text: 'Reply to this message with questions.',
    };
    expect(decodeBase64Url(await gmailRawMessage(envelope, 'order:event-2'))).toContain(
      '\r\nReply-To: orders@nexphaselabs.net\r\n',
    );
    expect(
      decodeBase64Url(await gmailRawMessage({ ...envelope, replyTo: undefined }, 'order:event-3')),
    ).not.toContain('Reply-To');
    await expect(
      gmailRawMessage({ ...envelope, replyTo: 'orders@nexphaselabs.net\r\nBcc: thief@example.org' }, 'bad'),
    ).rejects.toThrow('Invalid reply-to');

    Object.assign(env, {
      APP_ENV: 'staging',
      TEST_EMAIL_ALLOWLIST: 'customer@example.org',
      EMAIL_PROVIDER: 'resend',
      RESEND_API_KEY: 'resend-test-key',
    });
    const fetcher = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json({ id: 'resend-message-1' }));
    expect(await deliverEmail(envelope, 'order:event-4')).toEqual({ ok: true, providerId: 'resend-message-1' });
    const body = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(body).toMatchObject({ reply_to: 'orders@nexphaselabs.net', to: ['customer@example.org'] });
    expect(body).not.toHaveProperty('replyTo');
  });

  it('authorizes a delegated sender and sends through the Gmail API', async () => {
    Object.assign(env, {
      APP_ENV: 'staging',
      TEST_EMAIL_ALLOWLIST: 'customer@example.org',
      EMAIL_PROVIDER: 'google_workspace',
      GOOGLE_WORKSPACE_SERVICE_ACCOUNT_EMAIL:
        'mailer-test@project.iam.gserviceaccount.com',
      GOOGLE_WORKSPACE_PRIVATE_KEY: await privateKeyPem(),
      GOOGLE_WORKSPACE_SENDER: 'research@nexphaselabs.net',
    });
    const fetcher = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        Response.json({ access_token: 'google-access', expires_in: 3600 }),
      )
      .mockResolvedValueOnce(Response.json({ id: 'gmail-message-1' }));
    const result = await deliverEmail(
      {
        from: 'NexPhase Labs <research@nexphaselabs.net>',
        to: ['customer@example.org'],
        subject: '[TEST] Account verification',
        text: 'Verify your account.',
      },
      'account:verification-1',
    );
    expect(result).toEqual({ ok: true, providerId: 'gmail-message-1' });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0][0]).toBe('https://oauth2.googleapis.com/token');
    expect(fetcher.mock.calls[1][0]).toBe(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
    );
    expect(fetcher.mock.calls[1][1]?.headers).toMatchObject({
      Authorization: 'Bearer google-access',
    });
  });

  it('refreshes mailbox OAuth and sends through the Gmail API', async () => {
    Object.assign(env, {
      APP_ENV: 'staging',
      TEST_EMAIL_ALLOWLIST: 'customer@example.org',
      EMAIL_PROVIDER: 'google_workspace',
      GOOGLE_WORKSPACE_OAUTH_CLIENT_ID: 'client.apps.googleusercontent.com',
      GOOGLE_WORKSPACE_OAUTH_CLIENT_SECRET: 'client-secret',
      GOOGLE_WORKSPACE_OAUTH_REFRESH_TOKEN: 'refresh-token',
      GOOGLE_WORKSPACE_SENDER: 'sam@nexphaselabs.net',
    });
    const fetcher = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        Response.json({ access_token: 'oauth-access', expires_in: 3600 }),
      )
      .mockResolvedValueOnce(Response.json({ id: 'gmail-oauth-message-1' }));
    const result = await deliverEmail(
      {
        from: 'NexPhase Labs <research@nexphaselabs.net>',
        to: ['customer@example.org'],
        subject: '[TEST] OAuth mail',
        text: 'OAuth delivery check.',
      },
      'oauth:event-1',
    );
    expect(result).toEqual({
      ok: true,
      providerId: 'gmail-oauth-message-1',
    });
    const tokenRequest = fetcher.mock.calls[0][1];
    expect(tokenRequest?.body?.toString()).toContain('grant_type=refresh_token');
    expect(tokenRequest?.body?.toString()).toContain(
      'refresh_token=refresh-token',
    );
  });

  it('does not auto-retry an ambiguous Gmail send response', async () => {
    Object.assign(env, {
      APP_ENV: 'production',
      EMAIL_PROVIDER: 'google_workspace',
      GOOGLE_WORKSPACE_SERVICE_ACCOUNT_EMAIL:
        'mailer-ambiguous@project.iam.gserviceaccount.com',
      GOOGLE_WORKSPACE_PRIVATE_KEY: await privateKeyPem(),
      GOOGLE_WORKSPACE_SENDER: 'sam@nexphaselabs.net',
    });
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json({ access_token: 'access', expires_in: 3600 }))
      .mockRejectedValueOnce(new Error('connection closed'));
    const result = await deliverEmail(
      {
        from: 'NexPhase Labs <research@nexphaselabs.net>',
        to: ['customer@example.org'],
        subject: 'Order update',
        text: 'Update',
      },
      'order:event-2',
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.retryable).toBe(false);
      expect(result.error).toContain('Review Sent mail');
    }
  });
});
