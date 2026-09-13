import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localD1 } from './helpers/local-d1';

const { env } = vi.hoisted(() => ({ env: {} as { DB?: D1Database } }));
vi.mock('cloudflare:workers', () => ({ env }));

import { getDb } from '@/db';
import { staffUsers } from '@/db/schema';
import {
  CONTROL_DEFINITIONS,
  assignControlOwners,
  controlHistory,
  listOperationalControls,
  planControlAssignments,
  updateOperationalControl,
} from '@/lib/operational-controls';
import { STAFF_ROLES } from '@/lib/staff-roles';
import type { StaffPrincipal } from '@/lib/staff-auth';

/**
 * 16.5: thirty launch-critical controls, none of them populated. Seeding them is
 * only safe if it cannot manufacture a readiness decision on the way through —
 * so these tests care as much about what the assignment does NOT do.
 */

let local: ReturnType<typeof localD1>;
const admin = { id: 'staff_admin', name: 'Ammre', role: 'admin' } as StaffPrincipal;
const quality = { id: 'staff_qc', name: 'Quality lead', role: 'qc' } as StaffPrincipal;
const operations = { id: 'staff_ops', name: 'Operations lead', role: 'ops' } as StaffPrincipal;
const everyone = [admin, quality, operations];

async function addStaff(people: StaffPrincipal[]) {
  for (const person of people) {
    await getDb().insert(staffUsers).values({
      id: person.id,
      email: `${person.id}@example.invalid`,
      name: person.name,
      role: person.role,
      passwordHash: 'unused',
      active: true,
    });
  }
}

const peopleList = (people: StaffPrincipal[]) =>
  people.map((person) => ({ id: person.id, name: person.name, role: person.role }));

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-12T12:00:00Z'));
  local = localD1();
  env.DB = local.binding;
  await addStaff(everyone);
});

afterEach(() => {
  local.sqlite.close();
  delete env.DB;
  vi.useRealTimers();
});

describe('planning the assignment', () => {
  it('gives every control a seat, and only the three real seats', () => {
    expect(CONTROL_DEFINITIONS).toHaveLength(30);
    for (const definition of CONTROL_DEFINITIONS) {
      expect(STAFF_ROLES).toContain(definition.suggestedRole);
    }
    // the load is shared: no seat carries the whole register
    for (const role of STAFF_ROLES) {
      expect(CONTROL_DEFINITIONS.filter((d) => d.suggestedRole === role).length).toBeGreaterThan(3);
    }
  });

  it('proposes the person holding the seat the control belongs to', async () => {
    const proposals = planControlAssignments(await listOperationalControls(), peopleList(everyone));
    const staging = proposals.find((p) => p.key === 'access.staging')!;
    const lot = proposals.find((p) => p.key === 'quality.lot')!;
    const shipping = proposals.find((p) => p.key === 'shipping.carriers')!;
    expect([staging.ownerId, staging.basis]).toEqual([admin.id, 'suggested-seat']);
    expect([lot.ownerId, lot.basis]).toEqual([quality.id, 'suggested-seat']);
    expect([shipping.ownerId, shipping.basis]).toEqual([operations.id, 'suggested-seat']);
  });

  it('says so when nobody holds the seat instead of silently picking anyone', async () => {
    const proposals = planControlAssignments(await listOperationalControls(), peopleList([admin]));
    const lot = proposals.find((p) => p.key === 'quality.lot')!;
    expect(lot.ownerId).toBe(admin.id);
    expect(lot.basis).toBe('no-one-in-that-seat');
  });

  it('proposes nobody when there is no active staff account', async () => {
    const proposals = planControlAssignments(await listOperationalControls(), []);
    expect(proposals.every((proposal) => proposal.ownerId === null)).toBe(true);
    expect(proposals.every((proposal) => proposal.basis === 'nobody-available')).toBe(true);
  });

  it('leaves an already-owned control alone', async () => {
    await updateOperationalControl(
      'quality.lot',
      { status: 'in_progress', ownerId: quality.id, dueOn: '2026-09-30' },
      admin,
    );
    const proposals = planControlAssignments(await listOperationalControls(), peopleList(everyone));
    const lot = proposals.find((p) => p.key === 'quality.lot')!;
    expect(lot.basis).toBe('already-assigned');
    expect(lot.ownerId).toBe(quality.id);
  });
});

