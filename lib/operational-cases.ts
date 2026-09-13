import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import {
  lots,
  operationalCaseEvents,
  operationalCases,
  orders,
  staffUsers,
  suppliers,
  type OperationalCase,
  type OperationalCaseEvent,
} from '@/db/schema';
import type { StaffPrincipal } from '@/lib/staff-auth';
import { randomToken } from '@/lib/staff-auth-core';
import {
  CASE_SEVERITIES,
  CASE_STATUSES,
  CASE_TYPES,
  type CaseStatus,
} from '@/lib/operational-case-rules';
export {
  CASE_SEVERITIES,
  CASE_STATUSES,
  CASE_STATUS_LABEL,
  CASE_TYPES,
  CASE_TYPE_LABEL,
  type CaseSeverity,
  type CaseStatus,
  type CaseType,
} from '@/lib/operational-case-rules';

export type CaseInput = {
  type: string;
  severity: string;
  status?: string;
  title: string;
  summary: string;
  ownerId?: string | null;
  dueOn: string;
  linkedLotNumber?: string | null;
  linkedOrderNumber?: string | null;
  linkedSupplierId?: string | null;
  containment?: string | null;
  rootCause?: string | null;
  correctiveAction?: string | null;
  preventiveAction?: string | null;
  evidenceUrl?: string | null;
  effectivenessCheck?: string | null;
  closureSummary?: string | null;
  note?: string | null;
};

export type CaseWriteResult =
  | { ok: true; caseNumber: string }
  | { ok: false; error: string };

const id = (prefix: string) => `${prefix}_${randomToken().slice(0, 24)}`;
const actor = (staff: StaffPrincipal) => `${staff.name} (${staff.id})`;
const clean = (value: string | null | undefined, max: number) =>
  (value ?? '').trim().slice(0, max) || null;

function realDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value
    ? null
    : date;
}

function validEvidence(value: string | null): boolean {
  if (!value) return true;
  try {
    const url = new URL(value);
    return value.length <= 500 && ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
}

async function activeOwner(
  requestedId: string,
): Promise<{ id: string; name: string } | null> {
  const [owner] = await getDb()
    .select({ id: staffUsers.id, name: staffUsers.name })
    .from(staffUsers)
    .where(and(eq(staffUsers.id, requestedId), eq(staffUsers.active, true)))
    .limit(1);
  return owner ?? null;
}

async function validateLinks(input: CaseInput): Promise<string | null> {
  const db = getDb();
  const lotNumber = clean(input.linkedLotNumber, 120);
  const orderNumber = clean(input.linkedOrderNumber, 120);
  const supplierId = clean(input.linkedSupplierId, 120);
  if (input.type === 'recall' && !lotNumber) return 'A recall must link an affected lot.';
  if (lotNumber) {
    const [lot] = await db
      .select({ status: lots.status })
      .from(lots)
      .where(eq(lots.lotNumber, lotNumber))
      .limit(1);
    if (!lot) return 'The linked lot does not exist.';
    if (input.type === 'recall' && !['on_hold', 'withdrawn'].includes(lot.status)) {
      return 'Put the released lot on hold or withdraw it before opening a recall.';
    }
  }
  if (orderNumber) {
    const [order] = await db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.orderNumber, orderNumber))
      .limit(1);
    if (!order) return 'The linked order does not exist.';
  }
  if (supplierId) {
    const [supplier] = await db
      .select({ id: suppliers.id })
      .from(suppliers)
      .where(eq(suppliers.id, supplierId))
      .limit(1);
    if (!supplier) return 'The linked supplier does not exist.';
  }
  return null;
}

function commonValidation(input: CaseInput): string | null {
  if (!(CASE_TYPES as readonly string[]).includes(input.type)) return 'Choose a valid case type.';
  if (!(CASE_SEVERITIES as readonly string[]).includes(input.severity)) return 'Choose a valid severity.';
  if (!clean(input.title, 160) || input.title.trim().length < 5) return 'Title must be at least 5 characters.';
  if (!clean(input.summary, 3000) || input.summary.trim().length < 10) return 'Summary must be at least 10 characters.';
  if (!realDate(input.dueOn)) return 'Due date must be a real date in YYYY-MM-DD format.';
  if (!validEvidence(clean(input.evidenceUrl, 501))) return 'Evidence must be a complete http or https link (500 characters maximum).';
  if (['high', 'critical'].includes(input.severity) && input.status && input.status !== 'open' && !clean(input.containment, 3000)) {
    return 'High and critical cases need containment recorded before progressing.';
  }
  return null;
}

