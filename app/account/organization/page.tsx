import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AlertCircle, ArrowLeft, CircleCheck, Clock, FileUp } from 'lucide-react';
import { AcknowledgementForm } from '@/components/site/acknowledgement-form';
import { requireAccount } from '@/lib/account-auth';
import { acknowledgementsCurrent } from '@/lib/account-rules';
import {
  DOCUMENT_KINDS,
  DOCUMENT_KIND_LABEL,
  ORGANIZATION_TYPES,
  ORGANIZATION_TYPE_LABEL,
  type OrganizationDocumentKind,
} from '@/lib/organization-rules';
import { getOrganizationForAccount, listOrganizationDocuments } from '@/lib/organizations';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Organisation verification', robots: { index: false, follow: false } };

type Props = { searchParams: Promise<Record<string, string | undefined>> };

const input = 'h-12 w-full border border-foreground/20 bg-background px-4 text-sm outline-none focus:border-primary';
const area = 'min-h-[7rem] w-full border border-foreground/20 bg-background p-4 text-sm outline-none focus:border-primary';

const DOC_MESSAGE: Record<string, string> = {
  ok: 'Document uploaded.',
  noorg: 'Submit the organisation details first, then upload documents.',
  approved: 'This organisation is already verified.',
  kind: 'Choose a document type.',
  nofile: 'Choose a file to upload.',
  size: 'The file is larger than 25 MB.',
  filetype: 'Only PDF, PNG and JPEG files are accepted.',
  limit: 'Up to six documents can be attached.',
  badform: 'The upload could not be read.',
  store: 'The file could not be stored. Try again shortly.',
};