describe('applying the assignment', () => {
  const everyControl = (dueOn = '2026-09-26') =>
    CONTROL_DEFINITIONS.map((definition) => ({
      key: definition.key,
      ownerId:
        definition.suggestedRole === 'admin'
          ? admin.id
          : definition.suggestedRole === 'qc'
            ? quality.id
            : operations.id,
      dueOn,
    }));

  it('assigns all thirty with an owner and a due date, and nothing else', async () => {
    const result = await assignControlOwners(everyControl(), admin);
    expect(result.assigned).toHaveLength(30);
    expect(result.failures).toEqual([]);

    const controls = await listOperationalControls();
    expect(controls.every((control) => control.ownerId !== null)).toBe(true);
    expect(controls.every((control) => control.dueOn !== null)).toBe(true);
    // the decisions seeding must never make
    expect(controls.every((control) => control.status === 'not_started')).toBe(true);
    expect(controls.every((control) => control.evidenceUrl === null)).toBe(true);
    expect(controls.some((control) => control.status === 'ready')).toBe(false);
  });

  it('writes one attributed history event per control, never a silent write', async () => {
    await assignControlOwners(everyControl(), admin);
    const history = await controlHistory(300);
    expect(history).toHaveLength(30);
    expect(history.every((event) => event.actor.includes(admin.name))).toBe(true);
    expect(history.every((event) => event.fromStatus === 'not_started')).toBe(true);
  });

  it('refuses a non-administrator', async () => {
    const result = await assignControlOwners(everyControl(), operations);
    expect(result.assigned).toEqual([]);
    expect(result.failures[0].error).toContain('administrator');
    expect((await listOperationalControls()).every((c) => c.ownerId === null)).toBe(true);
  });

  it('is safe to run twice: the second pass changes nothing', async () => {
    await assignControlOwners(everyControl(), admin);
    const second = await assignControlOwners(everyControl(), admin);
    expect(second.assigned).toEqual([]);
    expect(second.unchanged).toHaveLength(30);
    expect(await controlHistory(300)).toHaveLength(30);
  });

  it('preserves work already recorded against a control', async () => {
    await updateOperationalControl(
      'continuity.backup',
      {
        status: 'in_progress',
        ownerId: admin.id,
        dueOn: '2026-09-20',
        note: 'Rehearsal driver written; waiting on credentials.',
      },
      admin,
    );
    await assignControlOwners([{ key: 'continuity.backup', ownerId: admin.id, dueOn: '2026-09-26' }], admin);
    const control = (await listOperationalControls()).find((c) => c.key === 'continuity.backup')!;
    expect(control.status).toBe('in_progress');
    expect(control.note).toContain('waiting on credentials');
    expect(control.dueOn?.toISOString().slice(0, 10)).toBe('2026-09-26');
  });

  it('reports a bad row without abandoning the good ones', async () => {
    const result = await assignControlOwners(
      [
        { key: 'governance.launch', ownerId: admin.id, dueOn: '2026-09-26' },
        { key: 'not.a.control', ownerId: admin.id, dueOn: '2026-09-26' },
        { key: 'inventory.count', ownerId: 'staff_departed', dueOn: '2026-09-26' },
        { key: 'shipping.origin', ownerId: operations.id, dueOn: '2026-09-26' },
      ],
      admin,
    );
    expect(result.assigned).toEqual(['governance.launch', 'shipping.origin']);
    expect(result.failures.map((failure) => failure.key)).toEqual(['not.a.control', 'inventory.count']);
    expect(result.failures[1].error).toContain('active staff owner');
  });

  it('rejects a malformed due date rather than storing a guess', async () => {
    const result = await assignControlOwners(
      [{ key: 'governance.launch', ownerId: admin.id, dueOn: '26-09-2026' }],
      admin,
    );
    expect(result.assigned).toEqual([]);
    expect(result.failures[0].error).toContain('real date');
  });
});

describe('the assignment panel', () => {
  const render = async (proposalKeys: string[]) => {
    const { ControlSeedForm } = await import('@/components/manage/control-seed-form');
    const proposals = planControlAssignments(
      await listOperationalControls(),
      peopleList(everyone),
    ).filter((proposal) => proposalKeys.includes(proposal.key));
    return renderToStaticMarkup(
      React.createElement(ControlSeedForm, {
        proposals,
        people: peopleList(everyone),
        defaultDueOn: '2026-09-26',
        action: (async () => ({ errors: [], assigned: 0, unchanged: 0 })) as never,
      }),
    );
  };

  it('lists each unassigned control with its seat and a pre-set owner', async () => {
    const markup = await render(['access.staging', 'quality.lot']);
    expect(markup).toContain('Staging access protected');
    expect(markup).toContain('Business &amp; systems lead');
    expect(markup).toContain('Quality &amp; supply lead');
    expect(markup).toContain('name="owner:access.staging"');
    expect(markup).toContain('Assign 2 unassigned controls');
  });

  it('offers a due date and an owner, and no way to declare a control ready', async () => {
    const markup = await render(['access.staging']);
    expect(markup).toContain('name="dueOn"');
    expect(markup).not.toContain('name="status"');
    expect(markup).not.toContain('name="evidenceUrl"');
    expect(markup.toLowerCase()).not.toContain('>ready<');
  });

  it('renders nothing when every control already has an owner', async () => {
    expect(await render([])).toBe('');
  });
});
