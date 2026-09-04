import { env } from 'cloudflare:workers';
import { appEnv } from '@/lib/site-config';
import { emailRecipientAllowed } from '@/lib/environment-safety';

/**
 * Transactional email.
 *
 * Provider: Resend over HTTPS when RESEND_API_KEY is set (a Worker secret).
 * Without a key, in development the message is logged so the verification
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
  const apiKey = env.RESEND_API_KEY;
  const from = env.EMAIL_FROM || FROM_DEFAULT;

  if (!apiKey) {
    if (appEnv() === 'development') {
      console.info(`[email:dev] to=${message.to} subject=${JSON.stringify(message.subject)}\n${message.text}`);
      return { ok: true, id: null };
    }
    console.error('[email] RESEND_API_KEY is not set; message not sent', { to: message.to, subject: message.subject });
    return { ok: false, error: 'Email is not configured.' };
  }

  if (!emailRecipientAllowed(env.APP_ENV, message.to, env.TEST_EMAIL_ALLOWLIST)) {
    return { ok: false, error: 'Non-production email is limited to approved test recipients.' };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [message.to], subject: appEnv() === 'production' ? message.subject : `[TEST] ${message.subject}`, text: message.text }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.error('[email] provider rejected message', response.status, body.slice(0, 300));
      return { ok: false, error: `Provider returned ${response.status}.` };
    }
    const data = (await response.json().catch(() => ({}))) as { id?: string };
    return { ok: true, id: data.id ?? null };
  } catch (error) {
    console.error('[email] send failed', error instanceof Error ? error.message : error);
    return { ok: false, error: 'Email could not be sent.' };
  }
}
