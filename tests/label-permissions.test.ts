import { describe, expect, it, vi } from 'vitest';

vi.mock('cloudflare:workers', () => ({ env: {} }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

import { canPrintLabels, canRecordResults, type StaffPrincipal } from '@/lib/staff-auth';

const as = (role: StaffPrincipal['role']) => ({ id: `staff_${role}`, name: role, role }) as StaffPrincipal;

describe('container label printing', () => {
  it('lets fulfilment print labels for the vials it fills without granting quality decisions', () => {
    expect(canPrintLabels(as('ops'))).toBe(true);
    expect(canRecordResults(as('ops'))).toBe(false);
  });

  it('keeps label printing for quality and administrators', () => {
    expect(canPrintLabels(as('qc'))).toBe(true);
    expect(canPrintLabels(as('admin'))).toBe(true);
  });
});
