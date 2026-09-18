import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  signUp: vi.fn(),
  completeGoogleSignUp: vi.fn(),
  requestConsent: vi.fn(),
}));

vi.mock('@/lib/account-auth', () => ({
  signUp: mocks.signUp,
  accountCookie: () => 'nx_account=session; Path=/',
  safeAccountReturnPath: (value: string) => value || '/account',
}));
vi.mock('@/lib/google-accounts', () => ({ completeGoogleSignUp: mocks.completeGoogleSignUp }));
vi.mock('@/lib/google-signin', () => ({
  PENDING_COOKIE: 'nx_google_pending',
  clearedCookie: () => 'nx_google_pending=; Max-Age=0; Path=/',
  openPendingIdentity: async () => ({
    subject: 'google-subject',
    email: 'researcher@gmail.com',
    emailVerified: true,
    name: 'Researcher',
  }),
}));
vi.mock('@/lib/site-config', () => ({ researcherTierEnabled: () => true }));
vi.mock('@/lib/staff-auth', () => ({ sameOrigin: () => true, urlIsSecure: () => true }));
vi.mock('@/lib/turnstile', () => ({ verifyTurnstile: async () => ({ ok: true }) }));
vi.mock('@/lib/rate-limit', () => ({
  allow: async () => true,
  clientAddress: () => 'test-address',
  rateLimitKey: (...parts: string[]) => parts.join(':'),
}));
vi.mock('@/lib/marketing-consent', () => ({
  requestConsent: mocks.requestConsent,
  confirmConsentForAccount: vi.fn(),
}));
vi.mock('@/lib/affiliates', () => ({ bindReferral: vi.fn() }));
vi.mock('@/lib/referral-cookie', () => ({ readReferralCookie: () => null }));

import { POST as passwordSignUp } from '@/app/api/account/sign-up/route';
import { POST as googleCompletion } from '@/app/api/account/complete/route';

const ORIGIN = 'https://store.example.test';

function post(path: string, fields: Record<string, string>, cookie?: string): Request {
  return new Request(`${ORIGIN}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      ...(cookie ? { cookie } : {}),
    },
    body: new URLSearchParams(fields),
  });
}

const passwordFields = {
  name: 'Ada Researcher',
  email: 'ada@gmail.com',
  password: 'a long enough password',
  tier: 'researcher',
  accept_terms: 'on',
};

const googleFields = {
  tier: 'researcher',
  accept_terms: 'on',
  return_to: '/account',
};

beforeEach(() => {
  mocks.signUp.mockReset().mockResolvedValue({ ok: true, accountId: 'acc_1', emailSent: true });
  mocks.completeGoogleSignUp.mockReset().mockImplementation(async (
    _identity: unknown,
    input: { acceptRuo: boolean; acceptAge: boolean },
  ) => {
    const errors = [
      ...(!input.acceptRuo ? ['You must confirm the research-use acknowledgement.'] : []),
      ...(!input.acceptAge ? ['You must confirm that you are at least 21 years of age.'] : []),
    ];
    return errors.length
      ? { ok: false, errors }
      : { ok: true, accountId: 'acc_google', token: 'token', expiresAt: new Date('2030-01-01') };
  });
  mocks.requestConsent.mockReset();
});

describe('password researcher sign-up route', () => {
  it('maps the combined checkbox to both consents and passes a null DOB to signUp', async () => {
    const response = await passwordSignUp(
      post('/api/account/sign-up', { ...passwordFields, accept_research_age: 'on' }),
    );

    expect(response.status).toBe(303);
    expect(mocks.signUp).toHaveBeenCalledOnce();
    expect(mocks.signUp.mock.calls[0][0]).toMatchObject({
      tier: 'researcher',
      email: 'ada@gmail.com',
      dateOfBirth: null,
    });
    // The validator consumes the form consents; successful invocation proves
    // that the one posted checkbox supplied both required affirmations.
    expect(new URL(response.headers.get('location')!).pathname).toBe('/account/check-email');
    expect(mocks.requestConsent).not.toHaveBeenCalled();
  });

  it('does not infer age or RUO consent from accepting terms', async () => {
    const response = await passwordSignUp(post('/api/account/sign-up', passwordFields));
    const location = new URL(response.headers.get('location')!);

    expect(location.searchParams.get('codes')).toContain('research-use acknowledgement');
    expect(location.searchParams.get('codes')).toContain('at least 21 years of age');
    expect(mocks.signUp).not.toHaveBeenCalled();
  });

  it('continues to accept the two legacy consent fields', async () => {
    const response = await passwordSignUp(
      post('/api/account/sign-up', { ...passwordFields, accept_age: 'on', accept_ruo: 'on' }),
    );

    expect(response.status).toBe(303);
    expect(mocks.signUp).toHaveBeenCalledOnce();
  });
});

describe('Google completion route', () => {
  it('maps the combined checkbox to both completion consents without a DOB', async () => {
    const response = await googleCompletion(
      post(
        '/api/account/complete',
        { ...googleFields, accept_research_age: 'on' },
        'nx_google_pending=sealed',
      ),
    );

    expect(response.status).toBe(303);
    expect(mocks.completeGoogleSignUp.mock.calls[0][1]).toMatchObject({
      tier: 'researcher',
      dateOfBirth: '',
      acceptTerms: true,
      acceptAge: true,
      acceptRuo: true,
    });
    expect(mocks.requestConsent).not.toHaveBeenCalled();
  });

  it('rejects terms-only completion and supports legacy consent fields', async () => {
    const rejected = await googleCompletion(post('/api/account/complete', googleFields, 'nx_google_pending=sealed'));
    expect(mocks.completeGoogleSignUp.mock.calls[0][1]).toMatchObject({
      acceptTerms: true,
      acceptAge: false,
      acceptRuo: false,
    });
    const rejectedLocation = new URL(rejected.headers.get('location')!);
    expect(rejectedLocation.searchParams.get('codes')).toContain('research-use acknowledgement');
    expect(rejectedLocation.searchParams.get('codes')).toContain('at least 21 years of age');

    const legacy = await googleCompletion(
      post(
        '/api/account/complete',
        { ...googleFields, accept_age: 'on', accept_ruo: 'on' },
        'nx_google_pending=sealed',
      ),
    );
    expect(mocks.completeGoogleSignUp.mock.calls[1][1]).toMatchObject({
      acceptAge: true,
      acceptRuo: true,
    });
    expect(new URL(legacy.headers.get('location')!).pathname).toBe('/account');
  });

  it('preserves the institutional tier on a validation-error redirect', async () => {
    mocks.completeGoogleSignUp.mockResolvedValueOnce({ ok: false, errors: ['Enter your date of birth.'] });
    const response = await googleCompletion(
      post(
        '/api/account/complete',
        { ...googleFields, tier: 'institutional', accept_research_age: 'on' },
        'nx_google_pending=sealed',
      ),
    );
    const location = new URL(response.headers.get('location')!);

    expect(location.pathname).toBe('/account/complete');
    expect(location.searchParams.get('tier')).toBe('institutional');
    expect(location.searchParams.get('return_to')).toBe('/account');
    expect(location.searchParams.get('codes')).toContain('date of birth');
  });
});