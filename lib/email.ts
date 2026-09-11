import { env } from 'cloudflare:workers';
import { appEnv } from '@/lib/site-config';
import { deliverEmail, emailProviderConfigurationError } from '@/lib/email-provider';

/**
 * Transactional email.
 *
 * Provider: Google Workspace Gmail API or Resend over HTTPS. Without a
 * configured provider, in development the message is logged so the verification
 * link can be read from the console; in staging/production it is an error,
 * because a sign-up that never receives its verification mail is a dead end.
 *
 * Nothing here composes marketing content. Every message is a transactional
 * notice tied to an account action.
 */

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
};

export type EmailResult = { ok: true; id: string | null } | { ok: false; error: string };

const FROM_DEFAULT = 'NexPhase Labs <research@nexphaselabs.net>';

export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  const from = env.EMAIL_FROM || FROM_DEFAULT;
  const configurationError = emailProviderConfigurationError(message.to);
  if (configurationError) {
    if (
      appEnv() === 'development' &&
      configurationError === 'Email provider is not configured.'
    ) {
      console.info(`[email:dev] to=${message.to} subject=${JSON.stringify(message.subject)}\n${message.text}`);
      return { ok: true, id: null };
    }
    console.error('[email] provider is not ready; message not sent', {
      to: message.to,
      subject: message.subject,
    });
    return { ok: false, error: configurationError };
  }
  const result = await deliverEmail(
    {
      from,
      to: [message.to],
      subject:
        appEnv() === 'production' ? message.subject : `[TEST] ${message.subject}`,
      text: message.text,
    },
    `immediate:${crypto.randomUUID()}`,
  );
  return result.ok
    ? { ok: true, id: result.providerId }
    : { ok: false, error: result.error };
}
