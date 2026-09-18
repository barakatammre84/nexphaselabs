import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { STOREFRONT_COPY } from '@/lib/storefront-copy';
import { getDb } from '@/db';
import {
  accounts,
  organizationDocuments,
  organizations,
  staffUsers,
  verificationEvents,
  verificationAssignmentEvents,
  type Account,
  type Organization,
  type OrganizationDocument,
  type VerificationEvent,
  type VerificationAssignmentEvent,
} from '@/db/schema';
import type { AccountPrincipal } from '@/lib/account-auth';
import type { StoredDocument } from '@/lib/documents';
import { sendEmail } from '@/lib/email';
import { DECISION_TARGET, decisionsFor, type OrganizationValidation, type VerificationDecision } from '@/lib/organization-rules';
import { publicOrigin } from '@/lib/site-config';
import type { StaffPrincipal } from '@/lib/staff-auth';
import { roleHasPermission } from '@/lib/staff-roles';
import { recordedBy } from '@/lib/lots-admin';
import { ENTITY_FOOTER } from '@/lib/entity';

function id(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
}

export async function getOrganizationForAccount(accountId: string): Promise<Organization | null> {
  const db = getDb();
  const [row] = await db.select().from(organizations).where(eq(organizations.accountId, accountId)).limit(1);
  return row ?? null;
}

export async function listOrganizationDocuments(organizationId: string): Promise<OrganizationDocument[]> {
  const db = getDb();
  return db
    .select()
    .from(organizationDocuments)
    .where(eq(organizationDocuments.organizationId, organizationId))
    .orderBy(desc(organizationDocuments.uploadedAt));
}

/**
 * Create or resubmit the organisation for an account. A resubmission is
 * allowed only from 'more_info' or 'declined'; an approved or pending
 * organisation is not editable by the applicant. Every submission sets the
 * status to 'submitted' and mirrors it onto the account.
 */
export async function submitOrganization(
  account: AccountPrincipal,
  validated: Extract<OrganizationValidation, { ok: true }>,
): Promise<{ ok: true; organizationId: string } | { ok: false; error: string }> {
  const db = getDb();
  const now = new Date();
  const existing = await getOrganizationForAccount(account.id);
  if (existing && existing.verificationStatus === 'approved') {
    return { ok: false, error: 'This organisation is already verified. Email research@nexphaselabs.net to change its details.' };
  }
  if (existing && existing.verificationStatus === 'revoked') {
    return { ok: false, error: 'Verification for this organisation was withdrawn. Email research@nexphaselabs.net before resubmitting.' };
  }
  if (existing && existing.verificationStatus === 'submitted') {
    return { ok: false, error: 'Your submission is under review. You will hear from us by email.' };
  }
  const v = validated.value;
  const columns = {
    legalName: v.legalName,
    website: v.websiteHost,
    emailDomain: v.emailDomain,
    organizationType: v.organizationType,
    addressLine1: v.addressLine1,
    addressLine2: v.addressLine2,
    city: v.city,
    region: v.region,
    postalCode: v.postalCode,
    country: v.country,
    phone: v.phone,
    registrationNumber: v.registrationNumber,
    researchContext: v.researchContext,
    receivingParty: v.receivingParty,
    reviewFlags: validated.flags,
    verificationStatus: 'submitted',
    submittedAt: now,
    reviewedBy: null,
    reviewedAt: null,
    reviewNote: null,
    updatedAt: now,
  };
  const organizationId = existing?.id ?? id('org');
  await db.batch([
    existing
      ? db.update(organizations).set(columns).where(eq(organizations.id, existing.id))
      : db.insert(organizations).values({ id: organizationId, accountId: account.id, ...columns, createdAt: now }),
    db.insert(verificationEvents).values({
      id: id('vev'),
      organizationId,
      fromStatus: existing?.verificationStatus ?? 'none',
      toStatus: 'submitted',
      note: existing ? 'Resubmitted by the applicant.' : 'Submitted by the applicant.',
      decidedBy: `${account.name} (${account.id})`,
      createdAt: now,
    }),
    db.update(accounts).set({ verificationStatus: 'submitted', updatedAt: now }).where(eq(accounts.id, account.id)),
  ]);
  return { ok: true, organizationId };
}

