import { env } from 'cloudflare:workers';
import { emailRecipientAllowed } from '@/lib/environment-safety';

export type EmailEnvelope = {
  from: string;
  to: string[];
  subject: string;
  text: string;
  /** The mailbox replies should reach when it is not the sending address (lib/senders.ts). */
  replyTo?: string;
};

export type EmailDeliveryResult =
  | { ok: true; providerId: string }
  | { ok: false; error: string; retryable: boolean };

type Provider = 'google_workspace' | 'resend';

const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_SEND_URL =
  'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

let cachedGoogleToken:
  | { key: string; accessToken: string; expiresAt: number }
  | undefined;

function provider(): Provider | null {
  if (env.EMAIL_PROVIDER === 'google_workspace') return 'google_workspace';
  if (env.EMAIL_PROVIDER === 'resend') return 'resend';
  if (
    env.GOOGLE_WORKSPACE_SERVICE_ACCOUNT_EMAIL ||
    env.GOOGLE_WORKSPACE_PRIVATE_KEY ||
    env.GOOGLE_WORKSPACE_OAUTH_CLIENT_ID ||
    env.GOOGLE_WORKSPACE_OAUTH_CLIENT_SECRET ||
    env.GOOGLE_WORKSPACE_OAUTH_REFRESH_TOKEN ||
    env.GOOGLE_WORKSPACE_SENDER
  )
    return 'google_workspace';
  if (env.RESEND_API_KEY) return 'resend';
  return null;
}

export function emailProviderConfigured(): boolean {
  return emailProviderConfigurationError() === null;
}

export function emailProviderConfigurationError(
  recipient?: string,
): string | null {
  if (
    env.EMAIL_PROVIDER &&
    !['google_workspace', 'resend'].includes(env.EMAIL_PROVIDER)
  )
    return 'The selected email provider is not supported.';
  const selected = provider();
  if (!selected) return 'Email provider is not configured.';
  if (selected === 'resend' && !env.RESEND_API_KEY)
    return 'Resend email is selected but its API key is not configured.';
  if (selected === 'google_workspace') {
    const delegatedServiceAccount = Boolean(
      env.GOOGLE_WORKSPACE_SERVICE_ACCOUNT_EMAIL &&
        env.GOOGLE_WORKSPACE_PRIVATE_KEY,
    );
    const mailboxOAuth = Boolean(
      env.GOOGLE_WORKSPACE_OAUTH_CLIENT_ID &&
        env.GOOGLE_WORKSPACE_OAUTH_CLIENT_SECRET &&
        env.GOOGLE_WORKSPACE_OAUTH_REFRESH_TOKEN,
    );
    if (!env.GOOGLE_WORKSPACE_SENDER || (!delegatedServiceAccount && !mailboxOAuth))
      return 'Google Workspace email is selected but its OAuth or service account credentials or sender are incomplete.';
  }
  if (
    recipient &&
    !emailRecipientAllowed(
      env.APP_ENV,
      recipient,
      env.TEST_EMAIL_ALLOWLIST,
    )
  )
    return 'Recipient is not in the non-production test allowlist.';
  return null;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

function base64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');
}

function utf8Base64(value: string): string {
  return bytesToBase64(new TextEncoder().encode(value));
}

function utf8Base64Url(value: string): string {
  return base64Url(new TextEncoder().encode(value));
}

function header(value: string, label: string): string {
  if (!value.trim() || /[\r\n]/u.test(value))
    throw new Error(`Invalid ${label} header.`);
  return value.trim();
}

function wrapBase64(value: string): string {
  return value.match(/.{1,76}/gu)?.join('\r\n') ?? '';
}

async function deterministicMessageId(key: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(key),
  );
  return `<${base64Url(new Uint8Array(digest))}@mail.nexphaselabs.net>`;
}

