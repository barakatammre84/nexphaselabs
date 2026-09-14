import { env } from 'cloudflare:workers';

export { RUO_ACKNOWLEDGEMENT, RUO_VERSION, TERMS_VERSION } from '@/lib/policy';

/**
 * Owner-controlled switches, read from Worker vars. Defaults are the
 * institutional-only posture in CLAUDE.md; nothing here is decided in code.
 */

/**
 * Whether researcher (non-institutional) accounts may sign up and see list pricing.
 * Reads RESEARCHER_TIER_ENABLED; CONSUMER_TIER_ENABLED is honoured as a legacy alias.
 */
export function researcherTierEnabled(): boolean {
  return env.RESEARCHER_TIER_ENABLED === 'true' || env.CONSUMER_TIER_ENABLED === 'true';
}
/** @deprecated use researcherTierEnabled */
export const consumerTierEnabled = researcherTierEnabled;

/** Owner-requested guest checkout. Rollout is explicit per environment. */
export function openCheckoutEnabled(): boolean {
  return env.OPEN_CHECKOUT_ENABLED === 'true';
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