export async function attachOrganizationDocument(
  organization: Organization,
  kind: string,
  stored: StoredDocument,
  originalName: string | null,
): Promise<void> {
  const db = getDb();
  await db.insert(organizationDocuments).values({
    id: id('odc'),
    organizationId: organization.id,
    kind,
    objectKey: stored.key,
    contentType: stored.contentType,
    sizeBytes: stored.size,
    originalName,
    uploadedAt: stored.uploadedAt,
    createdAt: stored.uploadedAt,
  });
}

/* ------------------------------------------------------------------------ */
/* Staff review                                                              */
/* ------------------------------------------------------------------------ */

export type QueueRow = { organization: Organization; account: Account };

export type VerificationQueueOptions = { query?: string; status?: string; owner?: string; due?: 'overdue' | 'today' | 'upcoming' | 'unset'; page?: number };
export function verificationQueuePage(raw?: string): number {
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? Math.min(n, 100000) : 1;
}
export async function listVerificationQueue(options: VerificationQueueOptions = {}): Promise<{ rows: QueueRow[]; hasNext: boolean }> {
  const db = getDb();
  const search = (options.query ?? '').trim().slice(0, 120).toLowerCase();
  const matching = search
    ? sql`instr(lower(${organizations.legalName} || ' ' || ${organizations.website} || ' ' || ${organizations.emailDomain} || ' ' || ${accounts.name} || ' ' || ${accounts.email}), ${search}) > 0`
    : undefined;
  const status = options.status && options.status !== 'all'
    ? eq(organizations.verificationStatus, options.status)
    : undefined;
  const owner = (options.owner ?? '').trim().slice(0, 120).toLowerCase();
  const ownerMatch = owner ? sql`instr(lower(coalesce(${organizations.assignedName}, '')), ${owner}) > 0` : undefined;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const tomorrow = new Date(today.getTime() + 86_400_000);
  const todayEpoch = Math.floor(today.getTime() / 1000);
  const tomorrowEpoch = Math.floor(tomorrow.getTime() / 1000);
  const due = options.due === 'overdue'
    ? sql`${organizations.serviceDueAt} < ${todayEpoch}`
    : options.due === 'today'
      ? sql`${organizations.serviceDueAt} >= ${todayEpoch} AND ${organizations.serviceDueAt} < ${tomorrowEpoch}`
      : options.due === 'upcoming'
        ? sql`${organizations.serviceDueAt} >= ${tomorrowEpoch}`
        : options.due === 'unset'
          ? isNull(organizations.serviceDueAt)
          : undefined;
  const rows = await db
    .select({ organization: organizations, account: accounts })
    .from(organizations)
    .innerJoin(accounts, eq(organizations.accountId, accounts.id))
    .where(and(matching, status, ownerMatch, due))
    .orderBy(sql`CASE ${organizations.verificationStatus} WHEN 'submitted' THEN 0 WHEN 'more_info' THEN 1 WHEN 'approved' THEN 2 WHEN 'declined' THEN 3 ELSE 9 END`, desc(organizations.submittedAt))
    .limit(51)
    .offset((verificationQueuePage(String(options.page ?? 1)) - 1) * 50);
  return { rows: rows.slice(0, 50), hasNext: rows.length > 50 };
}

export type OrganizationDetail = QueueRow & { documents: OrganizationDocument[]; events: VerificationEvent[]; assignmentEvents: VerificationAssignmentEvent[] };

export async function getOrganizationDetail(organizationId: string): Promise<OrganizationDetail | null> {
  const db = getDb();
  const [row] = await db
    .select({ organization: organizations, account: accounts })
    .from(organizations)
    .innerJoin(accounts, eq(organizations.accountId, accounts.id))
    .where(eq(organizations.id, organizationId))
    .limit(1);
  if (!row) return null;
  const [documents, events, assignmentEvents] = await Promise.all([
    listOrganizationDocuments(organizationId),
    db.select().from(verificationEvents).where(eq(verificationEvents.organizationId, organizationId)).orderBy(asc(verificationEvents.createdAt)),
    db.select().from(verificationAssignmentEvents).where(eq(verificationAssignmentEvents.organizationId, organizationId)).orderBy(asc(verificationAssignmentEvents.createdAt)),
  ]);
  return { ...row, documents, events, assignmentEvents };
}

