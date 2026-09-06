import { env } from 'cloudflare:workers';
import { emailRecipientAllowed } from '@/lib/environment-safety';

export type NotificationEnvelope = { from: string; to: string[]; subject: string; text: string };

export function notificationConfigurationError(recipient: string): string | null {
  if (!env.RESEND_API_KEY) return 'Email provider is not configured.';
  if (!emailRecipientAllowed(env.APP_ENV, recipient, env.TEST_EMAIL_ALLOWLIST)) return 'Recipient is not in the non-production test allowlist.';
  return null;
}

export function notificationEnvelope(recipient: string, subject: string, text: string): NotificationEnvelope {
  return {
    from: env.EMAIL_FROM || 'NexPhase Labs <research@nexphaselabs.net>',
    to: [recipient],
    subject: env.APP_ENV === 'production' ? subject : `[TEST] ${subject}`,
    text,
  };
}

export type DeliveryResult = { ok: true; providerId: string } | { ok: false; error: string; retryable: boolean };

/** Provider acceptance is not proof of inbox delivery. Retries use the exact
 * frozen payload and stable idempotency key; no message contents are logged. */
export async function deliverNotification(envelope: NotificationEnvelope, key: string): Promise<DeliveryResult> {
  const issue = notificationConfigurationError(envelope.to[0]);
  if (issue) return { ok: false, error: issue, retryable: false };
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(10_000),
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': key },
      body: JSON.stringify(envelope),
    });
    if (!response.ok) return { ok: false, error: `Email provider returned ${response.status}.`, retryable: response.status === 408 || response.status === 429 || response.status >= 500 };
    const data = await response.json() as { id?: unknown };
    if (typeof data.id !== 'string' || !data.id) return { ok: false, error: 'Provider acceptance is uncertain; no message reference returned.', retryable: true };
    return { ok: true, providerId: data.id };
  } catch {
    return { ok: false, error: 'Provider response is uncertain after a network error or timeout.', retryable: true };
  }
}
