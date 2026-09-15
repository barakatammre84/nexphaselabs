/**
 * Customer-facing wording for the two ways to buy, in one place so it changes
 * once (Chapter 19 §19.4 #5).
 *
 * Researchers buy from the storefront, as guests or with an account. The
 * institutional path — purchase orders, net terms, an application read by a
 * person — is called WHOLESALE on the storefront; the code keeps calling it
 * "institutional" and "organisation", which is fine, because the customer never
 * sees the code. Nothing here says "verified research organisation": that was
 * the language of the institutional-only era and it reads as a wall to the
 * researcher the store is for.
 */
export const STOREFRONT_COPY = {
  /** Product page, prices hidden because the visitor is not signed in and the storefront is not yet open. */
  pricingAnonymous:
    'Prices and current lot availability are shown to wholesale accounts while the storefront is being prepared. Every application is read by a person against our research-use policy.',
  pricingAnonymousAction: 'Apply for a wholesale account',
  /** Product page, an account whose wholesale application is not yet approved. */
  pricingUnverified: 'Prices and lot availability appear once your wholesale application has been approved.',
  pricingUnverifiedStart: 'Complete your wholesale application',
  pricingUnverifiedView: 'View your application',
  /** Product page, the researcher tier is switched off for this environment. */
  pricingResearcherClosed:
    'Prices are shown to wholesale accounts while the storefront is being prepared. Email research@nexphaselabs.net and we will tell you when researcher ordering opens.',
  /** Orders API, a non-wholesale account tried to order while the storefront is closed. */
  orderingWholesaleOnly:
    'Ordering is open to wholesale accounts while the storefront is being prepared. Email research@nexphaselabs.net.',
  orderingUnapproved: 'Your wholesale application has not been approved yet.',
  /** lib/orders.ts, the same refusal at the transaction boundary. */
  orderingRequiresWholesale: 'Ordering requires an approved wholesale account.',
  /** Cart page and delivery quotes, before shipping and tax quoting are set up. Staff see what is missing on /manage/readiness. */
  orderingNotOpen: 'Online ordering is not open yet. Email research@nexphaselabs.net with any questions about an order.',
  /** Cart page, wholesale ship-to. */
  wholesaleAddressOnly: 'The address on the wholesale account is the only shipping address. Email research@nexphaselabs.net to change it.',
  wholesaleApplyPrompt: 'Ordering is open to wholesale accounts while the storefront is being prepared.',
  wholesaleApplyAction: 'Complete your wholesale application',
  /** Notification to an account when the application is approved. */
  wholesaleApproved: (legalName: string) => `${legalName} now has an approved wholesale account with NexPhase Labs.`,
} as const;
