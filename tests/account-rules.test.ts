import { describe, expect, it } from 'vitest';
import { acknowledgementsCurrent, isFreeMailDomain, normaliseEmail, validateSignIn, validateSignUp } from '@/lib/account-rules';
import { RUO_VERSION, TERMS_VERSION } from '@/lib/policy';

describe('acknowledgementsCurrent', () => {
  it('is true only when both versions match the current ones', () => {
    expect(acknowledgementsCurrent({ termsVersion: TERMS_VERSION, ruoVersion: RUO_VERSION })).toBe(true);
    expect(acknowledgementsCurrent({ termsVersion: '2020-01-01', ruoVersion: RUO_VERSION })).toBe(false);
    expect(acknowledgementsCurrent({ termsVersion: TERMS_VERSION, ruoVersion: null })).toBe(false);
  });
});

const good = {
  name: 'Dr Ada Lovelace',
  email: 'ada@example-university.edu',
  password: 'a long enough password',
  tier: 'institutional',
  acceptTerms: true,
  acceptRuo: true,
};

describe('validateSignUp', () => {
  it('accepts an institutional sign-up on an organisation domain', () => {
    const r = validateSignUp(good, false);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.email).toBe('ada@example-university.edu');
  });

  it('normalises email case and whitespace', () => {
    const r = validateSignUp({ ...good, email: '  Ada@Example-University.EDU ' }, false);
    expect(r.ok && r.value.email).toBe('ada@example-university.edu');
  });

  it('rejects free mailboxes for institutional accounts', () => {
    const r = validateSignUp({ ...good, email: 'ada@gmail.com' }, false);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/own domain/);
  });

  it('refuses consumer accounts unless the owner enables the tier', () => {
    expect(validateSignUp({ ...good, tier: 'consumer', email: 'ada@gmail.com' }, false).ok).toBe(false);
    expect(validateSignUp({ ...good, tier: 'consumer', email: 'ada@gmail.com' }, true).ok).toBe(true);
  });

  it('requires both acknowledgements, a name, and a 12+ character password', () => {
    expect(validateSignUp({ ...good, acceptRuo: false }, false).ok).toBe(false);
    expect(validateSignUp({ ...good, acceptTerms: false }, false).ok).toBe(false);
    expect(validateSignUp({ ...good, name: 'A' }, false).ok).toBe(false);
    expect(validateSignUp({ ...good, password: 'short' }, false).ok).toBe(false);
    expect(validateSignUp({ ...good, tier: 'admin' }, false).ok).toBe(false);
    expect(validateSignUp({ ...good, email: 'not-an-email' }, false).ok).toBe(false);
  });
});

describe('helpers', () => {
  it('detects free mail domains and normalises', () => {
    expect(isFreeMailDomain('x@outlook.com')).toBe(true);
    expect(isFreeMailDomain('x@lab.example.org')).toBe(false);
    expect(normaliseEmail(' A@B.CO ')).toBe('a@b.co');
    expect(validateSignIn({ email: 'A@B.CO', password: 'x' })).toEqual({ email: 'a@b.co', password: 'x' });
    expect(validateSignIn({ email: 'nope', password: 'x' })).toBeNull();
  });
});