export async function gmailRawMessage(
  envelope: EmailEnvelope,
  key: string,
): Promise<string> {
  if (envelope.to.length !== 1) throw new Error('Exactly one recipient is required.');
  const subject = utf8Base64(header(envelope.subject, 'subject'));
  const lines = [
    `From: ${header(envelope.from, 'from')}`,
    `To: ${header(envelope.to[0], 'recipient')}`,
    ...(envelope.replyTo ? [`Reply-To: ${header(envelope.replyTo, 'reply-to')}`] : []),
    `Subject: =?UTF-8?B?${subject}?=`,
    `Message-ID: ${await deterministicMessageId(key)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrapBase64(utf8Base64(envelope.text)),
  ];
  return utf8Base64Url(lines.join('\r\n'));
}

function privateKeyBytes(pem: string): ArrayBuffer {
  const normalized = pem.replaceAll('\\n', '\n').trim();
  const encoded = normalized
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s+/gu, '');
  if (!encoded) throw new Error('Google Workspace private key is empty.');
  const binary = atob(encoded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return bytes.buffer;
}

async function googleAccessToken(): Promise<
  | { ok: true; token: string }
  | { ok: false; error: string; retryable: boolean }
> {
  const sender = env.GOOGLE_WORKSPACE_SENDER!;
  const oauthClientId = env.GOOGLE_WORKSPACE_OAUTH_CLIENT_ID;
  const oauthClientSecret = env.GOOGLE_WORKSPACE_OAUTH_CLIENT_SECRET;
  const oauthRefreshToken = env.GOOGLE_WORKSPACE_OAUTH_REFRESH_TOKEN;
  const useMailboxOAuth = Boolean(
    oauthClientId && oauthClientSecret && oauthRefreshToken,
  );
  const serviceAccount = env.GOOGLE_WORKSPACE_SERVICE_ACCOUNT_EMAIL;
  const cacheKey = useMailboxOAuth
    ? `oauth:${oauthClientId}:${sender}`
    : `delegated:${serviceAccount}:${sender}`;
  const now = Math.floor(Date.now() / 1000);
  if (
    cachedGoogleToken?.key === cacheKey &&
    cachedGoogleToken.expiresAt > now + 60
  )
    return { ok: true, token: cachedGoogleToken.accessToken };

  try {
    if (useMailboxOAuth) {
      const response = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        signal: AbortSignal.timeout(10_000),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: oauthClientId!,
          client_secret: oauthClientSecret!,
          refresh_token: oauthRefreshToken!,
          grant_type: 'refresh_token',
        }),
      });
      if (!response.ok) {
        return {
          ok: false,
          error: `Google authorization returned ${response.status}.`,
          retryable:
            response.status === 408 ||
            response.status === 429 ||
            response.status >= 500,
        };
      }
      const data = (await response.json()) as {
        access_token?: unknown;
        expires_in?: unknown;
      };
      if (typeof data.access_token !== 'string' || !data.access_token)
        return {
          ok: false,
          error: 'Google authorization returned no access token.',
          retryable: false,
        };
      const expiresIn =
        typeof data.expires_in === 'number' ? data.expires_in : 3600;
      cachedGoogleToken = {
        key: cacheKey,
        accessToken: data.access_token,
        expiresAt: now + expiresIn,
      };
      return { ok: true, token: data.access_token };
    }

    const signingKey = await crypto.subtle.importKey(
      'pkcs8',
      privateKeyBytes(env.GOOGLE_WORKSPACE_PRIVATE_KEY!),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const encodedHeader = utf8Base64Url(
      JSON.stringify({ alg: 'RS256', typ: 'JWT' }),
    );
    const encodedClaims = utf8Base64Url(
      JSON.stringify({
        iss: serviceAccount,
        sub: sender,
        scope: GMAIL_SEND_SCOPE,
        aud: GOOGLE_TOKEN_URL,
        iat: now,
        exp: now + 3600,
      }),
    );
    const unsigned = `${encodedHeader}.${encodedClaims}`;
    const signature = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      signingKey,
      new TextEncoder().encode(unsigned),
    );
    const assertion = `${unsigned}.${base64Url(new Uint8Array(signature))}`;
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    });
    if (!response.ok) {
      return {
        ok: false,
        error: `Google authorization returned ${response.status}.`,
        retryable:
          response.status === 408 ||
          response.status === 429 ||
          response.status >= 500,
      };
    }
    const data = (await response.json()) as {
      access_token?: unknown;
      expires_in?: unknown;
    };
    if (typeof data.access_token !== 'string' || !data.access_token)
      return {
        ok: false,
        error: 'Google authorization returned no access token.',
        retryable: false,
      };
    const expiresIn =
      typeof data.expires_in === 'number' ? data.expires_in : 3600;
    cachedGoogleToken = {
      key: cacheKey,
      accessToken: data.access_token,
      expiresAt: now + expiresIn,
    };
    return { ok: true, token: data.access_token };
  } catch {
    return {
      ok: false,
      error: 'Google authorization could not be completed.',
      retryable: false,
    };
  }
}

async function deliverWithGoogle(
  envelope: EmailEnvelope,
  key: string,
): Promise<EmailDeliveryResult> {
  const token = await googleAccessToken();
  if (!token.ok) return token;
  let raw: string;
  try {
    raw = await gmailRawMessage(envelope, key);
  } catch {
    return { ok: false, error: 'Email headers are invalid.', retryable: false };
  }
  try {
    const response = await fetch(GMAIL_SEND_URL, {
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
      headers: {
        Authorization: `Bearer ${token.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw }),
    });
    if (!response.ok) {
      return {
        ok: false,
        error: `Gmail API returned ${response.status}.`,
        // A rate-limit response is known not to be accepted. Timeouts and
        // server errors can be ambiguous, so a person must reconcile Sent mail.
        retryable: response.status === 429,
      };
    }
    const data = (await response.json()) as { id?: unknown };
    if (typeof data.id !== 'string' || !data.id)
      return {
        ok: false,
        error:
          'Gmail acceptance is uncertain; no message reference returned. Review Sent mail before retrying.',
        retryable: false,
      };
    return { ok: true, providerId: data.id };
  } catch {
    return {
      ok: false,
      error:
        'Gmail response is uncertain after a network error or timeout. Review Sent mail before retrying.',
      retryable: false,
    };
  }
}

