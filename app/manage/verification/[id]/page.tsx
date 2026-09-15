import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, CircleCheck, Download, Flag } from 'lucide-react';
import { VerificationDecisionForm } from '@/components/manage/verification-decision-form';
import { DOCUMENT_KIND_LABEL, ORGANIZATION_TYPE_LABEL, type OrganizationDocumentKind, type OrganizationType, decisionsFor } from '@/lib/organization-rules';
import { getOrganizationDetail } from '@/lib/organizations';
import { canVerifyAccounts, requireStaff } from '@/lib/staff-auth';
import { decideVerificationAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Verification', robots: { index: false, follow: false } };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ decided?: string; emailed?: string }> };

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="grid gap-1 border-b border-border py-3 sm:grid-cols-[220px_1fr] sm:gap-6">
      <dt className="text-sm font-semibold text-muted-foreground">{label}</dt>
      <dd className="break-words text-sm leading-6">{value || <span className="text-muted-foreground">—</span>}</dd>
    </div>
  );
}

export default async function VerificationDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { decided, emailed } = await searchParams;
  const staff = await requireStaff(`/manage/verification/${id}`);
  if (!/^org_[a-z0-9]{8,32}$/.test(id)) notFound();
  const detail = await getOrganizationDetail(id);
  if (!detail) notFound();
  const { organization: org, account, documents, events } = detail;
  const decisions = decisionsFor(org.verificationStatus);
  const decidable = decisions.length > 0;

  return (
    <main className="bg-background text-foreground">
      <section className="mx-auto max-w-[1200px] px-5 py-12 sm:px-8 lg:px-12">
        <Link href="/manage/verification" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-primary">
          <ArrowLeft className="size-4" /> Verification queue
        </Link>
        {decided && (
          <p role="status" className="mt-6 flex items-center gap-2 border border-border bg-secondary p-4 text-sm">
            <CircleCheck className="size-4 text-primary" /> Decision recorded: {org.verificationStatus}.{' '}
            {emailed === '0'
              ? `The applicant was NOT emailed: the site could not send the message. Email ${account.email} yourself from research@nexphaselabs.net.`
              : 'The applicant has been emailed.'}
          </p>
        )}
        <p className="mt-6 font-mono text-xs text-muted-foreground">
          {org.verificationStatus} &middot; submitted {org.submittedAt.toISOString().slice(0, 10)}
        </p>
        <h1 className="mt-2 font-display text-4xl font-extrabold tracking-[-0.05em]">{org.legalName}</h1>

        {org.reviewFlags.length > 0 && (
          <div className="mt-6 border border-border bg-secondary p-4 text-sm">
            <p className="flex items-center gap-2 font-semibold">
              <Flag className="size-4 text-primary" /> Automatic checks flagged
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              {org.reviewFlags.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-10 grid gap-12 lg:grid-cols-2">
          <div>
            <h2 className="utility-label text-primary">Organisation</h2>
            <dl className="mt-4 border-t border-border">
              <Row label="Type" value={ORGANIZATION_TYPE_LABEL[org.organizationType as OrganizationType] ?? org.organizationType} />
              <Row label="Website" value={org.website} />
              <Row label="Email domain" value={org.emailDomain} />
              <Row label="Registration number" value={org.registrationNumber} />
              <Row label="Phone" value={org.phone} />
              <Row label="Shipping address" value={[org.addressLine1, org.addressLine2, org.city, org.region, org.postalCode, org.country].filter(Boolean).join(', ')} />
              <Row label="Receiving party" value={org.receivingParty} />
              <Row label="Research context" value={org.researchContext} />
            </dl>
            <h2 className="mt-10 utility-label text-primary">Applicant</h2>
            <dl className="mt-4 border-t border-border">
              <Row label="Name" value={account.name} />
              <Row label="Email" value={account.email} />
              <Row label="Email verified" value={account.emailVerifiedAt ? account.emailVerifiedAt.toISOString().slice(0, 10) : 'No'} />
              <Row label="Terms / research-use versions" value={`${account.termsVersion ?? '—'} / ${account.ruoVersion ?? '—'}`} />
            </dl>
          </div>
          <div>
            <h2 className="utility-label text-primary">Documents ({documents.length})</h2>
            {documents.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">None uploaded.</p>
            ) : (
              <ul className="mt-4 divide-y divide-border border border-border text-sm">
                {documents.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                    <span>
                      {DOCUMENT_KIND_LABEL[d.kind as OrganizationDocumentKind] ?? d.kind}
                      <span className="block font-mono text-xs text-muted-foreground">
                        {d.originalName ?? d.objectKey.split('/').pop()} &middot; {d.uploadedAt.toISOString().slice(0, 10)}
                      </span>
                    </span>
                    <a href={`/api/manage/organizations/${org.id}/documents/${d.id}`} className="inline-flex items-center gap-1.5 font-semibold text-primary">
                      <Download className="size-3.5" /> Download
                    </a>
                  </li>
                ))}
              </ul>
            )}

            <h2 className="mt-10 utility-label text-primary">Decision</h2>
            <div className="mt-4">
              {!canVerifyAccounts(staff) ? (
                <p className="border border-border bg-secondary p-4 text-sm text-muted-foreground">Only an admin can decide verification.</p>
              ) : decidable ? (
                <VerificationDecisionForm action={decideVerificationAction.bind(null, org.id)} decisions={decisions} />
              ) : (
                <p className="border border-border bg-secondary p-4 text-sm">
                  This organisation is <span className="font-mono">{org.verificationStatus}</span>.{' '}
                  {org.verificationStatus === 'revoked' ? 'The applicant must contact us before resubmitting.' : 'The applicant must resubmit before another decision.'}
                </p>
              )}
            </div>

            <h2 className="mt-10 utility-label text-primary">History</h2>
            <ul className="mt-4 divide-y divide-border border border-border text-sm">
              {events.map((e) => (
                <li key={e.id} className="p-3">
                  <span className="font-mono text-xs">{e.createdAt.toISOString().slice(0, 10)}</span> &middot; {e.fromStatus} &rarr;{' '}
                  <span className="font-semibold">{e.toStatus}</span> &middot; {e.decidedBy}
                  {e.note && <p className="mt-1 text-muted-foreground">{e.note}</p>}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </main>
  );
}
