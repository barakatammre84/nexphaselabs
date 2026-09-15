import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { env, redirect } = vi.hoisted(() => ({
  env: {} as Record<string, unknown>,
  redirect: vi.fn(),
}));
vi.mock('cloudflare:workers', () => ({ env }));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () =>
    new Headers({ host: 'staff.example.invalid', origin: 'https://staff.example.invalid' }),
}));
vi.mock('next/navigation', () => ({ redirect }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/staff-auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/staff-auth')>()),
  getStaff: async () => ({
    id: 'stf_admin',
    email: 'admin@example.invalid',
    name: 'Synthetic admin',
    role: 'admin',
    sessionId: 'ses_admin',
    mustChangePassword: false,
  }),
}));

import { accountServiceAction } from '@/app/manage/accounts/actions';
import {
  addLotTestAction,
  correctLotAction,
  recordInventoryMovementAction,
  setLotDispositionAction,
} from '@/app/manage/lots/actions';
import {
  purchaseOrderTransitionAction,
  supplierQualificationAction,
} from '@/app/manage/procurement/actions';
import { staffAccountAction } from '@/app/manage/staff/actions';
import { decideVerificationAction } from '@/app/manage/verification/actions';

/**
 * Each of these actions re-reads its record before acting. The read used to sit
 * outside the action's try/catch, so a database error escaped to the framework's
 * error page and took the filled-in form with it. With the database refusing
 * every query, each one must answer with a form message instead.
 */

const outage = () => {
  throw new Error('D1_ERROR: synthetic outage');
};

const form = (fields: Record<string, string> = {}) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};

const blank = { values: {}, errors: [], violations: [] };
const unavailable = { errors: [expect.stringContaining('Try again shortly')] };
let logged: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  env.DB = { prepare: outage, batch: outage, exec: outage } as unknown as D1Database;
  logged = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  expect(redirect).not.toHaveBeenCalled();
  logged.mockRestore();
  delete env.DB;
});

describe('record reads in manage actions', () => {
  it('answers a failed lot read with a form message', async () => {
    await expect(addLotTestAction('LOT-001', blank, form())).resolves.toMatchObject(unavailable);
    await expect(
      setLotDispositionAction('LOT-001', blank, form({ decision: 'hold', reason: 'Synthetic' })),
    ).resolves.toMatchObject(unavailable);
    await expect(
      correctLotAction('LOT-001', blank, form({ reason: 'Synthetic correction' })),
    ).resolves.toMatchObject(unavailable);
    await expect(
      recordInventoryMovementAction('LOT-001', blank, form({ movementType: 'sample', direction: 'decrease' })),
    ).resolves.toMatchObject(unavailable);
    expect(logged).toHaveBeenCalledTimes(4);
  });

  it('answers a failed organization read with a form message', async () => {
    await expect(
      decideVerificationAction('org_abcdefgh', blank, form({ decision: 'approve' })),
    ).resolves.toMatchObject(unavailable);
  });

  it('answers a failed customer account read with a form message', async () => {
    await expect(
      accountServiceAction('acc_abcdef12', { values: {}, errors: [] }, form({ op: 'revoke' })),
    ).resolves.toMatchObject(unavailable);
  });

  it('answers a failed staff account read with a form message', async () => {
    await expect(
      staffAccountAction('stf_abcdef12', { values: {}, errors: [] }, form({ op: 'revoke' })),
    ).resolves.toMatchObject(unavailable);
  });

  it('answers failed supplier and purchase order reads with a form message', async () => {
    await expect(
      supplierQualificationAction('sup_abcdef12', blank, form({ to: 'qualified' })),
    ).resolves.toMatchObject(unavailable);
    await expect(
      purchaseOrderTransitionAction('PO-260915-0001', blank, form({ to: 'sent' })),
    ).resolves.toMatchObject(unavailable);
  });
});
