import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import {
  operationalControlEvents,
  operationalControls,
  staffUsers,
  type OperationalControl,
  type OperationalControlEvent,
} from '@/db/schema';
import type { StaffPrincipal } from '@/lib/staff-auth';
import type { StaffRole } from '@/lib/staff-roles';
import { randomToken } from '@/lib/staff-auth-core';
import {
  CONTROL_STATUSES,
  type ControlStatus,
} from '@/lib/operational-control-rules';
export {
  CONTROL_STATUSES,
  CONTROL_STATUS_LABEL,
  type ControlStatus,
} from '@/lib/operational-control-rules';

export type ControlDefinition = {
  key: string;
  area: string;
  title: string;
  description: string;
  /**
   * Which seat the three-person operating model puts this control under
   * (docs/THREE_PERSON_OPERATING_MODEL_2026-09-09.md). It is a starting point for
   * the assignment screen, not an assignment: an administrator chooses the person
   * and can override every row before applying.
   */
  suggestedRole: StaffRole;
  launchCritical: boolean;
};

/**
 * The controlled readiness library. New definitions appear as not started;
 * code never infers approval from configuration or transactional data.
 */
export const CONTROL_DEFINITIONS: ControlDefinition[] = [
  { key: 'governance.authority', area: 'Governance', title: 'Authority matrix approved', description: 'Named commercial, quality, operations, finance and systems authorities match the operating charter.', suggestedRole: 'admin', launchCritical: true },
  { key: 'governance.launch', area: 'Governance', title: 'Member launch decision recorded', description: 'Authorized members record the decision, scope, date and accepted residual risks.', suggestedRole: 'admin', launchCritical: true },
  { key: 'access.staff', area: 'Access', title: 'Staff access reviewed', description: 'Active accounts, permissions, recovery access and leavers are reviewed against current responsibilities.', suggestedRole: 'admin', launchCritical: true },
  { key: 'access.staging', area: 'Access', title: 'Staging access protected', description: 'Public staging pages are open by owner decision and marked noindex; staff pages and private APIs refuse anonymous requests, proven on the direct host after every deploy.', suggestedRole: 'admin', launchCritical: true },
  { key: 'catalog.prices', area: 'Catalog', title: 'Prices approved and loaded', description: 'Every offered pack has an owner-approved price and effective-date evidence.', suggestedRole: 'admin', launchCritical: true },
  { key: 'catalog.documents', area: 'Catalog', title: 'Product files complete', description: 'Approved product facts, source evidence, SDS and publication decision are linked for each offered product.', suggestedRole: 'qc', launchCritical: true },
  { key: 'supplier.approved', area: 'Procurement', title: 'Representative supplier qualified', description: 'Identity, facility/manufacturer information, quality documents, commercial terms and reviewer decision are complete.', suggestedRole: 'qc', launchCritical: true },
  { key: 'procurement.process', area: 'Procurement', title: 'Purchasing and AP process approved', description: 'PO authority, transmission, receiving match, supplier invoice review and payment approval are defined.', suggestedRole: 'admin', launchCritical: true },
  { key: 'inventory.loaded', area: 'Inventory', title: 'Physical inventory reconciled', description: 'Every physical container is recorded by lot, quantity, condition and location; variances are resolved.', suggestedRole: 'ops', launchCritical: true },
  { key: 'inventory.count', area: 'Inventory', title: 'Cycle-count process rehearsed', description: 'A count, variance investigation and approved adjustment are completed from the procedure.', suggestedRole: 'ops', launchCritical: true },
  { key: 'quality.specifications', area: 'Quality', title: 'Release specifications approved', description: 'Applicable tests, methods, acceptance limits, reviewer competence and testing-standard version are approved.', suggestedRole: 'qc', launchCritical: true },
  { key: 'quality.lot', area: 'Quality', title: 'Representative lot released', description: 'Receipt, quarantine, documents, tests, review, label and named release are complete with real evidence.', suggestedRole: 'qc', launchCritical: true },
  { key: 'quality.exception', area: 'Quality', title: 'Exception and countersign rule approved', description: 'Exceptional release triggers, prohibited overrides, second approver and escalation are explicit.', suggestedRole: 'qc', launchCritical: true },
  { key: 'quality.recall', area: 'Quality', title: 'Recall and CAPA rehearsal passed', description: 'One synthetic case proves containment, consignee identification, communication, action tracking and closure.', suggestedRole: 'qc', launchCritical: true },
  { key: 'customer.policy', area: 'Customer', title: 'Customer eligibility policy approved', description: 'Production guest/institutional eligibility, verification, restricted uses and decision authority are explicit.', suggestedRole: 'admin', launchCritical: true },
  { key: 'orders.rehearsal', area: 'Orders', title: 'Complete order workflow rehearsed', description: 'Accepted total, payment, allocation, documents, fulfillment, tracking, return and refund reconcile.', suggestedRole: 'ops', launchCritical: true },
  { key: 'payment.live', area: 'Finance', title: 'Payment and refund rail proven', description: 'Approved provider/account, settlement identification, refund, exception recovery and daily reconciliation are evidenced.', suggestedRole: 'admin', launchCritical: true },
  { key: 'tax.approved', area: 'Finance', title: 'Tax treatment approved and tested', description: 'Nexus/taxability advice, provider configuration, calculation evidence and filing responsibility are recorded.', suggestedRole: 'admin', launchCritical: true },
  { key: 'finance.close', area: 'Finance', title: 'Month-end close rehearsed', description: 'Bank/provider, sales, refunds, inventory, AP/AR and tax balances reconcile to approved books.', suggestedRole: 'admin', launchCritical: true },
  { key: 'shipping.origin', area: 'Fulfillment', title: 'Origin and parcel profiles validated', description: 'Ship-from/return address, packed weights, dimensions, handling and restricted-material rules are approved.', suggestedRole: 'ops', launchCritical: true },
  { key: 'shipping.carriers', area: 'Fulfillment', title: 'Carrier rates and labels proven', description: 'Approved USPS/UPS/FedEx services are quoted and a sandbox label/void/handoff is evidenced.', suggestedRole: 'ops', launchCritical: true },
  { key: 'email.delivery', area: 'Customer service', title: 'Customer messaging proven', description: 'Approved sender, receipts/updates, inbox delivery, bounce handling and queue owner are evidenced.', suggestedRole: 'admin', launchCritical: true },
  { key: 'service.process', area: 'Customer service', title: 'Complaint and escalation process rehearsed', description: 'Ownership, response target, quality escalation, return/refund and closure evidence are tested.', suggestedRole: 'ops', launchCritical: true },
  { key: 'continuity.backup', area: 'Continuity', title: 'Backup and restore rehearsed', description: 'Database and document backups restore into an isolated environment within approved recovery targets.', suggestedRole: 'admin', launchCritical: true },
  { key: 'continuity.incident', area: 'Continuity', title: 'Incident and rollback rehearsal passed', description: 'Named response roles, containment, communication, rollback, evidence preservation and review are exercised.', suggestedRole: 'admin', launchCritical: true },
  { key: 'legal.counsel', area: 'External approvals', title: 'Regulatory counsel review recorded', description: 'The business model, catalog, claims, terms, facility and launch conditions have current counsel disposition.', suggestedRole: 'admin', launchCritical: true },
  { key: 'external.insurance', area: 'External approvals', title: 'Insurance coverage evidenced', description: 'Approved coverage, limits, exclusions, carrier, policy period and renewal owner are recorded.', suggestedRole: 'admin', launchCritical: true },
  { key: 'external.facility', area: 'External approvals', title: 'Facility and zoning evidence complete', description: 'Operating location, zoning/use, safety arrangements and any required local approvals are evidenced.', suggestedRole: 'admin', launchCritical: true },
  { key: 'hazcom.program', area: 'Safety', title: 'Hazard communication program effective', description: 'Written program, SDS access, labels, inventory and training are approved, issued and acknowledged.', suggestedRole: 'qc', launchCritical: true },
  { key: 'records.sops', area: 'Document control', title: 'SOP library issued and trained', description: 'Controlled manuals match the verified system and named operators have completed walkthroughs.', suggestedRole: 'qc', launchCritical: true },
];

