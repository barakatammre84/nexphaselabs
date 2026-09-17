import { describe, expect, it } from 'vitest';
import { acknowledgementsCurrent, ageOn, isFreeMailDomain, latestBirthDate, normaliseEmail, validateSignIn, validateSignUp } from '@/lib/account-rules';
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
  acceptAge: true,
  dateOfBirth: '1980-01-01',
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
    expect(validateSignUp({ ...good, tier: 'researcher', email: 'ada@gmail.com' }, false).ok).toBe(false);
    expect(validateSignUp({ ...good, tier: 'researcher', email: 'ada@gmail.com' }, true).ok).toBe(true);
  });

  it('requires both acknowledgements, the age statement, a name, and a 12+ character password', () => {
    expect(validateSignUp({ ...good, acceptRuo: false }, false).ok).toBe(false);
    expect(validateSignUp({ ...good, acceptAge: false }, false).ok).toBe(false);
    expect(validateSignUp({ ...good, acceptAge: undefined }, false).ok).toBe(false);
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

describe('date of birth at sign-up', () => {
  const today = new Date('2026-09-16T20:00:00Z');

  it('counts age on the calendar, not by subtracting years', () => {
    expect(ageOn('2005-09-17', today)).toBe(20); // the day before the 21st birthday
    expect(ageOn('2005-09-16', today)).toBe(21); // the birthday itself
    expect(ageOn('2005-09-15', today)).toBe(21);
    expect(ageOn('2004-02-29', today)).toBe(22);
    expect(latestBirthDate(today)).toBe('2005-09-16');
  });

  it('refuses dates that are not real, in the future, or absurdly old', () => {
    for (const bad of ['2005-02-30', '2005-13-01', 'yesterday', '', '2027-01-01', '1850-01-01', '05-09-2005'])
      expect(ageOn(bad, today)).toBeNull();
  });

  it('requires a date of birth and the minimum age, and keeps it in the validated value', () => {
    const ok = validateSignUp(good, false);
    expect(ok.ok && ok.value.dateOfBirth).toBe('1980-01-01');
    const missing = validateSignUp({ ...good, dateOfBirth: '' }, false);
    expect(!missing.ok && missing.errors).toContain('Enter your date of birth.');
    const young = validateSignUp({ ...good, dateOfBirth: latestBirthDate(new Date(Date.now() + 86_400_000)) }, false);
    expect(!young.ok && young.errors.some((e) => e.includes('at least 21 years of age to open an account'))).toBe(true);
  });
});
