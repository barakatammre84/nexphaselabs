/**
 * The documents a person agrees to, and their versions. Pure constants, safe
 * to import from static pages. Bump a version whenever its text changes; every
 * account records the version it accepted, and a stale version must be
 * re-accepted before the account can be used. Every order records the versions
 * in force when it was placed.
 *
 * 2026-09-14: the acknowledgement gained the age line and the qualified-
 * purchaser line; the terms, returns, shipping and privacy pages were rewritten
 * to the structure a researcher-facing store needs (see Chapter 20 of the
 * launch register). Versions bumped accordingly.
 */

export const GUEST_CHECKOUT_TERMS_VERSION = '2026-09-14-guest';
export const TERMS_VERSION = '2026-09-14';
export const RUO_VERSION = '2026-09-14';
export const RETURNS_VERSION = '2026-09-14';
export const SHIPPING_VERSION = '2026-09-14';
// Bump when the privacy text changes for visitors — including the first time CF_WEB_ANALYTICS_TOKEN is set (§5).
export const PRIVACY_VERSION = '2026-09-14';
export const RESEARCH_USE_POLICY_VERSION = '2026-09-14';

/** Minimum age to enter the storefront, open an account or place an order. */
export const MINIMUM_AGE = 21;

/**
 * Same-day dispatch cut-off shown on the shipping policy and the FAQ.
 * SIMULATED answer (launch decision log, 14 Sep 2026): the operations owner
 * confirms the hour before the storefront opens. Change it here only.
 */
export const SHIPPING_CUTOFF = '2:00 PM Pacific';

/** The age affirmation, verbatim. A separate checkbox at sign-up and checkout; recorded on the account and on the order. */
export const AGE_STATEMENT = `I am at least ${MINIMUM_AGE} years of age.`;

/** The research-use acknowledgement, verbatim. Shown at sign-up, at checkout and on /legal/research-use. */
export const RUO_ACKNOWLEDGEMENT =
  'I confirm that I am purchasing for laboratory research, that I have the training and facilities to handle research materials safely, and that any material supplied will be used strictly for in vitro laboratory research. It will not be administered to humans or animals, will not be used for diagnostic or therapeutic purposes, will not be incorporated into any food, drug, cosmetic or supplement, and will not be resold to consumers. I understand NexPhase Labs provides no dosing guidance, reconstitution or administration protocols, or medical advice of any kind, and that an order indicating any other use will be refused.';

/**
 * The site-entry notice, verbatim. Shown once per browser as an interstitial;
 * not stored against a person. The enforceable affirmations are the two
 * checkboxes at sign-up and checkout, which are recorded.
 */
export const ENTRY_NOTICE = {
  title: 'Research materials for laboratory use',
  body: `This site supplies research materials to researchers. By entering you confirm that you are at least ${MINIMUM_AGE} years of age and that you are here to buy for laboratory research. Nothing sold here is for human or animal use, and no dosing or administration guidance is given.`,
  accept: `I am ${MINIMUM_AGE} or older and a researcher — enter`,
  decline: 'Leave',
} as const;

/** Where a disclosure appears along the customer journey, and whether it is recorded. Rendered on /legal/compliance. */
export const DISCLOSURE_WORKFLOW = [
  { step: 'Entering the site', disclosure: 'Age and research-use interstitial (ENTRY_NOTICE)', recorded: 'Browser cookie only; nothing about a person is stored' },
  { step: 'Every product page and the catalog', disclosure: 'The regulatory statement above the fold, in the body of the page', recorded: 'Not applicable' },
  { step: 'Creating an account', disclosure: 'Age affirmation, research-use acknowledgement and terms — three required boxes', recorded: 'Account: age confirmed at, acknowledgement version and time, terms version and time' },
  { step: 'Checkout, every order', disclosure: 'Age affirmation and research-use acknowledgement with the terms — two required boxes', recorded: 'Order: acknowledgement version, wording hash, time, connecting address, age confirmed, research setting' },
  { step: 'Order confirmation email', disclosure: 'The acknowledgement and terms versions accepted, restated', recorded: 'Order record: acknowledgement version and wording hash' },
  { step: 'The parcel', disclosure: 'Regulatory statement on the packing slip; certificate of analysis for the lot in the parcel', recorded: 'Packing slip and the certificate pinned to the order, with its checksum' },
  { step: 'Support conversations', disclosure: 'Dosing, reconstitution and administration questions are declined; misuse ends service', recorded: 'Feedback queue record' },
] as const;
