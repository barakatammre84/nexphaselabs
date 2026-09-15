import { env } from 'cloudflare:workers';
import { replyToFor, senderFor, type SenderPurpose } from '@/lib/senders';
import {
  deliverEmail,
  emailProviderConfigurationError,
  type EmailDeliveryResult,
  type EmailEnvelope,
} from '@/lib/email-provider';

export type NotificationEnvelope = EmailEnvelope;

export function notificationConfigurationError(recipient: string): string | null {
  return emailProviderConfigurationError(recipient);
}

export function notificationEnvelope(
  recipient: string,
  subject: string,
  text: string,
  purpose: SenderPurpose = 'orders',
): NotificationEnvelope {
  const replyTo = replyToFor(purpose);
  return {
    from: senderFor(purpose),
    to: [recipient],
    ...(replyTo ? { replyTo } : {}),
    subject: env.APP_ENV === 'production' ? subject : `[TEST] ${subject}`,
    text,
  };
}

export type DeliveryResult = EmailDeliveryResult;

/** Provider acceptance is not proof of inbox delivery. Retries use the exact
 * frozen payload and stable idempotency key; no message contents are logged. */
export async function deliverNotification(envelope: NotificationEnvelope, key: string): Promise<DeliveryResult> {
  return deliverEmail(envelope, key);
}
