import { RUO_VERSION, TERMS_VERSION } from '@/lib/policy';
import { passwordPolicyError } from '@/lib/staff-auth-core';

/**
 * True when the account has accepted the current versions of both documents.
 * A stale account must re-accept before pricing, ordering or verification.
 */
export function acknowledgementsCurrent(account: { termsVersion: string | null; ruoVersion: string | null }): boolean {
  return account.termsVersion === TERMS_VERSION && account.ruoVersion === RUO_VERSION;
}

/**
 * Pure validation for account forms. No database, no framework, so it runs
 * in vitest and in the Worker alike.
 */

export const ACCOUNT_TIERS = ['institutional', 'consumer'] as const;
export type AccountTier = (typeof ACCOUNT_TIERS)[number];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Free mailbox providers. An institutional account needs an address on the
 * organisation's own domain; this list is what "own domain" excludes.
 */
export const FREE_MAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.co.uk',
  'ymail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'protonmail.com',
  'proton.me',
  'pm.me',
  'zoho.com',
  'gmx.com',
  'gmx.de',
  'mail.com',
  'yandex.com',
  'fastmail.com',
  'hey.com',
  'tutanota.com',
]);

export function normaliseEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function emailDomain(email: string): string {
  return email.slice(email.lastIndexOf('@') + 1);
}

export function isFreeMailDomain(email: string): boolean {
  return FREE_MAIL_DOMAINS.has(emailDomain(email));
}

export type SignUpInput = {
  name: string;
  email: string;
  password: string;
  tier: string;
  acceptTerms: boolean;
  acceptRuo: boolean;
};

export type SignUpValidation =
  | { ok: true; value: { name: string; email: string; password: string; tier: AccountTier } }
  | { ok: false; errors: string[] };

export function validateSignUp(raw: SignUpInput, consumerTierEnabled: boolean): SignUpValidation {
  const errors: string[] = [];
  const name = raw.name.trim().replace(/\s+/g, ' ');
  const email = normaliseEmail(raw.email);
  const password = raw.password;
  const tier = raw.tier.trim() as AccountTier;

  if (name.length < 2 || name.length > 120) errors.push('Enter your full name.');
  if (!EMAIL_PATTERN.test(email) || email.length > 254) errors.push('Enter a valid email address.');
  const policy = passwordPolicyError(password);
  if (policy) errors.push(policy);

  if (!(ACCOUNT_TIERS as readonly string[]).includes(tier)) {
    errors.push('Choose an account type.');
  } else if (tier === 'consumer' && !consumerTierEnabled) {
    errors.push('Accounts are currently opened for research organisations only.');
  } else if (tier === 'institutional' && EMAIL_PATTERN.test(email) && isFreeMailDomain(email)) {
    errors.push(
      "An institutional account needs an email address on your organisation's own domain, not a personal mailbox.",
    );
  }

  if (!raw.acceptTerms) errors.push('You must accept the terms of sale.');
  if (!raw.acceptRuo) errors.push('You must confirm the research-use acknowledgement.');

  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { name, email, password, tier } };
}

export function validateSignIn(raw: { email: string; password: string }): { email: string; password: string } | null {
  const email = normaliseEmail(raw.email);
  if (!EMAIL_PATTERN.test(email) || !raw.password) return null;
  return { email, password: raw.password };
}