async function deliverWithResend(
  envelope: EmailEnvelope,
  key: string,
): Promise<EmailDeliveryResult> {
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': key,
      },
      // Resend's API names this field reply_to.
      body: JSON.stringify({
        from: envelope.from,
        to: envelope.to,
        subject: envelope.subject,
        text: envelope.text,
        ...(envelope.replyTo ? { reply_to: envelope.replyTo } : {}),
      }),
    });
    if (!response.ok)
      return {
        ok: false,
        error: `Email provider returned ${response.status}.`,
        retryable:
          response.status === 408 ||
          response.status === 429 ||
          response.status >= 500,
      };
    const data = (await response.json()) as { id?: unknown };
    if (typeof data.id !== 'string' || !data.id)
      return {
        ok: false,
        error:
          'Provider acceptance is uncertain; no message reference returned.',
        retryable: true,
      };
    return { ok: true, providerId: data.id };
  } catch {
    return {
      ok: false,
      error: 'Provider response is uncertain after a network error or timeout.',
      retryable: true,
    };
  }
}

export async function deliverEmail(
  envelope: EmailEnvelope,
  key: string,
): Promise<EmailDeliveryResult> {
  const issue = emailProviderConfigurationError(envelope.to[0]);
  if (issue) return { ok: false, error: issue, retryable: false };
  return provider() === 'google_workspace'
    ? deliverWithGoogle(envelope, key)
    : deliverWithResend(envelope, key);
}