const definitionByKey = new Map(CONTROL_DEFINITIONS.map((item) => [item.key, item]));

export type OperationalControlView = ControlDefinition & {
  status: ControlStatus;
  ownerId: string | null;
  ownerName: string | null;
  dueOn: Date | null;
  evidenceUrl: string | null;
  note: string | null;
  lastChangeId: string | null;
  updatedBy: string | null;
  updatedAt: Date | null;
};

export type ControlUpdateInput = {
  status: string;
  ownerId?: string | null;
  dueOn?: string | null;
  evidenceUrl?: string | null;
  note?: string | null;
};

export type ControlUpdateResult = { ok: true } | { ok: false; error: string };

const actor = (staff: StaffPrincipal) => `${staff.name} (${staff.id})`;
const id = (prefix: string) => `${prefix}_${randomToken().slice(0, 24)}`;

export async function listOperationalControls(): Promise<OperationalControlView[]> {
  const rows = await getDb().select().from(operationalControls);
  const states = new Map(rows.map((row) => [row.key, row]));
  return CONTROL_DEFINITIONS.map((definition) => {
    const row = states.get(definition.key);
    return {
      ...definition,
      status: (row?.status ?? 'not_started') as ControlStatus,
      ownerId: row?.ownerId ?? null,
      ownerName: row?.ownerName ?? null,
      dueOn: row?.dueOn ?? null,
      evidenceUrl: row?.evidenceUrl ?? null,
      note: row?.note ?? null,
      lastChangeId: row?.lastChangeId ?? null,
      updatedBy: row?.updatedBy ?? null,
      updatedAt: row?.updatedAt ?? null,
    };
  });
}