function Field({
  name,
  title,
  values,
  hint,
  required = false,
  multiline = false,
}: {
  name: string;
  title: string;
  values: Record<string, string>;
  hint?: string;
  required?: boolean;
  multiline?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={name} className="text-sm font-semibold">
        {title}
        {required && <span className="text-primary"> *</span>}
      </label>
      {multiline ? (
        <textarea id={name} name={name} defaultValue={values[name] ?? ''} className={area} required={required} />
      ) : (
        <input id={name} name={name} defaultValue={values[name] ?? ''} className={input} required={required} />
      )}
      {hint && <p className="text-xs leading-5 text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default async function OrganizationPage({ searchParams }: Props) {
  const account = await requireAccount('/account/organization');
  if (account.tier !== 'institutional') redirect('/account');
  const params = await searchParams;

  if (!acknowledgementsCurrent(account)) {
    return (
      <main className="bg-background text-foreground">
        <section className="mx-auto max-w-3xl px-5 py-16 sm:px-8">
          <AcknowledgementForm returnTo="/account/organization" error={params.ack} />
        </section>
      </main>
    );
  }

  const organization = await getOrganizationForAccount(account.id);
  const documents = organization ? await listOrganizationDocuments(organization.id) : [];
  const editable = !organization || organization.verificationStatus === 'more_info' || organization.verificationStatus === 'declined';
  const errors = params.error ? params.error.split('|').slice(0, 12) : [];
  const docMessage = params.doc ? (DOC_MESSAGE[params.doc] ?? DOC_MESSAGE.store) : null;

  const values: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) if (k.startsWith('v_') && v) values[k.slice(2)] = v;
  if (organization && Object.keys(values).length === 0) {
    Object.assign(values, {
      legalName: organization.legalName,
      website: organization.website,
      organizationType: organization.organizationType,
      addressLine1: organization.addressLine1,
      addressLine2: organization.addressLine2 ?? '',
      city: organization.city,
      region: organization.region,
      postalCode: organization.postalCode,
      country: organization.country,
      phone: organization.phone ?? '',
      registrationNumber: organization.registrationNumber ?? '',
      researchContext: organization.researchContext,
      receivingParty: organization.receivingParty,
    });
  }

  return (
    <main className="bg-background text-foreground">
      <section className="mx-auto max-w-3xl px-5 py-16 sm:px-8">
        <Link href="/account" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-primary">
          <ArrowLeft className="size-4" /> Your account
        </Link>
        <p className="mt-6 utility-label text-primary">Organisation verification</p>
        <h1 className="mt-4 font-display text-4xl font-extrabold tracking-[-0.05em]">
          {organization ? organization.legalName : 'Tell us about your organisation'}
        </h1>

        {params.submitted && (
          <p role="status" className="mt-6 flex items-center gap-2 border border-border bg-secondary p-4 text-sm">
            <CircleCheck className="size-4 text-primary" /> Submitted. A person will review it, usually within two
            business days. Add supporting documents below if you have them.
          </p>
        )}
        {organization && organization.verificationStatus === 'submitted' && !params.submitted && (
          <p className="mt-6 flex items-center gap-2 border border-border bg-secondary p-4 text-sm">
            <Clock className="size-4 text-primary" /> Under review since {organization.submittedAt.toISOString().slice(0, 10)}.
          </p>
        )}
        {organization && organization.verificationStatus === 'approved' && (
          <p className="mt-6 flex items-center gap-2 border border-border bg-secondary p-4 text-sm">
            <CircleCheck className="size-4 text-primary" /> Verified. Pricing and lot availability are visible to you.
          </p>
        )}
        {organization && (organization.verificationStatus === 'more_info' || organization.verificationStatus === 'declined') && organization.reviewNote && (
          <div className="mt-6 border border-border bg-secondary p-4 text-sm">
            <p className="font-semibold">
              {organization.verificationStatus === 'more_info' ? 'We need a little more:' : 'Verification was declined:'}
            </p>
            <p className="mt-2 leading-6">{organization.reviewNote}</p>
          </div>
        )}
        {errors.length > 0 && (
          <div role="alert" className="mt-6 border border-destructive/40 bg-secondary p-5">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <AlertCircle className="size-4 text-destructive" /> Please fix the following:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-6 text-sm">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        )}

        {editable ? (
          <form method="post" action="/api/account/organization" className="mt-10 flex flex-col gap-8">
            <div className="grid gap-6 sm:grid-cols-2">
              <Field name="legalName" title="Legal name" values={values} required />
              <Field name="website" title="Website" values={values} required hint="Your email address must be on this domain." />
              <div className="flex flex-col gap-2 sm:col-span-2">
                <label htmlFor="organizationType" className="text-sm font-semibold">
                  Organisation type <span className="text-primary">*</span>
                </label>
                <select id="organizationType" name="organizationType" defaultValue={values.organizationType ?? ''} className={input} required>
                  <option value="">Choose…</option>
                  {ORGANIZATION_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {ORGANIZATION_TYPE_LABEL[t]}
                    </option>
                  ))}
                </select>
              </div>
              <Field name="registrationNumber" title="Tax or registration number" values={values} hint="EIN, charity number, company number. Used to confirm the organisation exists as described." />
              <Field name="phone" title="Phone" values={values} />
            </div>

            <div>
              <p className="utility-label text-primary">Shipping address</p>
              <p className="mt-2 text-sm text-muted-foreground">
                The laboratory or business premises material ships to. No residential addresses, no PO boxes.
              </p>
              <div className="mt-5 grid gap-6 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Field name="addressLine1" title="Street address" values={values} required />
                </div>
                <div className="sm:col-span-2">
                  <Field name="addressLine2" title="Building, department, floor" values={values} />
                </div>
                <Field name="city" title="City" values={values} required />
                <Field name="region" title="State / province / region" values={values} required />
                <Field name="postalCode" title="Postal code" values={values} required />
                <Field name="country" title="Country" values={values} required />
              </div>
            </div>

            <div className="grid gap-6">
              <Field
                name="researchContext"
                title="Research context"
                values={values}
                required
                multiline
                hint="What the material will be used in — the laboratory work, assay or analytical programme. Not what it is expected to do in an organism."
              />
              <Field
                name="receivingParty"
                title="Receiving party"
                values={values}
                required
                hint="The person who takes delivery and is responsible for storage and handling."
              />
            </div>

            <button
              type="submit"
              className="inline-flex h-12 items-center justify-center bg-primary px-6 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {organization ? 'Resubmit for verification' : 'Submit for verification'}
            </button>
          </form>
        ) : (
          organization && (
            <dl className="mt-10 border-t border-border">
              {[
                ['Website', organization.website],
                ['Type', ORGANIZATION_TYPE_LABEL[organization.organizationType as keyof typeof ORGANIZATION_TYPE_LABEL] ?? organization.organizationType],
                ['Shipping address', [organization.addressLine1, organization.addressLine2, organization.city, organization.region, organization.postalCode, organization.country].filter(Boolean).join(', ')],
                ['Receiving party', organization.receivingParty],
              ].map(([k, v]) => (
                <div key={k} className="grid gap-1 border-b border-border py-4 sm:grid-cols-[220px_1fr] sm:gap-6">
                  <dt className="text-sm font-semibold text-muted-foreground">{k}</dt>
                  <dd className="text-sm">{v}</dd>
                </div>
              ))}
            </dl>
          )
        )}

        {organization && organization.verificationStatus !== 'approved' && (
          <div className="mt-12">
            <p className="utility-label text-primary">Supporting documents</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Optional but they speed the review: a registration certificate, or a purchase order or letter on the
              organisation&rsquo;s letterhead. PDF, PNG or JPEG, up to 25 MB, up to six files.
            </p>
            {docMessage && (
              <p role={params.doc === 'ok' ? 'status' : 'alert'} className="mt-4 border border-border bg-secondary p-3 text-sm">
                {docMessage}
              </p>
            )}
            {documents.length > 0 && (
              <ul className="mt-4 divide-y divide-border border border-border text-sm">
                {documents.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                    <span>{DOCUMENT_KIND_LABEL[d.kind as OrganizationDocumentKind] ?? d.kind}</span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {d.originalName ?? d.objectKey.split('/').pop()} &middot; {d.uploadedAt.toISOString().slice(0, 10)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <form method="post" action="/api/account/organization/documents" encType="multipart/form-data" className="mt-4 flex flex-col gap-4 border border-border bg-secondary p-5">
              <label className="flex flex-col gap-1.5 text-sm">
                Document type
                <select name="kind" required className="h-11 border border-foreground/20 bg-background px-3 text-sm">
                  {DOCUMENT_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {DOCUMENT_KIND_LABEL[k]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                File
                <input name="file" type="file" required accept="application/pdf,image/png,image/jpeg" className="text-sm" />
              </label>
              <button type="submit" className="inline-flex h-11 w-fit items-center gap-2 bg-primary px-5 text-sm font-bold text-primary-foreground hover:bg-primary/90">
                <FileUp className="size-4" /> Upload
              </button>
            </form>
          </div>
        )}
      </section>
    </main>
  );
}
