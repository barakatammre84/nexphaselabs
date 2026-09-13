import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localD1 } from './helpers/local-d1';

const { env } = vi.hoisted(() => ({ env: {} as { DB?: D1Database } }));
vi.mock('cloudflare:workers', () => ({ env }));

import { getDb } from '@/db';
import { operationalControls, staffUsers } from '@/db/schema';
import {
  CONTROL_DEFINITIONS,
  controlHistory,
  listOperationalControls,
  operationalControlSummary,
  updateOperationalControl,
} from '@/lib/operational-controls';
import type { StaffPrincipal } from '@/lib/staff-auth';

let local: ReturnType<typeof localD1>;
const admin = {
  id: 'staff_admin',
  name: 'Synthetic admin',
  role: 'admin',
} as StaffPrincipal;
const owner = {
  id: 'staff_owner',
  name: 'Synthetic owner',
  role: 'ops',
} as StaffPrincipal;
const other = {
  id: 'staff_other',
  name: 'Synthetic other',
  role: 'qc',
} as StaffPrincipal;
const key = 'inventory.loaded';

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
      active: true,
    });
  }
});

afterEach(() => {
  local.sqlite.close();
  delete env.DB;
  vi.useRealTimers();
});

describe('operating control register', () => {
  it('shows every definition as an open control without inventing database rows', async () => {
    const controls = await listOperationalControls();
    expect(controls).toHaveLength(CONTROL_DEFINITIONS.length);
    expect(controls.every((control) => control.status === 'not_started')).toBe(true);
    expect(operationalControlSummary(controls).launchOpen).toBe(
      CONTROL_DEFINITIONS.filter((control) => control.launchCritical).length,
    );
    expect(local.sqlite.prepare('SELECT count(*) AS n FROM operational_controls').get()!.n).toBe(0);
  });

  it('requires an active owner before work starts and records one attributed event', async () => {
    expect(
      (
        await updateOperationalControl(
          key,
          { status: 'in_progress' },
          admin,
        )
      ).ok,
    ).toBe(false);
    expect(
      (
        await updateOperationalControl(
          key,
          {
            status: 'in_progress',
            ownerId: owner.id,
            dueOn: '2026-09-15',
            note: 'Physical count scheduled.',
          },
          admin,
        )
      ).ok,
    ).toBe(true);
    const [control] = await listOperationalControls();
    const saved = (await listOperationalControls()).find((item) => item.key === key)!;
    expect(control).toBeDefined();
    expect(saved.ownerName).toBe(owner.name);
    expect(saved.dueOn?.toISOString().slice(0, 10)).toBe('2026-09-15');
    const history = await controlHistory();
    expect(history).toHaveLength(1);
    expect(history[0].actor).toContain(admin.name);
  });

  it('lets the assigned owner submit evidence but reserves readiness and waivers for admins', async () => {
    await updateOperationalControl(
      key,
      { status: 'in_progress', ownerId: owner.id },
      admin,
    );
    expect(
      (
        await updateOperationalControl(
          key,
          { status: 'awaiting_review', evidenceUrl: '' },
          owner,
        )
      ).ok,
    ).toBe(false);
    expect(
      (
        await updateOperationalControl(
          key,
          {
            status: 'awaiting_review',
            evidenceUrl: 'https://example.invalid/evidence/physical-count',
          },
          owner,
        )
      ).ok,
    ).toBe(true);
    expect(
      (
        await updateOperationalControl(
          key,
          {
            status: 'ready',
            evidenceUrl: 'https://example.invalid/evidence/physical-count',
          },
          owner,
        )
      ).ok,
    ).toBe(false);
    expect(
      (
        await updateOperationalControl(
          key,
          {
            status: 'ready',
            ownerId: owner.id,
            evidenceUrl: 'https://example.invalid/evidence/physical-count',
          },
          admin,
        )
      ).ok,
    ).toBe(true);
    expect((await listOperationalControls()).find((item) => item.key === key)?.status).toBe('ready');
  });

  it('refuses unassigned staff, invalid evidence, and unexplained blockers or waivers', async () => {
    await updateOperationalControl(
      key,
      { status: 'in_progress', ownerId: owner.id },
      admin,
    );
    expect((await updateOperationalControl(key, { status: 'blocked' }, owner)).ok).toBe(false);
    expect(
      (
        await updateOperationalControl(
          key,
          { status: 'awaiting_review', evidenceUrl: 'javascript:alert(1)' },
          owner,
        )
      ).ok,
    ).toBe(false);
    expect(
      (
        await updateOperationalControl(
          key,
          { status: 'in_progress' },
          other,
        )
      ).ok,
    ).toBe(false);
    expect(
      (
        await updateOperationalControl(
          key,
          { status: 'not_applicable', ownerId: owner.id },
          admin,
        )
      ).ok,
    ).toBe(false);
  });

  it('rejects a stale update without recording false history', async () => {
    await updateOperationalControl(
      key,
      { status: 'in_progress', ownerId: owner.id },
      admin,
    );
    local.beforeNextBatch(() =>
      local.sqlite
        .prepare("UPDATE operational_controls SET last_change_id = 'other-change'")
        .run(),
    );
    expect(
      (
        await updateOperationalControl(
          key,
          { status: 'blocked', ownerId: owner.id, note: 'Awaiting count sheets.' },
          admin,
        )
      ).ok,
    ).toBe(false);
    expect((await controlHistory()).length).toBe(1);
    expect(
      (await getDb().select().from(operationalControls))[0].status,
    ).toBe('in_progress');
  });
});
