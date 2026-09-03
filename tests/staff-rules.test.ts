import { describe, expect, it } from 'vitest';
import { oneTimePassword, validateStaffInput } from '@/lib/staff-rules';

describe('validateStaffInput', () => {
  it('normalises and accepts a valid person', () => {
    const r = validateStaffInput({ email: ' QC@NexPhaseLabs.net ', name: '  Ada   Lovelace ', role: 'qc' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ email: 'qc@nexphaselabs.net', name: 'Ada Lovelace', role: 'qc' });
  });
  it('refuses bad email, name and role', () => {
    expect(validateStaffInput({ email: 'nope', name: 'Ada', role: 'qc' }).ok).toBe(false);
    expect(validateStaffInput({ email: 'a@b.co', name: 'A', role: 'qc' }).ok).toBe(false);
    expect(validateStaffInput({ email: 'a@b.co', name: 'Ada', role: 'superuser' }).ok).toBe(false);
  });
});

describe('oneTimePassword', () => {
  it('is 20 characters, passes the policy and avoids look-alikes', () => {
    for (let i = 0; i < 50; i++) {
      const p = oneTimePassword();
      expect(p).toHaveLength(20);
      expect(p).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789]+$/);
    }
    expect(new Set(Array.from({ length: 20 }, oneTimePassword)).size).toBe(20);
  });
});
