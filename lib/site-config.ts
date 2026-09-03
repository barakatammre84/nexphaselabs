import { env } from 'cloudflare:workers';

export { RUO_ACKNOWLEDGEMENT, RUO_VERSION, TERMS_VERSION } from '@/lib/policy';

/**
 * Owner-controlled switches, read from Worker vars. Defaults are the
 * institutional-only posture in CLAUDE.md; nothing here is decided in code.
 */

/** Whether consumer (non-institutional) accounts may sign up and see consumer pricing. */
export function consumerTierEnabled(): boolean {
  return env.CONSUMER_TIER_ENABLED === 'true';
}

export function publicOrigin(): string {
  return (env.PUBLIC_ORIGIN || 'http://localhost:3000').replace(/\/$/, '');
}

export function appEnv(): string {
  return env.APP_ENV || 'development';
}