function closureValidation(input: CaseInput): string | null {
  const required: [string | null, string][] = [
    [clean(input.rootCause, 3000), 'root cause'],
    [clean(input.correctiveAction, 3000), 'corrective action'],
    [clean(input.evidenceUrl, 500), 'evidence'],
    [clean(input.effectivenessCheck, 3000), 'effectiveness check'],
    [clean(input.closureSummary, 3000), 'closure summary'],
  ];
  const missing = required.filter(([value]) => !value).map(([, name]) => name);
  return missing.length ? `Closing requires ${missing.join(', ')}.` : null;
}

export async function listOperationalCases(
  status: 'open' | 'closed' | 'all' = 'open',
): Promise<OperationalCase[]> {
  const filter =
    status === 'all'
      ? undefined
      : status === 'closed'
        ? eq(operationalCases.status, 'closed')
        : sql`${operationalCases.status} <> 'closed'`;
  return getDb()
    .select()
    .from(operationalCases)
    .where(filter)
    .orderBy(asc(operationalCases.dueOn), desc(operationalCases.createdAt));
}

export async function getOperationalCase(caseNumber: string): Promise<{
  record: OperationalCase;
  events: OperationalCaseEvent[];
} | null> {
  const db = getDb();
  const [record] = await db
    .select()
    .from(operationalCases)
    .where(eq(operationalCases.caseNumber, caseNumber))
    .limit(1);
  if (!record) return null;
  const events = await db
    .select()
    .from(operationalCaseEvents)
    .where(eq(operationalCaseEvents.caseId, record.id))
    .orderBy(asc(operationalCaseEvents.createdAt));
  return { record, events };
}

export async function caseSummary(staffId?: string) {
  const rows = await listOperationalCases('open');
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return {
    open: rows.length,
    critical: rows.filter((row) => row.severity === 'critical').length,
    overdue: rows.filter((row) => row.dueOn < today).length,
    mine: staffId ? rows.filter((row) => row.ownerId === staffId).length : 0,
  };
}

export async function createOperationalCase(
  input: CaseInput,
  staff: StaffPrincipal,
): Promise<CaseWriteResult> {
  const error = commonValidation(input);
  if (error) return { ok: false, error };
  const linkError = await validateLinks(input);
  if (linkError) return { ok: false, error: linkError };
  const requestedOwner =
    staff.role === 'admin' ? clean(input.ownerId, 120) ?? staff.id : staff.id;
  const owner = await activeOwner(requestedOwner);
  if (!owner) return { ok: false, error: 'Choose an active case owner.' };
  const now = new Date();
  const caseId = id('case');
  const eventId = id('caseev');
  const marker = id('casechg');
  const caseNumber = `OPS-${now.toISOString().slice(0, 10).replaceAll('-', '')}-${randomToken().slice(0, 6).toUpperCase()}`;
  const values = {
    id: caseId,
    caseNumber,
    type: input.type,
    severity: input.severity,
    status: 'open',
    title: input.title.trim().slice(0, 160),
    summary: input.summary.trim().slice(0, 3000),
    ownerId: owner.id,
    ownerName: owner.name,
    dueOn: realDate(input.dueOn)!,
    linkedLotNumber: clean(input.linkedLotNumber, 120),
    linkedOrderNumber: clean(input.linkedOrderNumber, 120),
    linkedSupplierId: clean(input.linkedSupplierId, 120),
    containment: clean(input.containment, 3000),
    createdBy: actor(staff),
    lastChangeId: marker,
    createdAt: now,
    updatedAt: now,
  };
  await getDb().batch([
    getDb().insert(operationalCases).values(values),
    getDb().insert(operationalCaseEvents).values({
      id: eventId,
      caseId,
      fromStatus: null,
      toStatus: 'open',
      ownerId: owner.id,
      ownerName: owner.name,
      action: 'created',
      note: clean(input.note, 1000) ?? values.summary,
      actor: actor(staff),
      createdAt: now,
    }),
  ]);
  return { ok: true, caseNumber };
}

