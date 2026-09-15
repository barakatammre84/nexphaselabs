import { env } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { zelleMailboxState } from '@/db/commerce-schema';
import { boundedJson } from '@/lib/provider-response';
import { recordZelleGmailMessage } from '@/lib/zelle';
import { zelleConfig, zelleInboxEnabled } from '@/lib/zelle-config';
import type { GmailHeader, ZelleGmailMessage } from '@/lib/zelle-core';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';
let cachedToken: { token: string; expiresAt: number } | null = null;

type GmailPart = {
  mimeType?: unknown;
  body?: { data?: unknown };
  parts?: GmailPart[];
};

function base64UrlText(value: string): string {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/').padEnd(
    Math.ceil(value.length / 4) * 4,
    '=',
  );
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function textFromPart(part: GmailPart): string[] {
  const children = Array.isArray(part.parts) ? part.parts.flatMap(textFromPart) : [];
  const data = typeof part.body?.data === 'string' ? part.body.data : '';
  if (!data) return children;
  try {
    const decoded = base64UrlText(data);
    if (part.mimeType === 'text/plain') return [decoded, ...children];
    if (part.mimeType === 'text/html' && children.length === 0)
      return [
        decoded
          .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, ' ')
          .replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, ' ')
          .replace(/<[^>]+>/gu, ' ')
          .replace(/&nbsp;/giu, ' ')
          .replace(/&amp;/giu, '&'),
      ];
  } catch {
    return children;
  }
  return children;
}

async function accessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt > now + 60) return cachedToken.token;
  // `||` as in zelleConfigurationStatus: an empty dedicated setting is unset and falls back to the Workspace client.
  const clientId =
    env.ZELLE_GMAIL_OAUTH_CLIENT_ID || env.GOOGLE_WORKSPACE_OAUTH_CLIENT_ID;
  const clientSecret =
    env.ZELLE_GMAIL_OAUTH_CLIENT_SECRET ||
    env.GOOGLE_WORKSPACE_OAUTH_CLIENT_SECRET;
  const refreshToken = env.ZELLE_GMAIL_OAUTH_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken)
    throw new Error('Zelle Gmail read-only authorization is incomplete.');
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    signal: AbortSignal.timeout(10_000),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!response.ok) throw new Error(`Google authorization returned ${response.status}.`);
  const data = (await boundedJson(response)) as {
    access_token?: unknown;
    expires_in?: unknown;
  };
  if (typeof data.access_token !== 'string' || !data.access_token)
    throw new Error('Google authorization returned no access token.');
  cachedToken = {
    token: data.access_token,
    expiresAt: now + (typeof data.expires_in === 'number' ? data.expires_in : 3600),
  };
  return cachedToken.token;
}

async function gmailJson(url: string, token: string) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(10_000),
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`Gmail API returned ${response.status}.`);
  return boundedJson(response);
}

async function fetchMessage(id: string, token: string): Promise<ZelleGmailMessage> {
  const raw = (await gmailJson(
    `${GMAIL_API}/messages/${encodeURIComponent(id)}?format=full`,
    token,
  )) as {
    id?: unknown;
    threadId?: unknown;
    internalDate?: unknown;
    payload?: GmailPart & { headers?: unknown };
  };
  if (raw.id !== id || !raw.payload) throw new Error('Gmail returned an invalid message.');
  const headers = Array.isArray(raw.payload.headers)
    ? (raw.payload.headers as GmailHeader[])
    : [];
  return {
    id,
    threadId: typeof raw.threadId === 'string' ? raw.threadId : undefined,
    internalDate:
      typeof raw.internalDate === 'string' ? raw.internalDate : undefined,
    headers,
    text: textFromPart(raw.payload).join('\n').slice(0, 100_000),
  };
}

export type ZelleSyncResult = {
  ok: boolean;
  scanned: number;
  added: number;
  matched: number;
  review: number;
  ignored: number;
  error?: string;
};

/** Poll a bounded overlap window. Message/hash uniqueness makes overlap safe and
 * a failed run never advances the cursor. */
export async function syncZelleMailbox(): Promise<ZelleSyncResult> {
  const summary: ZelleSyncResult = {
    ok: false,
    scanned: 0,
    added: 0,
    matched: 0,
    review: 0,
    ignored: 0,
  };
  const config = zelleConfig();
  if (!zelleInboxEnabled()) return { ...summary, error: 'Zelle inbox automation is disabled or incomplete.' };
  const db = getDb();
  const [state] = await db
    .select()
    .from(zelleMailboxState)
    .where(eq(zelleMailboxState.mailbox, config.mailbox))
    .limit(1);
  const now = new Date();
  const fallback = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const overlap = state?.lastSuccessfulAt
    ? state.lastSuccessfulAt.getTime() - 24 * 60 * 60 * 1000
    : fallback;
  const after = Math.floor(Math.max(fallback, overlap) / 1000);
  try {
    const token = await accessToken();
    const profile = (await gmailJson(`${GMAIL_API}/profile`, token)) as {
      emailAddress?: unknown;
    };
    if (
      typeof profile.emailAddress !== 'string' ||
      profile.emailAddress.toLowerCase() !== config.mailbox
    )
      throw new Error('The Gmail read-only token belongs to a different mailbox.');
    const senderQuery = `{${config.senders.map((sender) => `from:${sender}`).join(' ')}}`;
    const ids: string[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < 3; page++) {
      const params = new URLSearchParams({
        q: `${senderQuery} after:${after}`,
        maxResults: '100',
      });
      if (pageToken) params.set('pageToken', pageToken);
      const data = (await gmailJson(`${GMAIL_API}/messages?${params}`, token)) as {
        messages?: { id?: unknown }[];
        nextPageToken?: unknown;
      };
      for (const item of data.messages ?? [])
        if (typeof item.id === 'string') ids.push(item.id);
      pageToken =
        typeof data.nextPageToken === 'string' ? data.nextPageToken : undefined;
      if (!pageToken) break;
    }
    summary.scanned = ids.length;
    for (const id of new Set(ids)) {
      const result = await recordZelleGmailMessage(await fetchMessage(id, token));
      if (result.duplicate) continue;
      summary.added++;
      if (result.outcome === 'paid') summary.matched++;
      else if (result.outcome === 'review') summary.review++;
      else summary.ignored++;
    }
    summary.ok = true;
    await db
      .insert(zelleMailboxState)
      .values({
        mailbox: config.mailbox,
        lastSuccessfulAt: now,
        lastMessageCount: summary.scanned,
        lastError: null,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: zelleMailboxState.mailbox,
        set: {
          lastSuccessfulAt: now,
          lastMessageCount: summary.scanned,
          lastError: null,
          updatedAt: now,
        },
      });
    return summary;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Zelle inbox sync failed.';
    await db
      .insert(zelleMailboxState)
      .values({
        mailbox: config.mailbox,
        lastMessageCount: 0,
        lastError: message,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: zelleMailboxState.mailbox,
        set: { lastError: message, updatedAt: now },
      });
    return { ...summary, error: message };
  }
}
