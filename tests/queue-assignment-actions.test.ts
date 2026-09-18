import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { localD1 } from './helpers/local-d1';

const staff = {
  id: 'stf_aaaaaaaaaaaaaaaa',
  email: 'quality@example.invalid',
  name: 'Quality Lead',
  role: 'admin' as const,
  sessionId: 'session_test',
  mustChangePassword: false,
};
const { env } = vi.hoisted(() => ({ env: {} as { DB?: D1Database } }));

vi.mock('cloudflare:workers', () => ({ env }));
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ host: 'example.test', origin: 'https://example.test' }),
}));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock('@/lib/staff-auth', () => ({
  getStaff: async () => staff,
  canFulfil: () => true,
  canRecordResults: () => true,
  canVerifyAccounts: () => true,
}));
vi.mock('@/lib/waitlist', () => ({ notifyWaitlist: vi.fn() }));

import { getDb } from '@/db';
import { accounts, lots, organizations, staffUsers } from '@/db/schema';
import { assignLotAction } from '@/app/manage/lots/actions';
import { assignVerificationAction } from '@/app/manage/verification/actions';

let local: ReturnType<typeof localD1>;

beforeEach(async () => {
  local = localD1();
  env.DB = local.binding;
  await getDb().insert(staffUsers).values({
    id: staff.id,
    email: staff.email,
    name: staff.name,
    passwordHash: 'disabled',
    role: staff.role,
    createdBy: 'test',
  });
  await getDb().insert(lots).values({
    id: 'lot_action_assignment',
    lotNumber: 'ACTION-001',
    productCode: 'TEST',
    productName: 'Test material',
    casNumber: '1-2-3',
    receivedAt: new Date('2026-09-17T12:00:00Z'),
  });
  await getDb().insert(accounts).values({
    id: 'account_action_assignment',
    email: 'applicant@example.invalid',
    name: 'Applicant',
    passwordHash: 'disabled',
  });
  await getDb().insert(organizations).values({
    id: 'org_actionassignment',
    accountId: 'account_action_assignment',
    legalName: 'Action Research',
    website: 'https://action.example.invalid',
    emailDomain: 'action.example.invalid',
    organizationType: 'analytical_lab',
    addressLine1: '1 Test Way',
    city: 'Test',
    region: 'CA',
    postalCode: '00000',
    country: 'US',
    researchContext: 'Testing',
    receivingParty: 'Applicant',
    submittedAt: new Date('2026-09-17T12:00:00Z'),
  });
});

afterEach(() => {
  local.sqlite.close();
  delete env.DB;
});

function assignmentForm() {
  const data = new FormData();
  data.set('ownerId', staff.id);
  data.set('due', '2026-09-25');
  return data;
}

describe('queue assignment server actions', () => {
  it('accepts a real-format staff id submitted by the lot owner dropdown', async () => {
    await expect(assignLotAction('ACTION-001', { values: {}, errors: [], violations: [] }, assignmentForm()))
      .rejects.toThrow('REDIRECT:/manage/lots/ACTION-001?assigned=1');
    const [lot] = await getDb().select().from(lots).where(eq(lots.id, 'lot_action_assignment'));
    expect(lot).toMatchObject({ assignedTo: staff.id, assignedName: staff.name });
  });

  it('accepts a real-format staff id submitted by the verification owner dropdown', async () => {
    await expect(assignVerificationAction('org_actionassignment', { values: {}, errors: [], violations: [] }, assignmentForm()))
      .rejects.toThrow('REDIRECT:/manage/verification/org_actionassignment?assigned=1');
    const [organization] = await getDb().select().from(organizations).where(eq(organizations.id, 'org_actionassignment'));
    expect(organization).toMatchObject({ assignedTo: staff.id, assignedName: staff.name });
  });
});