export async function updateOperationalCase(
  current: OperationalCase,
  input: CaseInput,
  staff: StaffPrincipal,
): Promise<CaseWriteResult> {
  const error = commonValidation(input);
  if (error) return { ok: false, error };
  if (!(CASE_STATUSES as readonly string[]).includes(input.status ?? '')) return { ok: false, error: 'Choose a valid case status.' };
  const status = input.status as CaseStatus;
  const admin = staff.role === 'admin';
  if (!admin && current.ownerId !== staff.id) return { ok: false, error: 'Only an administrator or the assigned owner can update this case.' };
  if (status === 'closed' && !admin) return { ok: false, error: 'An administrator must review and close the case.' };
  if (current.status === 'closed' && status !== 'closed' && !admin) return { ok: false, error: 'Only an administrator can reopen a closed case.' };
  const closeError = status === 'closed' ? closureValidation(input) : null;
  if (closeError) return { ok: false, error: closeError };
  const linkError = await validateLinks(input);
  if (linkError) return { ok: false, error: linkError };
  const requestedOwner = admin ? clean(input.ownerId, 120) ?? current.ownerId : current.ownerId;
  const owner = await activeOwner(requestedOwner);
  if (!owner) return { ok: false, error: 'Choose an active case owner.' };
  const now = new Date();
  const marker = id('casechg');
  const note = clean(input.note, 1000);
  const [changed] = await getDb().batch([
    getDb()
      .update(operationalCases)
      .set({
        type: input.type,
        severity: input.severity,
        status,
        title: input.title.trim().slice(0, 160),
        summary: input.summary.trim().slice(0, 3000),
        ownerId: owner.id,
        ownerName: owner.name,
        dueOn: realDate(input.dueOn)!,
        linkedLotNumber: clean(input.linkedLotNumber, 120),
        linkedOrderNumber: clean(input.linkedOrderNumber, 120),
        linkedSupplierId: clean(input.linkedSupplierId, 120),
        containment: clean(input.containment, 3000),
        rootCause: clean(input.rootCause, 3000),
        correctiveAction: clean(input.correctiveAction, 3000),
        preventiveAction: clean(input.preventiveAction, 3000),
        evidenceUrl: clean(input.evidenceUrl, 500),
        effectivenessCheck: clean(input.effectivenessCheck, 3000),
        closureSummary: clean(input.closureSummary, 3000),
        lastChangeId: marker,
        closedAt: status === 'closed' ? now : null,
        updatedAt: now,
      })
      .where(
        and(
          eq(operationalCases.id, current.id),
          eq(operationalCases.lastChangeId, current.lastChangeId),
        ),
      )
      .returning({ id: operationalCases.id }),
    getDb().insert(operationalCaseEvents).select(
      getDb()
        .select({
          id: sql<string>`${id('caseev')}`.as('id'),
          caseId: operationalCases.id,
          fromStatus: sql<string>`${current.status}`.as('from_status'),
          toStatus: operationalCases.status,
          ownerId: operationalCases.ownerId,
          ownerName: operationalCases.ownerName,
          action: sql<string>`${status === 'closed' ? 'closed' : owner.id !== current.ownerId ? 'reassigned' : 'updated'}`.as('action'),
          note: sql<string | null>`${note}`.as('note'),
          actor: sql<string>`${actor(staff)}`.as('actor'),
          createdAt: sql<number>`${Math.floor(now.getTime() / 1000)}`.as('created_at'),
        })
        .from(operationalCases)
        .where(
          and(
            eq(operationalCases.id, current.id),
            eq(operationalCases.lastChangeId, marker),
          ),
        ),
    ),
  ]);
  if (!changed || changed.length === 0) return { ok: false, error: 'The case changed while you were working. Reload and try again.' };
  return { ok: true, caseNumber: current.caseNumber };
}
