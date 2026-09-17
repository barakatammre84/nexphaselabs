import { env } from 'cloudflare:workers';
import { emailRecipientAllowed } from '@/lib/environment-safety';
import { appEnv } from '@/lib/site-config';

/**
 * Brevo (formerly Sendinblue) as the marketing list and sender (owner, 16 Sep 2026).
 *
 * `lib/email.ts` stays transactional; this module is the only place marketing mail leaves
 * from, and it refuses any recipient without a confirmed consent row. Outside production
 * it also refuses anyone outside TEST_EMAIL_ALLOWLIST, exactly like the transactional
 * provider. Configuration: BREVO_API_KEY (secret), BREVO_LIST_ID and BREVO_SENDER (vars);
 * with any of them missing everything here answers "not configured" and nothing is sent.
 */
export const BREVO_API = 'https://api.brevo.com/v3';

function apiKey(): string | null {
  const key = (env.BREVO_API_KEY ?? '').trim();
  return key ? key : null;
}

export function brevoListId(): number | null {
  const id = Number((env.BREVO_LIST_ID ?? '').trim());
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** "Name <address>" or a bare address from BREVO_SENDER. */
export function brevoSender(): { name: string; email: string } | null {
  const raw = (env.BREVO_SENDER ?? '').trim();
  if (!raw) return null;
  const match = /^(?:"?([^"<]*)"?\s*)?<([^>]+)>$/.exec(raw);
  const email = (match ? match[2] : raw).trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return { name: (match?.[1] ?? '').trim() || 'NexPhase Labs', email };
}

export function brevoConfigured(): boolean {
  return Boolean(apiKey() && brevoListId() && brevoSender());
}

export type BrevoResult = { ok: true; id: string | null } | { ok: false; error: string };

async function call(
  path: string,
  init: { method: string; body?: unknown },
  fetchImpl: typeof fetch,
): Promise<{ status: number; body: Record<string, unknown> | null }> {
  const key = apiKey();
  if (!key) throw new Error('Brevo is not configured.');
  const response = await fetchImpl(`${BREVO_API}${path}`, {
    method: init.method,
    headers: { 'api-key': key, accept: 'application/json', 'content-type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(8000),
  });
  const text = await response.text();
  let body: Record<string, unknown> | null = null;
  try {
    body = text ? (JSON.parse(text) as Record<string, unknown>) : null;
  } catch {
    body = null;
  }
  return { status: response.status, body };
}

/** Adds or updates the contact on the configured list. */
export async function brevoUpsertContact(
  email: string,
  attributes: Record<string, string> = {},
  fetchImpl: typeof fetch = fetch,
): Promise<BrevoResult> {
  const listId = brevoListId();
  if (!brevoConfigured() || !listId) return { ok: false, error: 'Brevo is not configured.' };
  try {
    const { status, body } = await call('/contacts', { method: 'POST', body: { email, listIds: [listId], updateEnabled: true, attributes } }, fetchImpl);
    if (status === 201 || status === 204) return { ok: true, id: body && 'id' in body ? String(body.id) : null };
    return { ok: false, error: `Brevo answered ${status}${body?.message ? `: ${String(body.message)}` : ''}.` };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Brevo request failed.' };
  }
}

/** Takes the contact off the list; a contact Brevo does not know is already off it. */
export async function brevoRemoveContact(email: string, fetchImpl: typeof fetch = fetch): Promise<BrevoResult> {
  const listId = brevoListId();
  if (!brevoConfigured() || !listId) return { ok: false, error: 'Brevo is not configured.' };
  try {
    const { status, body } = await call(`/contacts/lists/${listId}/contacts/remove`, { method: 'POST', body: { emails: [email] } }, fetchImpl);
    if (status === 201 || status === 204 || status === 404) return { ok: true, id: null };
    return { ok: false, error: `Brevo answered ${status}${body?.message ? `: ${String(body.message)}` : ''}.` };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Brevo request failed.' };
  }
}

export type MarketingMessage = {
  to: string;
  subject: string;
  text: string;
  /** The recipient's own unsubscribe link; printed in the body and sent as List-Unsubscribe. */
  unsubscribeUrl: string;
};

/**
 * The one marketing send. Refuses without a confirmed consent, refuses non-allowlisted
 * recipients outside production, and always carries one-click unsubscribe headers.
 */
export async function brevoSendMarketing(
  message: MarketingMessage,
  consentStatus: string,
  fetchImpl: typeof fetch = fetch,
): Promise<BrevoResult> {
  if (consentStatus !== 'confirmed') return { ok: false, error: 'No confirmed marketing consent for this address.' };
  if (!emailRecipientAllowed(env.APP_ENV, message.to, env.TEST_EMAIL_ALLOWLIST))
    return { ok: false, error: 'Recipient is not in the non-production test allowlist.' };
  const sender = brevoSender();
  if (!brevoConfigured() || !sender) return { ok: false, error: 'Brevo is not configured.' };
  const text = `${message.text.trimEnd()}\n\nUnsubscribe: ${message.unsubscribeUrl}\n`;
  try {
    const { status, body } = await call(
      '/smtp/email',
      {
        method: 'POST',
        body: {
          sender,
          to: [{ email: message.to }],
          subject: appEnv() === 'production' ? message.subject : `[TEST] ${message.subject}`,
          textContent: text,
          headers: {
            'List-Unsubscribe': `<${message.unsubscribeUrl}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        },
      },
      fetchImpl,
    );
    if (status === 201) return { ok: true, id: body && 'messageId' in body ? String(body.messageId) : null };
    return { ok: false, error: `Brevo answered ${status}${body?.message ? `: ${String(body.message)}` : ''}.` };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Brevo request failed.' };
  }
}
