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

export const ACCOUNT_TIERS = ['institutional', 'researcher'] as const;

/** Fixed research-setting list. Descriptive only — never a gate, never a tier. */
export const RESEARCH_SETTINGS = [
  'University or academic institution',
  'Hospital or clinical research facility',
  'Commercial or industrial laboratory',
  'Contract research organisation',
  'Government or national laboratory',
  'Independent or home laboratory',
  'Other research setting',
] as const;
export type ResearchSetting = (typeof RESEARCH_SETTINGS)[number];
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
  /** Optional self-description of where the research happens; one of RESEARCH_SETTINGS or empty. */
  researchSetting?: string;
  acceptTerms: boolean;
  acceptRuo: boolean;
  acceptAge?: boolean;
};

export type SignUpValidation =
  | { ok: true; value: { name: string; email: string; password: string; tier: AccountTier; researchSetting: ResearchSetting | null; ageConfirmed: true } }
  | { ok: false; errors: string[] };

export function validateSignUp(raw: SignUpInput, researcherTierEnabled: boolean): SignUpValidation {
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
  } else if (tier === 'researcher' && !researcherTierEnabled) {
    errors.push('Accounts are currently opened for research organisations only.');
  } else if (tier === 'institutional' && EMAIL_PATTERN.test(email) && isFreeMailDomain(email)) {
    errors.push(
      "An institutional account needs an email address on your organisation's own domain, not a personal mailbox.",
    );
  }

  if (!raw.acceptTerms) errors.push('You must accept the terms of sale.');
  if (!raw.acceptRuo) errors.push('You must confirm the research-use acknowledgement.');
  if (!raw.acceptAge) errors.push('You must confirm that you are at least 21 years of age.');

  const settingRaw = (raw.researchSetting ?? '').trim();
  const researchSetting = (RESEARCH_SETTINGS as readonly string[]).includes(settingRaw) ? (settingRaw as ResearchSetting) : null;
  if (settingRaw && !researchSetting) errors.push('Choose a research setting from the list.');

  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { name, email, password, tier, researchSetting, ageConfirmed: true } };
}

export function validateSignIn(raw: { email: string; password: string }): { email: string; password: string } | null {
  const email = normaliseEmail(raw.email);
  if (!EMAIL_PATTERN.test(email) || !raw.password) return null;
  return { email, password: raw.password };
}
