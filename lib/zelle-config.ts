import { env } from 'cloudflare:workers';
import { livePaymentsAllowed } from '@/lib/environment-safety';

export const ZELLE_DEFAULT_RECIPIENT = 'orders@nexphaselabs.net';

export type ZelleMode =
  | 'disabled'
  | 'manual'
  | 'shadow'
  | 'supervised'
  | 'automatic';

export function zelleMode(): ZelleMode {
  const value = String(env.ZELLE_MODE ?? 'disabled').trim().toLowerCase();
  return ['manual', 'shadow', 'supervised', 'automatic'].includes(value)
    ? (value as ZelleMode)
    : 'disabled';
}

function email(value: string | undefined): string {
  const normalized = String(value ?? '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalized) ? normalized : '';
}

export function zelleConfig() {
  const recipientEmail =
    email(env.ZELLE_RECIPIENT_EMAIL) || ZELLE_DEFAULT_RECIPIENT;
  const recipientName = String(env.ZELLE_RECIPIENT_NAME ?? '').trim();
  const mailbox = email(env.ZELLE_GMAIL_MAILBOX);
  const senders = String(env.ZELLE_CHASE_SENDERS ?? '')
    .split(',')
    .map((value) => email(value))
    .filter(Boolean);
  const qr = String(env.ZELLE_QR_IMAGE_PATH ?? '').trim();
  const qrImagePath = /^\/payments\/[A-Za-z0-9_.-]+\.(?:png|jpe?g|webp)$/iu.test(qr)
    ? qr
    : null;
  return {
    mode: zelleMode(),
    recipientEmail,
    recipientName,
    mailbox,
    senders: [...new Set(senders)],
    qrImagePath,
  };
}

export function zelleCheckoutEnabled(): boolean {
  const config = zelleConfig();
  return (
    livePaymentsAllowed(env.APP_ENV) &&
    config.mode !== 'disabled' &&
    Boolean(config.recipientEmail && config.recipientName)
  );
}

export function zelleInboxEnabled(): boolean {
  const config = zelleConfig();
  return (
    livePaymentsAllowed(env.APP_ENV) &&
    ['shadow', 'supervised', 'automatic'].includes(config.mode) &&
    Boolean(config.mailbox && config.senders.length)
  );
}

/** Presence only: safe for staff UI. Secret values are never returned. */
export function zelleConfigurationStatus() {
  const config = zelleConfig();
  const missing: string[] = [];
  if (config.mode === 'disabled') missing.push('ZELLE_MODE');
  if (!config.recipientName) missing.push('ZELLE_RECIPIENT_NAME');
  if (['shadow', 'supervised', 'automatic'].includes(config.mode)) {
    if (!config.mailbox) missing.push('ZELLE_GMAIL_MAILBOX');
    if (!config.senders.length) missing.push('ZELLE_CHASE_SENDERS');
    if (!env.ZELLE_GMAIL_OAUTH_REFRESH_TOKEN)
      missing.push('ZELLE_GMAIL_OAUTH_REFRESH_TOKEN');
    if (
      !(env.ZELLE_GMAIL_OAUTH_CLIENT_ID || env.GOOGLE_WORKSPACE_OAUTH_CLIENT_ID)
    )
      missing.push('ZELLE_GMAIL_OAUTH_CLIENT_ID');
    if (
      !(
        env.ZELLE_GMAIL_OAUTH_CLIENT_SECRET ||
        env.GOOGLE_WORKSPACE_OAUTH_CLIENT_SECRET
      )
    )
      missing.push('ZELLE_GMAIL_OAUTH_CLIENT_SECRET');
  }
  return {
    mode: config.mode,
    recipientEmail: config.recipientEmail,
    recipientNameConfigured: Boolean(config.recipientName),
    qrConfigured: Boolean(config.qrImagePath),
    inboxConfigured: zelleInboxEnabled(),
    checkoutEnabled: zelleCheckoutEnabled(),
    missing,
  };
}