export async function assignVerification(
  organization: Organization,
  ownerId: string | null,
  serviceDueAt: Date | null,
  staff: StaffPrincipal,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!roleHasPermission(staff.role, 'accounts.approve')) return { ok: false, error: 'Only an admin can assign verification work.' };
  const db = getDb();
  const now = new Date();
  let owner: { id: string; name: string } | null = null;
  if (ownerId) {
    [owner] = await db.select({ id: staffUsers.id, name: staffUsers.name }).from(staffUsers)
      .where(and(eq(staffUsers.id, ownerId), eq(staffUsers.active, true), eq(staffUsers.role, 'admin')))
      .limit(1);
    if (!owner) return { ok: false, error: 'Choose an active administrator owner.' };
    if (!serviceDueAt) return { ok: false, error: 'Set a service due date when assigning verification work.' };
  } else {
    serviceDueAt = null;
  }
  if (organization.assignedTo === owner?.id && organization.serviceDueAt?.getTime() === serviceDueAt?.getTime()) {
    return { ok: false, error: 'Nothing changed.' };
  }
  const assignmentId = id('vas');
  const [changed] = await db.batch([
    db.update(organizations).set({ assignedTo: owner?.id ?? null, assignedName: owner?.name ?? null, serviceDueAt, lastAssignmentId: assignmentId, updatedAt: now })
      .where(and(
        eq(organizations.id, organization.id),
        sql`${organizations.assignedTo} IS ${organization.assignedTo}`,
        sql`${organizations.serviceDueAt} IS ${organization.serviceDueAt}`,
        sql`${organizations.lastAssignmentId} IS ${organization.lastAssignmentId}`,
        owner ? sql`EXISTS (SELECT 1 FROM ${staffUsers} WHERE ${staffUsers.id} = ${owner.id} AND ${staffUsers.active} = 1 AND ${staffUsers.role} = 'admin')` : sql`1 = 1`,
      ))
      .returning({ id: organizations.id }),
    db.insert(verificationAssignmentEvents).select(db.select({
      id: sql<string>`${assignmentId}`.as('id'),
      organizationId: organizations.id,
      fromOwnerId: sql<string | null>`${organization.assignedTo}`.as('from_owner_id'),
      fromOwner: sql<string | null>`${organization.assignedName}`.as('from_owner'),
      toOwnerId: sql<string | null>`${owner?.id ?? null}`.as('to_owner_id'),
      toOwner: sql<string | null>`${owner?.name ?? null}`.as('to_owner'),
      fromServiceDueAt: sql<number | null>`${organization.serviceDueAt ? Math.floor(organization.serviceDueAt.getTime() / 1000) : null}`.as('from_service_due_at'),
      toServiceDueAt: sql<number | null>`${serviceDueAt ? Math.floor(serviceDueAt.getTime() / 1000) : null}`.as('to_service_due_at'),
      assignedBy: sql<string>`${recordedBy(staff)}`.as('assigned_by'),
      createdAt: sql<number>`${Math.floor(now.getTime() / 1000)}`.as('created_at'),
    }).from(organizations).where(and(eq(organizations.id, organization.id), eq(organizations.lastAssignmentId, assignmentId)))),
  ]);
  return changed.length ? { ok: true } : { ok: false, error: 'The verification assignment changed while you were working. Reload and try again.' };
}

export async function listVerificationAssignees(): Promise<{ id: string; name: string; role: string }[]> {
  return getDb()
    .select({ id: staffUsers.id, name: staffUsers.name, role: staffUsers.role })
    .from(staffUsers)
    .where(and(eq(staffUsers.active, true), eq(staffUsers.role, 'admin')))
    .orderBy(asc(staffUsers.name));
}

export async function getOrganizationDocumentById(organizationId: string, documentId: string): Promise<OrganizationDocument | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(organizationDocuments)
    .where(and(eq(organizationDocuments.id, documentId), eq(organizationDocuments.organizationId, organizationId)))
    .limit(1);
  return row ?? null;
}

/**
 * The only path that approves, declines, asks for more, or revokes. One batch:
 *   1. conditional status update, stamped with a fresh decision id;
 *   2. event row inserted only where the organisation now carries that id
 *      (so a decision that lost a race leaves no record claiming it won);
 *   3. the account mirror copies whatever the organisation's status now is.
 * The applicant is emailed the outcome only when the update applied.
 */
