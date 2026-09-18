import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { localD1 } from './helpers/local-d1';

const { env } = vi.hoisted(() => ({ env: {} as { DB?: D1Database } }));
vi.mock('cloudflare:workers', () => ({ env }));

import { getDb } from '@/db';
import {
  accounts,
  lotAssignmentEvents,
  lots,
  organizations,
  verificationAssignmentEvents,
  staffUsers,
} from '@/db/schema';
import { assignLot } from '@/lib/lots-admin';
import { assignVerification } from '@/lib/organizations';
import type { StaffPrincipal } from '@/lib/staff-auth';

const staff: StaffPrincipal = {
  id: 'stf_aaaaaaaaaaaaaaaa',
  email: 'quality@example.invalid',
  name: 'Quality Lead',
  role: 'admin',
  sessionId: 'session_test',
  mustChangePassword: false,
};

let local: ReturnType<typeof localD1>;

beforeEach(async () => {
  local = localD1();
  env.DB = local.binding;
  await getDb().insert(staffUsers).values({
    id: staff.id,
    email: staff.email,
    name: staff.name,
    passwordHash: 'disabled',
    role: 'admin',
    createdBy: 'test',
  });
  await getDb().insert(lots).values({
    id: 'lot_assignment',
    lotNumber: 'ASSIGN-001',
    productCode: 'TEST',
    productName: 'Test material',
    casNumber: '1-2-3',
    receivedAt: new Date('2026-09-17T12:00:00Z'),
  });
  await getDb().insert(accounts).values({
    id: 'account_assignment',
    email: 'applicant@example.invalid',
    name: 'Applicant',
    passwordHash: 'disabled',
  });
  await getDb().insert(organizations).values({
    id: 'org_assignment',
    accountId: 'account_assignment',
    legalName: 'Assignment Research',
    website: 'https://assignment.example.invalid',
    emailDomain: 'assignment.example.invalid',
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

describe('queue assignments', () => {
  it('stores and attributes lot assignment history without changing release evidence', async () => {
    const [lot] = await getDb().select().from(lots).where(eq(lots.id, 'lot_assignment'));
    expect(await assignLot(lot, staff.id, new Date('2026-09-21T12:00:00Z'), staff)).toEqual({ ok: true });
    const [updated] = await getDb().select().from(lots).where(eq(lots.id, lot.id));
    const events = await getDb().select().from(lotAssignmentEvents);
    expect(updated.assignedTo).toBe(staff.id);
    expect(updated.assignedName).toBe(staff.name);
    expect(updated.releasedBy).toBeNull();
    expect(events).toHaveLength(1);
    expect(events[0].assignedBy).toBe('Quality Lead (stf_aaaaaaaaaaaaaaaa)');
  });

  it('rejects a stale lot assignment and records only the winner', async () => {
    const [snapshot] = await getDb().select().from(lots).where(eq(lots.id, 'lot_assignment'));
    expect((await assignLot(snapshot, staff.id, new Date('2026-09-21T12:00:00Z'), staff)).ok).toBe(true);
    expect((await assignLot(snapshot, staff.id, new Date('2026-09-22T12:00:00Z'), staff)).ok).toBe(false);
    expect(await getDb().select().from(lotAssignmentEvents)).toHaveLength(1);
  });

  it('rejects an unauthorized lot assignment', async () => {
    const [lot] = await getDb().select().from(lots).where(eq(lots.id, 'lot_assignment'));
    const operations = { ...staff, id: 'stf_bbbbbbbbbbbbbbbb', role: 'ops' as const };
    expect((await assignLot(lot, staff.id, new Date('2026-09-21T12:00:00Z'), operations)).ok).toBe(false);
    expect(await getDb().select().from(lotAssignmentEvents)).toHaveLength(0);
  });

  it('fails closed when the selected owner becomes inactive during the lot handoff', async () => {
    const [lot] = await getDb().select().from(lots).where(eq(lots.id, 'lot_assignment'));
    local.beforeNextBatch(() => {
      local.sqlite.prepare('UPDATE staff_users SET active = 0 WHERE id = ?').run(staff.id);
    });
    expect((await assignLot(lot, staff.id, new Date('2026-09-21T12:00:00Z'), staff)).ok).toBe(false);
    expect(await getDb().select().from(lotAssignmentEvents)).toHaveLength(0);
  });

  it('stores verification assignment history without changing review evidence', async () => {
    const [organization] = await getDb().select().from(organizations).where(eq(organizations.id, 'org_assignment'));
    expect(await assignVerification(organization, staff.id, new Date('2026-09-22T12:00:00Z'), staff)).toEqual({ ok: true });
    const [updated] = await getDb().select().from(organizations).where(eq(organizations.id, organization.id));
    const events = await getDb().select().from(verificationAssignmentEvents);
    expect(updated.assignedTo).toBe(staff.id);
    expect(updated.assignedName).toBe(staff.name);
    expect(updated.reviewedBy).toBeNull();
    expect(events[0].assignedBy).toBe('Quality Lead (stf_aaaaaaaaaaaaaaaa)');
  });
});