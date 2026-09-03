import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import {
  accounts,
  organizationDocuments,
  organizations,
  verificationEvents,
  type Account,
  type Organization,
  type OrganizationDocument,
  type VerificationEvent,
} from '@/db/schema';
import type { AccountPrincipal } from '@/lib/account-auth';
import type { StoredDocument } from '@/lib/documents';
import { sendEmail } from '@/lib/email';
import { DECISION_TARGET, type OrganizationValidation, type VerificationDecision } from '@/lib/organization-rules';
import { publicOrigin } from '@/lib/site-config';
import type { StaffPrincipal } from '@/lib/staff-auth';
import { recordedBy } from '@/lib/lots-admin';

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

export async function listVerificationQueue(): Promise<QueueRow[]> {
  const db = getDb();
  const rows = await db
    .select({ organization: organizations, account: accounts })
    .from(organizations)
    .innerJoin(accounts, eq(organizations.accountId, accounts.id))
    .orderBy(asc(organizations.verificationStatus), desc(organizations.submittedAt));
  // 'submitted' first, then more_info, approved, declined.
  const order: Record<string, number> = { submitted: 0, more_info: 1, approved: 2, declined: 3 };
  return rows.sort((a, b) => (order[a.organization.verificationStatus] ?? 9) - (order[b.organization.verificationStatus] ?? 9));
}

export type OrganizationDetail = QueueRow & { documents: OrganizationDocument[]; events: VerificationEvent[] };

export async function getOrganizationDetail(organizationId: string): Promise<OrganizationDetail | null> {
  const db = getDb();
  const [row] = await db
    .select({ organization: organizations, account: accounts })
    .from(organizations)
    .innerJoin(accounts, eq(organizations.accountId, accounts.id))
    .where(eq(organizations.id, organizationId))
    .limit(1);
  if (!row) return null;
  const [documents, events] = await Promise.all([
    listOrganizationDocuments(organizationId),
    db.select().from(verificationEvents).where(eq(verificationEvents.organizationId, organizationId)).orderBy(asc(verificationEvents.createdAt)),
  ]);
  return { ...row, documents, events };
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
 * The only path that approves, declines or asks for more. One batch:
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
): Promise<{ ok: true; status: string } | { ok: false; error: string }> {
  const db = getDb();
  const now = new Date();
  const from = detail.organization.verificationStatus;
  if (from !== 'submitted' && from !== 'more_info') {
    return { ok: false, error: `A ${from} organisation cannot be decided again; the applicant must resubmit.` };
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
          `${detail.organization.legalName} is now a verified research organisation with NexPhase Labs.`,
          `Pricing and lot availability are visible when you sign in: ${origin}/account/sign-in`,
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
  await sendEmail({
    to: detail.account.email,
    subject:
      decision === 'approve'
        ? 'Your organisation is verified — NexPhase Labs'
        : decision === 'more_info'
          ? 'More information needed for verification — NexPhase Labs'
          : 'Verification decision — NexPhase Labs',
    text: [...body, '', 'NexPhase Labs · 8486 Ventures LLC · Oakland, CA'].join('\n'),
  });

  return { ok: true, status: target };
}
