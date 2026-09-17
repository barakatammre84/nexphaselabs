import { env } from 'cloudflare:workers';

export { RUO_ACKNOWLEDGEMENT, RUO_VERSION, TERMS_VERSION } from '@/lib/policy';

/**
 * Owner-controlled switches, read from Worker vars. Defaults are the
 * institutional-only posture in CLAUDE.md; nothing here is decided in code.
 */

/**
 * Whether researcher (non-institutional) accounts may sign up and see list pricing.
 * Reads RESEARCHER_TIER_ENABLED. CONSUMER_TIER_ENABLED is honoured as a legacy alias
 * only while RESEARCHER_TIER_ENABLED is unset or empty, so a leftover
 * CONSUMER_TIER_ENABLED=true cannot override production's explicit "false".
 */
export function researcherTierEnabled(): boolean {
  const explicit = env.RESEARCHER_TIER_ENABLED;
  if (explicit) return explicit === 'true';
  return env.CONSUMER_TIER_ENABLED === 'true';
}
/** @deprecated use researcherTierEnabled */
export const consumerTierEnabled = researcherTierEnabled;

/** Owner-requested guest checkout. Rollout is explicit per environment. */
export function openCheckoutEnabled(): boolean {
  return env.OPEN_CHECKOUT_ENABLED === 'true';
}

/**
 * Owner decision of 16 September 2026: the storefront needs a signed-in
 * account. Anonymous visitors browse chemistry, documentation and policies;
 * prices, released-lot stock and the cart need a research account (email
 * confirmed, acknowledgements current) or an approved wholesale account.
 * While this is true guest checkout stays retired whatever
 * OPEN_CHECKOUT_ENABLED says; the open-checkout order path is what signed-in
 * researchers use.
 */
export function accountRequired(): boolean {
  return env.ACCOUNT_REQUIRED === 'true';
}

export function publicOrigin(): string {
  return (env.PUBLIC_ORIGIN || 'http://localhost:3000').replace(/\/$/, '');
}

/**
 * Legal pages carry a "not yet reviewed by counsel" banner until an owner
 * sets POLICIES_COUNSEL_REVIEWED=true for the environment. The banner is the
 * default so that an unreviewed page can never look reviewed by accident.
 */
export function policiesCounselReviewed(): boolean {
  return env.POLICIES_COUNSEL_REVIEWED === 'true';
}

export function appEnv(): string {
  return env.APP_ENV || 'development';
}
