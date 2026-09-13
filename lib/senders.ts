import { env } from 'cloudflare:workers';

/**
 * Sender scheme.
 *
 * One address for everything ("research@") makes every reply land in one
 * unowned inbox and gives a customer no way to tell an order notice from a
 * quality notice. Each purpose has its own sender, and the mailbox behind it
 * has a named owner in the operating charter:
 *
 *   orders@    fulfilment and shipping notices          — operations (Fatima)
 *   support@   feedback, contact-form and case replies   — operations (Fatima)
 *   accounts@  sign-up, verification, password, approval — operations
 *   quality@   COA / lot notices, recalls, corrections   — quality (Melissa)
 *
 * The scheme is OFF until EMAIL_SENDER_SCHEME=purpose, because a Gmail API
 * sender that is not an approved "send as" alias is silently rewritten by
 * Google to the authenticated mailbox, and Resend requires the domain to be
 * verified. Until the aliases exist every purpose falls back to EMAIL_FROM.
 * Per-purpose overrides (EMAIL_FROM_ORDERS …) win over the defaults.
 */
export type SenderPurpose = 'orders' | 'support' | 'accounts' | 'quality';

const DEFAULTS: Record<SenderPurpose, string> = {
  orders: 'NexPhase Labs Orders <orders@nexphaselabs.net>',
  support: 'NexPhase Labs Support <support@nexphaselabs.net>',
  accounts: 'NexPhase Labs Accounts <accounts@nexphaselabs.net>',
  quality: 'NexPhase Labs Quality <quality@nexphaselabs.net>',
};

const FALLBACK = 'NexPhase Labs <research@nexphaselabs.net>';

export function senderSchemeEnabled(): boolean {
  return env.EMAIL_SENDER_SCHEME === 'purpose';
}

export function senderFor(purpose: SenderPurpose): string {
  if (!senderSchemeEnabled()) return env.EMAIL_FROM || FALLBACK;
  const override = {
    orders: env.EMAIL_FROM_ORDERS,
    support: env.EMAIL_FROM_SUPPORT,
    accounts: env.EMAIL_FROM_ACCOUNTS,
    quality: env.EMAIL_FROM_QUALITY,
  }[purpose];
  return override || DEFAULTS[purpose];
}

/** Reply-To is the mailbox a human reads, even when the sending identity is a shared relay. */
export function replyToFor(purpose: SenderPurpose): string | null {
  if (!senderSchemeEnabled()) return null;
  const address = senderFor(purpose).match(/<([^>]+)>/)?.[1] ?? senderFor(purpose);
  return address;
}
