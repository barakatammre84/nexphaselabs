import { describe, expect, it } from 'vitest';
import { visibilityFor } from '@/lib/visibility-rules';

/**
 * Owner decision of 16 September 2026: the storefront is open (any registered
 * account may order) but requires an account. The only rule change is the
 * anonymous visitor; signed-in accounts keep the open-checkout answers.
 */
describe('visibilityFor with ACCOUNT_REQUIRED', () => {
  const researcher = { tier: 'researcher' as const, verificationStatus: 'none', acknowledgementsCurrent: true };
  const wholesale = { tier: 'institutional' as const, verificationStatus: 'approved', acknowledgementsCurrent: true };

  it('sends an anonymous visitor to sign in instead of showing prices or stock', () => {
    expect(visibilityFor(null, true, true, true)).toEqual({
      signedIn: false,
      pricing: 'none',
      availability: false,
      reason: 'sign_in',
    });
  });

  it('keeps the open-checkout answer for signed-in accounts', () => {
    expect(visibilityFor(researcher, true, true, true)).toMatchObject({ signedIn: true, pricing: 'researcher', availability: true, reason: null });
    expect(visibilityFor(wholesale, true, true, true)).toMatchObject({ signedIn: true, pricing: 'institutional', availability: true, reason: null });
    // An unapproved wholesale applicant sees list pricing, exactly as in plain open checkout.
    expect(visibilityFor({ ...wholesale, verificationStatus: 'submitted' }, true, true, true)).toMatchObject({ pricing: 'researcher' });
  });

  it('changes nothing when the storefront is closed or when guests are still allowed', () => {
    expect(visibilityFor(null, true, false, true)).toMatchObject({ pricing: 'none', reason: 'anonymous' });
    expect(visibilityFor(null, true, true, false)).toMatchObject({ pricing: 'researcher', availability: true, reason: null });
  });
});
