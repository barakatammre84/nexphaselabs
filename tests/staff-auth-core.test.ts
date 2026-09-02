import { describe, expect, it } from 'vitest';
import { hashPassword, passwordPolicyError, randomToken, sha256Hex, verifyPassword } from '@/lib/staff-auth-core';

describe('password hashing', () => {
  it('round-trips and salts', async () => {
    const a = await hashPassword('correct horse battery staple');
    const b = await hashPassword('correct horse battery staple');
    expect(a).not.toEqual(b);
    expect(a.startsWith('pbkdf2$100000$')).toBe(true);
    expect(await verifyPassword('correct horse battery staple', a)).toBe(true);
    expect(await verifyPassword('correct horse battery staple', b)).toBe(true);
  });

  it('rejects wrong passwords and malformed hashes', async () => {
    const h = await hashPassword('correct horse battery staple');
    expect(await verifyPassword('correct horse battery stapl', h)).toBe(false);
    expect(await verifyPassword('', h)).toBe(false);
    expect(await verifyPassword('x', 'not-a-hash')).toBe(false);
    expect(await verifyPassword('x', 'pbkdf2$1$AAAA$AAAA')).toBe(false);
    expect(await verifyPassword('x', 'pbkdf2$100000$***$***')).toBe(false);
  });
});

describe('tokens', () => {
  it('produces 64 hex chars and stable hashes', async () => {
    const t = randomToken();
    expect(t).toMatch(/^[a-f0-9]{64}$/);
    expect(randomToken()).not.toEqual(t);
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('password policy', () => {
  it('requires 12+ characters', () => {
    expect(passwordPolicyError('short')).toMatch(/12/);
    expect(passwordPolicyError('twelve chars!')).toBeNull();
  });
});
