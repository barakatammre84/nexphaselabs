import { env } from 'cloudflare:workers';

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

/** Versions of the documents a person agrees to. Bump when the text changes. */
export const TERMS_VERSION = '2026-09-02';
export const RUO_VERSION = '2026-09-02';

/**
 * The research-use acknowledgement, verbatim. Recorded against the account
 * with its version at sign-up.
 */
export const RUO_ACKNOWLEDGEMENT =
  'I confirm that any material supplied will be used strictly for laboratory research, will not be administered to humans or animals, will not be used for diagnostic or therapeutic purposes, and will not be resold to consumers. I understand NexPhase Labs provides no dosing guidance, administration protocols or medical advice of any kind.';
