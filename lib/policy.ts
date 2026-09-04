/**
 * The documents a person agrees to, and their versions. Pure constants, safe
 * to import from static pages. Bump a version whenever its text changes; every
 * account records the version it accepted, and a stale version must be
 * re-accepted before the account can be used.
 */

export const GUEST_CHECKOUT_TERMS_VERSION = '2026-09-04-guest';
export const TERMS_VERSION = '2026-09-02';
export const RUO_VERSION = '2026-09-02';

/** The research-use acknowledgement, verbatim. Shown at sign-up and on /legal/terms. */
export const RUO_ACKNOWLEDGEMENT =
  'I confirm that any material supplied will be used strictly for laboratory research, will not be administered to humans or animals, will not be used for diagnostic or therapeutic purposes, and will not be resold to consumers. I understand NexPhase Labs provides no dosing guidance, administration protocols or medical advice of any kind.';