export async function controlHistory(limit = 100): Promise<OperationalControlEvent[]> {
  return getDb()
    .select()
    .from(operationalControlEvents)
    .orderBy(desc(operationalControlEvents.createdAt))
    .limit(Math.max(1, Math.min(limit, 300)));
}

export async function assignableStaff(): Promise<{ id: string; name: string; role: string }[]> {
  return getDb()
    .select({ id: staffUsers.id, name: staffUsers.name, role: staffUsers.role })
    .from(staffUsers)
    .where(eq(staffUsers.active, true))
    .orderBy(asc(staffUsers.name));
}

function parseDate(value: string | null | undefined): Date | null | 'bad' {
  const text = (value ?? '').trim();
  if (!text) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return 'bad';
  const date = new Date(`${text}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text
    ? 'bad'
    : date;
}

function evidenceUrl(value: string | null | undefined): string | null | 'bad' {
  const text = (value ?? '').trim();
  if (!text) return null;
  if (text.length > 500) return 'bad';
  try {
    const url = new URL(text);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : 'bad';
  } catch {
    return 'bad';
  }
}

/**
 * Update one control with an optimistic marker. Assigned owners can prepare
 * evidence and submit for review; only admins can assign owners, waive a
 * control, or make the final ready decision.
 */
export async function updateOperationalControl(
  controlKey: string,
  input: ControlUpdateInput,
  staff: StaffPrincipal,
): Promise<ControlUpdateResult> {
  const definition = definitionByKey.get(controlKey);
  if (!definition) return { ok: false, error: 'Unknown operating control.' };
  if (!(CONTROL_STATUSES as readonly string[]).includes(input.status)) {
    return { ok: false, error: 'Choose a valid status.' };
  }
  const status = input.status as ControlStatus;
  const db = getDb();
  const [current] = await db
    .select()
    .from(operationalControls)
    .where(eq(operationalControls.key, controlKey))
    .limit(1);
  const admin = staff.role === 'admin';
  if (!admin && current?.ownerId !== staff.id) {
    return { ok: false, error: 'Only an administrator or the assigned owner can update this control.' };
  }
  // An owner may keep readiness or a waiver an administrator recorded, never grant one.
  if (!admin && (status === 'ready' || status === 'not_applicable') && status !== current?.status) {
    return { ok: false, error: 'Submit evidence for review; an administrator records readiness or a waiver.' };
  }

  const requestedOwnerId = admin
    ? (input.ownerId ?? '').trim() || null
    : current?.ownerId ?? null;
  let owner: { id: string; name: string } | null = null;
  if (requestedOwnerId) {
    [owner] = await db
      .select({ id: staffUsers.id, name: staffUsers.name })
      .from(staffUsers)
      .where(and(eq(staffUsers.id, requestedOwnerId), eq(staffUsers.active, true)))
      .limit(1);
    if (!owner) return { ok: false, error: 'Choose an active staff owner.' };
  }
  const dueOn = parseDate(input.dueOn);
  if (dueOn === 'bad') return { ok: false, error: 'Due date must be a real date in YYYY-MM-DD format.' };
  const evidence = evidenceUrl(input.evidenceUrl);
  if (evidence === 'bad') return { ok: false, error: 'Evidence must be a complete http or https link (500 characters maximum).' };
  const note = (input.note ?? '').trim().slice(0, 1000) || null;

  if (status !== 'not_started' && !owner) {
    return { ok: false, error: 'Assign an owner before work starts.' };
  }
  if ((status === 'awaiting_review' || status === 'ready') && !evidence) {
    return { ok: false, error: 'Link completion evidence before submitting or marking this control ready.' };
  }
  if ((status === 'blocked' || status === 'not_applicable') && !note) {
    return { ok: false, error: 'Record the blocker or waiver reason.' };
  }

  const now = new Date();
  const marker = id('ctlchg');
  const updatedBy = actor(staff);
  const prior: OperationalControl = current ?? {
    key: controlKey,
    status: 'not_started',
    ownerId: null,
    ownerName: null,
    dueOn: null,
    evidenceUrl: null,
    note: null,
    lastChangeId: null,
    updatedBy,
    updatedAt: now,
  };
  const unchanged =
    prior.status === status &&
    prior.ownerId === owner?.id &&
    prior.dueOn?.getTime() === dueOn?.getTime() &&
    prior.evidenceUrl === evidence &&
    prior.note === note;
  if (unchanged) return { ok: false, error: 'Nothing changed.' };

  const expectedMarker = prior.lastChangeId;
  const eventId = id('ctlev');
  const statements = [
    db
      .insert(operationalControls)
      .values({
        key: controlKey,
        status: 'not_started',
        updatedBy,
        updatedAt: now,
      })
      .onConflictDoNothing(),
    db
      .update(operationalControls)
      .set({
        status,
        ownerId: owner?.id ?? null,
        ownerName: owner?.name ?? null,
        dueOn,
        evidenceUrl: evidence,
        note,
        lastChangeId: marker,
        updatedBy,
        updatedAt: now,
      })
      .where(
        and(
          eq(operationalControls.key, controlKey),
          expectedMarker === null
            ? isNull(operationalControls.lastChangeId)
            : eq(operationalControls.lastChangeId, expectedMarker),
        ),
      )
      .returning({ key: operationalControls.key }),
    db.insert(operationalControlEvents).select(
      db
        .select({
          id: sql<string>`${eventId}`.as('id'),
          controlKey: operationalControls.key,
          fromStatus: sql<string>`${prior.status}`.as('from_status'),
          toStatus: operationalControls.status,
          ownerId: operationalControls.ownerId,
          ownerName: operationalControls.ownerName,
          dueOn: operationalControls.dueOn,
          evidenceUrl: operationalControls.evidenceUrl,
          note: operationalControls.note,
          actor: sql<string>`${updatedBy}`.as('actor'),
          createdAt: sql<number>`${Math.floor(now.getTime() / 1000)}`.as('created_at'),
        })
        .from(operationalControls)
        .where(
          and(
            eq(operationalControls.key, controlKey),
            eq(operationalControls.lastChangeId, marker),
          ),
        ),
    ),
  ];
  const [, updated] = await db.batch(
    statements as unknown as Parameters<typeof db.batch>[0],
  );
  if (!updated || (updated as unknown[]).length === 0) {
    return { ok: false, error: 'This control changed while you were editing. Reload and review the current record.' };
  }
  return { ok: true };
}

/* ---------------------------------------------------------------- seeding */

/**
 * 16.5: thirty launch-critical controls, built and tested, and not one of them
 * populated. The gap was never the schema — it was that assigning thirty owners
 * one form at a time is a job nobody starts.
 *
 * This proposes an owner for every unassigned control from the seat the
 * operating model puts it under, and an administrator applies the list in one
 * action after editing whatever they disagree with. It deliberately assigns
 * **owner and due date only**. Readiness is a person's decision with evidence
 * behind it, and seeding must never manufacture one.
 */
export type ControlAssignmentProposal = ControlDefinition & {
  ownerId: string | null;
  ownerName: string | null;
  basis: 'suggested-seat' | 'no-one-in-that-seat' | 'nobody-available' | 'already-assigned';
};

export function planControlAssignments(
  controls: OperationalControlView[],
  people: { id: string; name: string; role: string }[],
): ControlAssignmentProposal[] {
  const admins = people.filter((person) => person.role === 'admin');
  return controls.map((control) => {
    if (control.ownerId) {
      return { ...control, ownerId: control.ownerId, ownerName: control.ownerName, basis: 'already-assigned' as const };
    }
    const seat = people.find((person) => person.role === control.suggestedRole);
    const fallback = admins[0];
    const chosen = seat ?? fallback ?? null;
    return {
      ...control,
      ownerId: chosen?.id ?? null,
      ownerName: chosen?.name ?? null,
      basis: seat ? ('suggested-seat' as const) : chosen ? ('no-one-in-that-seat' as const) : ('nobody-available' as const),
    };
  });
}

export type ControlAssignmentResult = {
  assigned: string[];
  unchanged: string[];
  failures: { key: string; error: string }[];
};

/**
 * Apply an assignment list. Every row goes through updateOperationalControl, so
 * each one is attributed, history-stamped and subject to the same rules as a
 * single edit — nothing is written straight into the table. Existing status,
 * evidence and notes are carried through untouched.
 */
export async function assignControlOwners(
  assignments: { key: string; ownerId: string; dueOn: string }[],
  staff: StaffPrincipal,
): Promise<ControlAssignmentResult> {
  if (staff.role !== 'admin') {
    return {
      assigned: [],
      unchanged: [],
      failures: [{ key: '*', error: 'Only an administrator assigns control owners.' }],
    };
  }
  const current = new Map((await listOperationalControls()).map((control) => [control.key, control]));
  const result: ControlAssignmentResult = { assigned: [], unchanged: [], failures: [] };
  for (const assignment of assignments) {
    const existing = current.get(assignment.key);
    if (!existing) {
      result.failures.push({ key: assignment.key, error: 'Unknown operating control.' });
      continue;
    }
    const outcome = await updateOperationalControl(
      assignment.key,
      {
        status: existing.status,
        ownerId: assignment.ownerId,
        dueOn: assignment.dueOn,
        evidenceUrl: existing.evidenceUrl,
        note: existing.note,
      },
      staff,
    );
    if (outcome.ok) result.assigned.push(assignment.key);
    else if (outcome.error === 'Nothing changed.') result.unchanged.push(assignment.key);
    else result.failures.push({ key: assignment.key, error: outcome.error });
  }
  return result;
}

export function operationalControlSummary(
  controls: OperationalControlView[],
  staffId?: string,
  now = new Date(),
) {
  const open = controls.filter(
    (item) => item.status !== 'ready' && item.status !== 'not_applicable',
  );
  const launchOpen = open.filter((item) => item.launchCritical);
  const overdue = open.filter(
    (item) => item.dueOn && item.dueOn.getTime() < now.getTime(),
  );
  const awaitingReview = controls.filter(
    (item) => item.status === 'awaiting_review',
  );
  const mine = staffId ? open.filter((item) => item.ownerId === staffId) : [];
  return {
    total: controls.length,
    ready: controls.filter((item) => item.status === 'ready').length,
    open: open.length,
    launchOpen: launchOpen.length,
    overdue: overdue.length,
    awaitingReview: awaitingReview.length,
    mine: mine.length,
  };
}
