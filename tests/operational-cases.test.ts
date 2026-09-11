import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localD1 } from './helpers/local-d1';

const { env } = vi.hoisted(() => ({ env: {} as { DB?: D1Database } }));
vi.mock('cloudflare:workers', () => ({ env }));

import { getDb } from '@/db';
import { lots, operationalCaseEvents, staffUsers } from '@/db/schema';
import {
  caseSummary,
  createOperationalCase,
  getOperationalCase,
  updateOperationalCase,
} from '@/lib/operational-cases';
import type { StaffPrincipal } from '@/lib/staff-auth';

let local: ReturnType<typeof localD1>;
const admin = { id: 'admin', name: 'Admin', role: 'admin' } as StaffPrincipal;
const owner = { id: 'owner', name: 'Owner', role: 'ops' } as StaffPrincipal;
const other = { id: 'other', name: 'Other', role: 'qc' } as StaffPrincipal;
const base = {
  type: 'deviation',
  severity: 'medium',
  title: 'Synthetic receiving deviation',
  summary: 'A synthetic count did not match the purchase order.',
  ownerId: owner.id,
  dueOn: '2026-09-15',
};

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-08T12:00:00Z'));
  local = localD1();
  env.DB = local.binding;
  for (const person of [admin, owner, other]) {
    await getDb().insert(staffUsers).values({
      id: person.id,
      email: `${person.id}@example.invalid`,
      name: person.name,
      role: person.role,
      passwordHash: 'unused',
    });
  }
});

afterEach(() => {
  local.sqlite.close();
  delete env.DB;
  vi.useRealTimers();
});

describe('operational case workflow', () => {
  it('creates an assigned case and append-only opening event', async () => {
    const result = await createOperationalCase(base, admin);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const detail = await getOperationalCase(result.caseNumber);
    expect(detail?.record).toMatchObject({ ownerId: owner.id, status: 'open' });
    expect(detail?.events).toHaveLength(1);
    expect(detail?.events[0]).toMatchObject({ action: 'created', toStatus: 'open' });
    expect((await caseSummary(owner.id)).mine).toBe(1);
  });

  it('forces a non-admin creator to own the case', async () => {
    const result = await createOperationalCase({ ...base, ownerId: other.id }, owner);
    if (!result.ok) throw new Error(result.error);
    expect((await getOperationalCase(result.caseNumber))?.record.ownerId).toBe(owner.id);
  });

  it('requires containment before a high-severity case progresses', async () => {
    const made = await createOperationalCase({ ...base, severity: 'high' }, admin);
    if (!made.ok) throw new Error(made.error);
    const current = (await getOperationalCase(made.caseNumber))!.record;
    expect(
      (
        await updateOperationalCase(
          current,
          { ...base, severity: 'high', status: 'investigating' },
          owner,
        )
      ).ok,
    ).toBe(false);
    expect(
      (
        await updateOperationalCase(
          current,
          {
            ...base,
            severity: 'high',
            status: 'contained',
            containment: 'Affected material segregated and access stopped.',
          },
          owner,
        )
      ).ok,
    ).toBe(true);
  });

  it('refuses a recall until its linked lot is held or withdrawn', async () => {
    await getDb().insert(lots).values({
      id: 'lot',
      lotNumber: 'RECALL-LOT',
      productCode: 'NPL-TEST',
      productName: 'Synthetic',
      casNumber: '50-00-0',
      receivedAt: new Date('2026-09-01'),
      status: 'released',
    });
    const recall = { ...base, type: 'recall', linkedLotNumber: 'RECALL-LOT' };
    expect((await createOperationalCase(recall, admin)).ok).toBe(false);
    await getDb().update(lots).set({ status: 'on_hold' });
    expect((await createOperationalCase(recall, admin)).ok).toBe(true);
  });

  it('reserves closure for admins and requires complete closure evidence', async () => {
    const made = await createOperationalCase(base, admin);
    if (!made.ok) throw new Error(made.error);
    const current = (await getOperationalCase(made.caseNumber))!.record;
    expect((await updateOperationalCase(current, { ...base, status: 'closed' }, owner)).ok).toBe(false);
    expect((await updateOperationalCase(current, { ...base, status: 'closed' }, admin)).ok).toBe(false);
    const result = await updateOperationalCase(
      current,
      {
        ...base,
        status: 'closed',
        rootCause: 'Receiving count was copied from the packing slip.',
        correctiveAction: 'The lot was recounted and the variance corrected.',
        preventiveAction: 'Second-person count added to receiving.',
        evidenceUrl: 'https://example.invalid/evidence/case',
        effectivenessCheck: 'Three later receipts matched independent counts.',
        closureSummary: 'Actions completed and effectiveness confirmed.',
      },
      admin,
    );
    expect(result.ok).toBe(true);
    const closed = await getOperationalCase(made.caseNumber);
    expect(closed?.record.status).toBe('closed');
    expect(closed?.record.closedAt).toBeInstanceOf(Date);
  });

  it('blocks unassigned changes and stale concurrent updates without orphan events', async () => {
    const made = await createOperationalCase(base, admin);
    if (!made.ok) throw new Error(made.error);
    const stale = (await getOperationalCase(made.caseNumber))!.record;
    expect(
      (
        await updateOperationalCase(
          stale,
          { ...base, status: 'investigating' },
          other,
        )
      ).ok,
    ).toBe(false);
    expect(
      (
        await updateOperationalCase(
          stale,
          { ...base, status: 'investigating' },
          owner,
        )
      ).ok,
    ).toBe(true);
    expect(
      (
        await updateOperationalCase(
          stale,
          { ...base, status: 'action_required' },
          owner,
        )
      ).ok,
    ).toBe(false);
    expect(await getDb().select().from(operationalCaseEvents)).toHaveLength(2);
  });
});
