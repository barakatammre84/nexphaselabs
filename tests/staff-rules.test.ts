import { describe, expect, it } from 'vitest';
import { oneTimePassword, validateStaffInput } from '@/lib/staff-rules';
import {
  STAFF_PERMISSION_KEYS,
  STAFF_ROLE_PERMISSIONS,
  roleHasPermission,
} from '@/lib/staff-roles';

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

describe('three-person authority matrix', () => {
  it('gives every authority to a named template without duplicates', () => {
    for (const permissions of Object.values(STAFF_ROLE_PERMISSIONS)) {
      expect(new Set(permissions).size).toBe(permissions.length);
      expect(permissions.every((permission) => STAFF_PERMISSION_KEYS.includes(permission))).toBe(true);
    }
    expect(STAFF_PERMISSION_KEYS.every((permission) =>
      Object.values(STAFF_ROLE_PERMISSIONS).some((permissions) => permissions.includes(permission)),
    )).toBe(true);
  });

  it('keeps quality and fulfillment authority separated', () => {
    expect(roleHasPermission('qc', 'quality.manage')).toBe(true);
    expect(roleHasPermission('qc', 'fulfillment.manage')).toBe(false);
    expect(roleHasPermission('ops', 'fulfillment.manage')).toBe(true);
    expect(roleHasPermission('ops', 'quality.manage')).toBe(false);
    expect(roleHasPermission('ops', 'staff.manage')).toBe(false);
  });

  it('keeps financial and sensitive-report authority with admin only', () => {
    expect(roleHasPermission('admin', 'finance.manage')).toBe(true);
    expect(roleHasPermission('admin', 'reports.sensitive')).toBe(true);
    expect(roleHasPermission('qc', 'finance.manage')).toBe(false);
    expect(roleHasPermission('qc', 'reports.sensitive')).toBe(false);
    expect(roleHasPermission('ops', 'finance.manage')).toBe(false);
    expect(roleHasPermission('ops', 'reports.sensitive')).toBe(false);
  });
});
