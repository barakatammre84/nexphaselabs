/**
 * The single rule for what a visitor may see. Pure, so it is unit-tested and
 * so every page gets the same answer.
 *
 *  - Anonymous and unverified visitors see chemistry and documentation only.
 *  - A verified institutional account (organisation approved by a person)
 *    sees institutional pricing and released-lot availability.
 *  - A researcher account sees list pricing only while the owner has the
 *    researcher tier enabled; with the flag off it sees nothing extra.
 *  - Stale terms or acknowledgement hide everything until re-accepted.
 */

export type ViewerInput = {
  tier: 'institutional' | 'researcher';
  verificationStatus: string;
  acknowledgementsCurrent: boolean;
} | null;

export type Visibility = {
  signedIn: boolean;
  pricing: 'none' | 'researcher' | 'institutional';
  availability: boolean;
  /** Why pricing is hidden, for the page to explain. */
  reason:
    | 'anonymous'
    | 'sign_in'
    | 'acknowledgement'
    | 'unverified'
    | 'researcher_tier_closed'
    | null;
};

export function visibilityFor(
  viewer: ViewerInput,
  researcherTierEnabled: boolean,
  openCheckout = false,
  accountRequired = false,
): Visibility {
  // Open storefront that requires an account (owner, 16 Sep 2026): the only
  // change from plain open checkout is that a visitor without a session sees
  // no prices or stock and is sent to sign in; signed-in accounts keep the
  // open-checkout rules below.
  if (openCheckout && accountRequired && !viewer)
    return {
      signedIn: false,
      pricing: 'none',
      availability: false,
      reason: 'sign_in',
    };
  if (openCheckout)
    return {
      signedIn: Boolean(viewer),
      pricing:
        viewer?.tier === 'institutional' &&
        viewer.verificationStatus === 'approved'
          ? 'institutional'
          : 'researcher',
      availability: true,
      reason: null,
    };
  if (!viewer)
    return {
      signedIn: false,
      pricing: 'none',
      availability: false,
      reason: 'anonymous',
    };
  if (!viewer.acknowledgementsCurrent) {
    return {
      signedIn: true,
      pricing: 'none',
      availability: false,
      reason: 'acknowledgement',
    };
  }
  if (viewer.tier === 'institutional') {
    if (viewer.verificationStatus === 'approved') {
      return {
        signedIn: true,
        pricing: 'institutional',
        availability: true,
        reason: null,
      };
    }
    return {
      signedIn: true,
      pricing: 'none',
      availability: false,
      reason: 'unverified',
    };
  }
  if (researcherTierEnabled)
    return {
      signedIn: true,
      pricing: 'researcher',
      availability: true,
      reason: null,
    };
  return {
    signedIn: true,
    pricing: 'none',
    availability: false,
    reason: 'researcher_tier_closed',
  };
}

export function priceFor(
  variant: {
    listPriceCents: number | null;
    institutionalPriceCents: number | null;
  },
  pricing: Visibility['pricing'],
): number | null {
  if (pricing === 'institutional') return variant.institutionalPriceCents;
  if (pricing === 'researcher') return variant.listPriceCents;
  return null;
}

export function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