export async function decideVerification(
  detail: OrganizationDetail,
  decision: VerificationDecision,
  note: string | null,
  staff: StaffPrincipal,
): Promise<{ ok: true; status: string; emailed: boolean } | { ok: false; error: string }> {
  const db = getDb();
  const now = new Date();
  const from = detail.organization.verificationStatus;
  if (!decisionsFor(from).includes(decision)) {
    return {
      ok: false,
      error:
        from === 'approved'
          ? 'An approved organisation can only be revoked.'
          : `A ${from} organisation cannot be decided again; the applicant must resubmit.`,
    };
  }
  const target = DECISION_TARGET[decision];
  const by = recordedBy(staff);
  const decisionId = id('dec');
  const orgId = detail.organization.id;

  const [updated] = await db.batch([
    db
      .update(organizations)
      .set({ verificationStatus: target, reviewedBy: by, reviewedAt: now, reviewNote: note, lastDecisionId: decisionId, updatedAt: now })
      .where(and(eq(organizations.id, orgId), eq(organizations.verificationStatus, from)))
      .returning({ id: organizations.id }),
    // INSERT … SELECT: the row exists only if the organisation now carries our decision id.
    db.insert(verificationEvents).select(
      db
        .select({
          id: sql<string>`${id('vev')}`.as('id'),
          organizationId: organizations.id,
          fromStatus: sql<string>`${from}`.as('from_status'),
          toStatus: sql<string>`${target}`.as('to_status'),
          note: sql<string | null>`${note}`.as('note'),
          decidedBy: sql<string>`${by}`.as('decided_by'),
          createdAt: sql<number>`${Math.floor(now.getTime() / 1000)}`.as('created_at'),
        })
        .from(organizations)
        .where(and(eq(organizations.id, orgId), eq(organizations.lastDecisionId, decisionId))),
    ),
    db
      .update(accounts)
      .set({
        verificationStatus: sql`(SELECT ${organizations.verificationStatus} FROM ${organizations} WHERE ${organizations.id} = ${orgId})`,
        updatedAt: now,
      })
      .where(eq(accounts.id, detail.account.id)),
  ]);
  if (!updated || updated.length === 0) {
    return { ok: false, error: 'This organisation changed while you were reviewing. Reload and review again.' };
  }

  const origin = publicOrigin();
  const body =
    decision === 'approve'
      ? [
          `Hello ${detail.account.name},`,
          '',
          STOREFRONT_COPY.wholesaleApproved(detail.organization.legalName),
          `Pricing and lot availability are visible when you sign in: ${origin}/account/sign-in`,
        ]
      : decision === 'revoke'
        ? [
            `Hello ${detail.account.name},`,
            '',
            `Verification of ${detail.organization.legalName} has been withdrawn. Pricing, lot availability and ordering are no longer available on this account.`,
            '',
            note ?? '',
            '',
            'Orders already shipped are unaffected. Any order paid but not yet shipped will be reviewed by a person and either fulfilled or refunded; you will hear from us either way. Reply to this email if you have questions.',
          ]
        : decision === 'more_info'
        ? [
            `Hello ${detail.account.name},`,
            '',
            `We need a little more before we can verify ${detail.organization.legalName}:`,
            '',
            note ?? '',
            '',
            `Update your submission at ${origin}/account/organization`,
          ]
        : [
            `Hello ${detail.account.name},`,
            '',
            `We were not able to verify ${detail.organization.legalName} under our research-use policy.`,
            '',
            note ?? '',
            '',
            'If you believe this is a mistake, reply to this email.',
          ];
  // Whether the applicant was actually told: staff must not read "emailed" when the site could not send it.
  const sent = await sendEmail({
    to: detail.account.email,
    subject:
      decision === 'approve'
        ? 'Your organisation is verified — NexPhase Labs'
        : decision === 'more_info'
          ? 'More information needed for verification — NexPhase Labs'
          : decision === 'revoke'
            ? 'Your verification has been withdrawn — NexPhase Labs'
            : 'Verification decision — NexPhase Labs',
    text: [...body, '', ENTITY_FOOTER].join('\n'),
  });

  return { ok: true, status: target, emailed: sent.ok };
}
