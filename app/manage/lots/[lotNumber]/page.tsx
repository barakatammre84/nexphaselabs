import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AlertCircle, ArrowLeft, CircleCheck, Download, FileText } from 'lucide-react';
import { LotDispositionForm } from '@/components/manage/lot-disposition-form';
import { LotCorrectionForm } from '@/components/manage/lot-correction-form';
import { LotTestForm } from '@/components/manage/lot-test-form';
import { InventoryMovementForm } from '@/components/manage/inventory-movement-form';
import { DOCUMENT_LABEL, DOCUMENT_TYPES, isDocumentType } from '@/lib/documents';
import { previewCoa } from '@/lib/coa';
import { LABEL_SIZES } from '@/lib/hazard';
import { labelPreviewForLot } from '@/lib/hazard-label';
import { documentHistory } from '@/lib/issued-documents';
import { ALLOWED_TRANSITIONS, TEST_TYPE_LABEL, lotNumberFromParam, publicationBlockers, publicationWarnings, releaseBlockers, type TestType } from '@/lib/lot-rules';
import { lotVersions } from '@/lib/lot-family';
import { canFulfil, canManageFinance, canRecordResults, canVerifyAccounts, requireStaff } from '@/lib/staff-auth';
import { lotConsignees, reachabilityLabel, reachabilitySummary } from '@/lib/customer-reachability';
import { QueueAssignmentForm } from '@/components/manage/queue-assignment-form';
import { LOT_STATUS_LABEL, currentDocumentKey, getLotDetail, listLotAssignees, lotToIntakeInput, type LotStatus } from '@/lib/lots-admin';
import { addLotTestAction, assignLotAction, correctLotAction, recordInventoryMovementAction, setLotDispositionAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Lot', robots: { index: false, follow: false } };

type Props = {
  params: Promise<{ lotNumber: string }>;
  searchParams: Promise<{ received?: string; uploaded?: string; error?: string; tested?: string; decided?: string; cost?: string; corrected?: string; issued?: string; movement?: string; assigned?: string }>;
};

const UPLOAD_ERROR: Record<string, string> = {
  cost: 'Landed cost must be a dollar amount such as 1250 or 1250.00.',
  type: 'Choose a document type.',
  nofile: 'Choose a file to upload.',
  size: 'The file is larger than 25 MB.',
  filetype: 'Only PDF, PNG and JPEG files are accepted.',
  badform: 'The upload could not be read.',
  store: 'The file could not be stored. Try again shortly.',
  coablocked:
    'The certificate cannot be issued yet. The outstanding items are listed under Certificate of analysis below.',
  coafailed: 'The certificate could not be issued. Nothing was recorded. Try again shortly.',
};

function bytes(n: number): string {
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`;
}

function day(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : '—';
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="grid gap-1 border-b border-border py-3 sm:grid-cols-[220px_1fr] sm:gap-6">
      <dt className="text-sm font-semibold text-muted-foreground">{label}</dt>
      <dd className="break-words font-mono text-sm leading-6">{value || <span className="text-muted-foreground">—</span>}</dd>
    </div>
  );
}

const MOVEMENT_LABEL: Record<string, string> = {
  receipt: 'Receipt',
  shipment: 'Shipment',
  return: 'Return',
  destruction: 'Destruction',
  adjustment: 'Adjustment',
  sample: 'Sample',
};

export default async function LotDetailPage({ params, searchParams }: Props) {
  const { lotNumber } = await params;
  const { received, uploaded, error, tested, decided, cost, corrected, issued, movement, assigned } = await searchParams;
  const staff = await requireStaff(`/manage/lots/${encodeURIComponent(lotNumber)}`);

  const normalised = lotNumberFromParam(lotNumber);
  if (!normalised) notFound();
  const detail = await getLotDetail(normalised);
  if (!detail) notFound();
  const { lot, tests, movements, documents, statusEvents, assignmentEvents } = detail;
  const versions = await lotVersions(lot.id);
  const correctionInitial = Object.fromEntries(Object.entries(lotToIntakeInput(lot)).map(([k, v]) => [k, v ?? '']));
  const blockers = releaseBlockers(lot, tests);
  const pubBlockers = publicationBlockers(lot);
  const pubWarnings = publicationWarnings(lot);
  const allowed = ALLOWED_TRANSITIONS[lot.status] ?? [];
  const uploadError = error ? (UPLOAD_ERROR[error] ?? UPLOAD_ERROR.store) : null;
  const [coa, issuedDocs, label, consignees, assignees] = await Promise.all([
    previewCoa(normalised),
    documentHistory('lot', lot.lotNumber),
    labelPreviewForLot(normalised),
    lotConsignees(lot.lotNumber),
    listLotAssignees(),
  ]);
  const reach = reachabilitySummary(consignees);
  const coaHistory = issuedDocs.filter((d) => d.kind === 'coa');

  return (
    <main className="bg-background text-foreground">
      <section className="mx-auto max-w-[1200px] px-5 py-12 sm:px-8 lg:px-12">
        <Link href="/manage/lots" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-primary">
          <ArrowLeft className="size-4" /> Lots
        </Link>

        {received && (
          <p role="status" className="mt-6 flex items-center gap-2 border border-border bg-secondary p-4 text-sm">
            <CircleCheck className="size-4 text-primary" /> Receipt recorded. The lot is in quarantine.
          </p>
        )}
        {assigned && <p role="status" className="mt-6 flex items-center gap-2 border border-border bg-secondary p-4 text-sm"><CircleCheck className="size-4 text-primary" /> Assignment updated.</p>}
        {tested && (
          <p role="status" className="mt-6 flex items-center gap-2 border border-border bg-secondary p-4 text-sm">
            <CircleCheck className="size-4 text-primary" /> Test result recorded.
          </p>
        )}
        {movement && (
          <p role="status" className="mt-6 flex items-center gap-2 border border-border bg-secondary p-4 text-sm">
            <CircleCheck className="size-4 text-primary" /> Inventory movement recorded and on-hand quantity reconciled.
          </p>
        )}
        {cost && (
          <p role="status" className="mt-6 flex items-center gap-2 border border-border bg-secondary p-4 text-sm">
            <CircleCheck className="size-4 text-primary" /> Landed cost recorded.
          </p>
        )}
        {corrected && (
          <p role="status" className="mt-6 flex items-center gap-2 border border-border bg-secondary p-4 text-sm">
            <CircleCheck className="size-4 text-primary" /> Correction recorded. This is now the current record; the earlier one stays on file.
          </p>
        )}
        {decided && (
          <p role="status" className="mt-6 flex items-center gap-2 border border-border bg-secondary p-4 text-sm">
            <CircleCheck className="size-4 text-primary" /> Decision recorded. Status is now{' '}
            {LOT_STATUS_LABEL[lot.status as LotStatus] ?? lot.status}.
          </p>
        )}
        {issued && (
          <p role="status" className="mt-6 flex items-center gap-2 border border-border bg-secondary p-4 text-sm">
            <CircleCheck className="size-4 text-primary" /> Certificate {issued} issued and attached to this lot.
          </p>
        )}
        {uploaded && isDocumentType(uploaded) && (
          <p role="status" className="mt-6 flex items-center gap-2 border border-border bg-secondary p-4 text-sm">
            <CircleCheck className="size-4 text-primary" /> {DOCUMENT_LABEL[uploaded]} uploaded.
          </p>
        )}
        {uploadError && (
          <p role="alert" className="mt-6 flex items-center gap-2 border border-destructive/40 bg-secondary p-4 text-sm">
            <AlertCircle className="size-4 text-destructive" /> {uploadError}
          </p>
        )}

        <p className="mt-6 font-mono text-xs text-muted-foreground">
          {lot.productCode} &middot; {lot.productName} &middot; CAS {lot.casNumber}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-4">
          <h1 className="font-display text-4xl font-extrabold tracking-[-0.05em]">{lot.lotNumber}</h1>
          <span className="inline-block bg-secondary px-2 py-1 font-mono text-[11px] uppercase tracking-[0.08em]">
            {LOT_STATUS_LABEL[lot.status as LotStatus] ?? lot.status}
          </span>
        </div>
        {lot.statusReason && <p className="mt-3 text-sm text-muted-foreground">{lot.statusReason}</p>}
        {versions.length > 1 && (
          <p className="mt-3 font-mono text-xs text-muted-foreground">
            Record version {versions.length} of {versions.length} &middot; corrected {versions.length - 1} time{versions.length === 2 ? '' : 's'}; earlier versions:{' '}
            {versions
              .slice(0, -1)
              .map((x) => `${x.id} (${x.createdAt.toISOString().slice(0, 10)})`)
              .join(', ')}
          </p>
        )}
        {canRecordResults(staff) && (
          <div className="mt-6">
            <LotCorrectionForm initial={correctionInitial} quantityLocked={lot.quantityRemaining !== lot.quantityReceived} action={correctLotAction.bind(null, lot.lotNumber)} />
          </div>
        )}
        <h2 className="mt-10 utility-label text-primary">Queue assignment</h2>
        <dl className="mt-4 border-t border-border">
          <Row label="Current owner" value={lot.assignedName} />
          <Row label="Service due" value={day(lot.serviceDueAt)} />
        </dl>
        {canRecordResults(staff) && <QueueAssignmentForm ownerId={lot.assignedTo ?? ''} people={assignees} due={day(lot.serviceDueAt) === '—' ? '' : day(lot.serviceDueAt)} action={assignLotAction.bind(null, lot.lotNumber)} />}
        <p className="mt-6 text-sm font-semibold">Assignment history</p>
        {assignmentEvents.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No assignment changes recorded yet.</p> : (
          <ul className="mt-2 divide-y divide-border border border-border text-sm">
            {assignmentEvents.map((event) => <li key={event.id} className="p-3"><span className="font-mono text-xs">{day(event.createdAt)}</span> · {event.fromOwner ?? 'Unassigned'} → <strong>{event.toOwner ?? 'Unassigned'}</strong> · due {day(event.toServiceDueAt)} · {event.assignedBy}</li>)}
          </ul>
        )}

        <div className="mt-10 grid gap-12 lg:grid-cols-2">
          <div>
            <h2 className="utility-label text-primary">Receipt and provenance</h2>
            <dl className="mt-4 border-t border-border">
              <Row label="Date received" value={day(lot.receivedAt)} />
              <Row label="Quantity received" value={lot.quantityReceived} />
              <Row label="Quantity remaining" value={lot.quantityRemaining} />
              <Row label="Manufacturer" value={lot.manufacturerName} />
              <Row label="Manufacturer address" value={lot.manufacturerAddress} />
              <Row label="Supplier" value={lot.supplierName} />
              <Row label="Country of origin" value={lot.countryOfOrigin} />
              <Row label="Customs entry" value={lot.entryNumber} />
              <Row label="Date of manufacture" value={day(lot.manufactureDate)} />
              <Row label="Retest date" value={day(lot.retestDate)} />
              <Row label="Storage location" value={lot.storageLocation} />
              <Row label="Storage condition" value={lot.storageCondition} />
              <Row label="Container size" value={lot.containerSize} />
              <Row label="Landed cost" value={lot.costCents === null ? null : `$${(lot.costCents / 100).toFixed(2)}${lot.costNote ? ` — ${lot.costNote}` : ''}`} />
            </dl>
            {canManageFinance(staff) && (
              <form method="post" action={`/api/manage/lots/${encodeURIComponent(lot.lotNumber)}/cost`} className="mt-4 flex flex-wrap items-end gap-3 text-sm">
                <label className="flex flex-col gap-1">
                  Landed cost (USD)
                  <input name="cost" defaultValue={lot.costCents === null ? '' : (lot.costCents / 100).toFixed(2)} className="h-10 w-36 border border-foreground/20 bg-background px-3 font-mono text-sm" />
                </label>
                <label className="flex flex-col gap-1">
                  Note
                  <input name="costNote" defaultValue={lot.costNote ?? ''} maxLength={200} className="h-10 w-56 border border-foreground/20 bg-background px-3 text-sm" />
                </label>
                <button type="submit" className="h-10 border border-foreground/20 px-4 font-semibold hover:border-primary hover:text-primary">
                  Record cost
                </button>
              </form>
            )}
          </div>
          <div>
            <h2 className="utility-label text-primary">Analytical record</h2>
            <dl className="mt-4 border-t border-border">
              <Row label="Purity" value={lot.purityResult ? `${lot.purityResult}${lot.purityMethod ? ` (${lot.purityMethod})` : ''}` : null} />
              <Row label="Identity" value={lot.identityConfirmed ? `Confirmed${lot.identityMethod ? ` by ${lot.identityMethod}` : ''}` : 'Not confirmed'} />
              <Row label="Water content" value={lot.waterContent} />
              <Row label="Heavy metals" value={lot.heavyMetalsSummary} />
              <Row label="Released by" value={lot.releasedBy} />
              <Row label="Released at" value={day(lot.releasedAt)} />
            </dl>

          </div>
        </div>

        <h2 className="mt-12 utility-label text-primary">Container labels</h2>
        {label === null ? (
          <p className="mt-4 text-sm text-muted-foreground">Unavailable.</p>
        ) : (
          <div className="mt-4 border border-border bg-secondary p-5">
            {label.blockers.length > 0 ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Labels cannot be printed for this lot yet:
                </p>
                <ul className="mt-3 space-y-1.5 text-sm">
                  {label.blockers.map((blocker) => (
                    <li key={blocker} className="flex gap-2">
                      <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
                      <span>{blocker}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 text-xs leading-5 text-muted-foreground">
                  Classification is set on the product page. The registered address, telephone and
                  pictogram artwork are set under Hazard comms.
                </p>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Printed on demand from the classification held against{' '}
                  <span className="font-mono">{lot.productCode}</span>. Labels are not archived;
                  the classification behind them is.
                </p>
                <form
                  method="get"
                  action={`/api/manage/lots/${encodeURIComponent(lot.lotNumber)}/label`}
                  target="_blank"
                  className="mt-4 flex flex-wrap items-end gap-3"
                >
                  <label className="flex flex-col gap-1.5 text-sm">
                    Label stock
                    <select
                      name="size"
                      defaultValue="bottle"
                      className="h-11 border border-foreground/20 bg-background px-3 text-sm"
                    >
                      {Object.entries(LABEL_SIZES).map(([key, stock]) => (
                        <option key={key} value={key}>
                          {stock.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm">
                    Copies
                    <input
                      name="copies"
                      type="number"
                      min={1}
                      max={100}
                      defaultValue={1}
                      className="h-11 w-24 border border-foreground/20 bg-background px-3 text-sm"
                    />
                  </label>
                  <button
                    type="submit"
                    className="inline-flex h-11 items-center justify-center gap-2 border border-foreground/20 px-5 text-sm font-bold hover:bg-background"
                  >
                    <FileText className="size-4" /> Print labels
                  </button>
                </form>
                <p className="mt-4 text-xs leading-5 text-muted-foreground">
                  If the content does not fit the stock chosen, the label is refused rather than
                  trimmed — every element on it is required.
                </p>
              </>
            )}
          </div>
        )}

        <h2 className="mt-12 utility-label text-primary">Certificate of analysis</h2>
        {coa === null ? (
          <p className="mt-4 text-sm text-muted-foreground">Unavailable.</p>
        ) : (
          <div className="mt-4 grid gap-8 lg:grid-cols-[1fr_20rem]">
            <div>
              {coaHistory.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No certificate has been issued for this lot yet.
                </p>
              ) : (
                <ul className="border-t border-border">
                  {coaHistory.map((doc) => (
                    <li key={doc.id} className="grid gap-1 border-b border-border py-3 sm:grid-cols-[220px_1fr] sm:gap-6">
                      <span className="text-sm font-semibold text-muted-foreground">
                        {doc.documentNumber}
                        {doc.supersededById && (
                          <span className="ml-2 font-normal text-xs">superseded</span>
                        )}
                      </span>
                      <span className="font-mono text-sm leading-6">
                        <a
                          href={`/api/manage/documents/${doc.id}`}
                          className="inline-flex items-center gap-1.5 font-semibold text-primary"
                        >
                          <Download className="size-3.5" /> Download
                        </a>
                        <span className="ml-3 text-xs text-muted-foreground">
                          {day(doc.issuedAt)} &middot; {doc.issuedBy} &middot; {bytes(doc.sizeBytes)}
                        </span>
                        <span className="mt-1 block break-all text-[11px] text-muted-foreground">
                          SHA-256 {doc.sha256}
                        </span>
                        {doc.supersedeReason && (
                          <span className="mt-1 block text-xs text-muted-foreground">{doc.supersedeReason}</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex flex-col gap-4 border border-border bg-secondary p-5">
              <p className="text-sm font-semibold">
                {coaHistory.length === 0 ? 'Issue the certificate' : 'Reissue the certificate'}
              </p>
              <p className="font-mono text-xs text-muted-foreground">{coa.documentNumber}</p>

              {coa.blockers.length > 0 ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    Outstanding before a certificate can be issued:
                  </p>
                  <ul className="space-y-1.5 text-sm">
                    {coa.blockers.map((blocker) => (
                      <li key={blocker} className="flex gap-2">
                        <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
                        <span>{blocker}</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Every requirement is met. Read the preview before issuing — once issued, the
                  certificate is a record and can only be replaced by a numbered reissue.
                </p>
              )}

              {canRecordResults(staff) && (
                <a
                  href={`/api/manage/lots/${encodeURIComponent(lot.lotNumber)}/coa`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-11 items-center justify-center gap-2 border border-foreground/20 px-5 text-sm font-bold hover:bg-background"
                >
                  <FileText className="size-4" /> Preview
                </a>
              )}

              {canRecordResults(staff) && coa.blockers.length === 0 && (
                <form
                  method="post"
                  action={`/api/manage/lots/${encodeURIComponent(lot.lotNumber)}/coa`}
                  className="flex flex-col gap-3"
                >
                  {coaHistory.length > 0 && (
                    <label className="flex flex-col gap-1.5 text-sm">
                      Reason for reissue
                      <input
                        name="reason"
                        required
                        maxLength={200}
                        placeholder="What changed since the last certificate"
                        className="h-11 border border-foreground/20 bg-background px-3 text-sm"
                      />
                    </label>
                  )}
                  <button
                    type="submit"
                    className="inline-flex h-11 items-center justify-center bg-primary px-5 text-sm font-bold text-primary-foreground hover:bg-primary/90"
                  >
                    {coaHistory.length === 0 ? 'Issue certificate' : 'Issue reissue'}
                  </button>
                </form>
              )}

              <p className="text-xs leading-5 text-muted-foreground">
                The certificate is generated from this lot record and its results, and becomes the
                certificate of analysis on file. The previous one is kept, never deleted.
              </p>
            </div>
          </div>
        )}

        <h2 className="mt-12 utility-label text-primary">Documents</h2>
        <div className="mt-4 grid gap-8 lg:grid-cols-[1fr_20rem]">
          <dl className="border-t border-border">
            {DOCUMENT_TYPES.map((type) => {
              const key = currentDocumentKey(lot, type);
              const current = documents.find((d) => d.objectKey === key);
              return (
                <div key={type} className="grid gap-1 border-b border-border py-3 sm:grid-cols-[220px_1fr] sm:gap-6">
                  <dt className="text-sm font-semibold text-muted-foreground">{DOCUMENT_LABEL[type]}</dt>
                  <dd className="font-mono text-sm leading-6">
                    {key ? (
                      <span className="flex flex-wrap items-center gap-3">
                        <a
                          href={`/api/manage/lots/${encodeURIComponent(lot.lotNumber)}/documents/${type}`}
                          className="inline-flex items-center gap-1.5 font-semibold text-primary"
                        >
                          <Download className="size-3.5" /> Download
                        </a>
                        {current && (
                          <span className="text-xs text-muted-foreground">
                            {current.originalName ?? key.split('/').pop()} &middot; {bytes(current.sizeBytes)} &middot;{' '}
                            {day(current.uploadedAt)} &middot; {current.uploadedBy}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Not on file</span>
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>

          {canRecordResults(staff) && (
            <form
              method="post"
              action={`/api/manage/lots/${encodeURIComponent(lot.lotNumber)}/documents`}
              encType="multipart/form-data"
              className="flex flex-col gap-4 border border-border bg-secondary p-5"
            >
              <p className="text-sm font-semibold">Upload a document</p>
              <label className="flex flex-col gap-1.5 text-sm">
                Type
                <select name="type" required className="h-11 border border-foreground/20 bg-background px-3 font-mono text-sm">
                  {DOCUMENT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {DOCUMENT_LABEL[type]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                File (PDF, PNG or JPEG, up to 25 MB)
                <input name="file" type="file" required accept="application/pdf,image/png,image/jpeg" className="text-sm" />
              </label>
              <button
                type="submit"
                className="inline-flex h-11 items-center justify-center bg-primary px-5 text-sm font-bold text-primary-foreground hover:bg-primary/90"
              >
                Upload
              </button>
              <p className="text-xs leading-5 text-muted-foreground">
                A new upload replaces the current file of that type. The previous file is kept, never deleted.
              </p>
            </form>
          )}
        </div>

        {documents.some((d) => d.supersededAt) && (
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer font-semibold text-muted-foreground">Superseded documents</summary>
            <ul className="mt-3 space-y-1 font-mono text-xs text-muted-foreground">
              {documents
                .filter((d) => d.supersededAt)
                .map((d) => (
                  <li key={d.id}>
                    {DOCUMENT_LABEL[d.documentType as keyof typeof DOCUMENT_LABEL] ?? d.documentType} &middot;{' '}
                    {d.originalName ?? d.objectKey} &middot; {day(d.uploadedAt)} by {d.uploadedBy} &middot; superseded{' '}
                    {day(d.supersededAt)}
                  </li>
                ))}
            </ul>
          </details>
        )}

        <h2 className="mt-12 utility-label text-primary">Test results ({tests.length})</h2>
        {tests.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">No test results recorded yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto border border-border">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary">
                  <th className="p-3 font-semibold">Test</th>
                  <th className="p-3 font-semibold">Analyte</th>
                  <th className="p-3 font-semibold">Method</th>
                  <th className="p-3 font-semibold">Result</th>
                  <th className="p-3 font-semibold">Specification</th>
                  <th className="p-3 font-semibold">Pass</th>
                  <th className="p-3 font-semibold">Tested by</th>
                </tr>
              </thead>
              <tbody>
                {tests.map((t) => (
                  <tr key={t.id} className="border-b border-border last:border-b-0">
                    <td className="p-3">{TEST_TYPE_LABEL[t.testType as TestType] ?? t.testType}</td>
                    <td className="p-3">{t.analyte ?? '—'}</td>
                    <td className="p-3 font-mono text-xs">{t.method}</td>
                    <td className="p-3 font-mono text-xs">{t.result}</td>
                    <td className="p-3 font-mono text-xs">{t.specification ?? '—'}</td>
                    <td className="p-3">{t.passed === null ? '—' : t.passed ? 'Pass' : 'Fail'}</td>
                    <td className="p-3">{t.testedBy ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {canRecordResults(staff) && (
          <div className="mt-6">
            <LotTestForm today={new Date().toISOString().slice(0, 10)} action={addLotTestAction.bind(null, lot.lotNumber)} />
          </div>
        )}

        <h2 className="mt-12 utility-label text-primary">Publication</h2>
        <div className={`mt-4 border p-5 text-sm ${lot.status === 'released' && pubBlockers.length > 0 ? 'border-destructive/40 bg-destructive/5' : 'border-border bg-secondary'}`}>
          <p className="font-semibold">
            {lot.status !== 'released'
              ? 'Not public: the lot is not released.'
              : pubBlockers.length === 0
                ? 'Public: this lot appears on the product page, the lot page and in lookup, and can be allocated to orders.'
                : 'Released but NOT public and NOT allocatable to orders.'}
          </p>
          <p className="mt-1 text-muted-foreground">
            Release covers the legal minimum. Publication additionally requires a certificate a customer can check: the testing
            laboratory named, the laboratory&rsquo;s own accession number, and the testing standard it was tested under.
          </p>
          {lot.status === 'released' && pubBlockers.length > 0 && (
            <ul className="mt-3 list-disc space-y-1 pl-5">
              {pubBlockers.filter((b) => b !== 'Lot is not released.').map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          )}
          {pubWarnings.length > 0 && (
            <ul className="mt-3 space-y-1 text-muted-foreground">
              {pubWarnings.map((w) => (
                <li key={w}>Advisory: {w}</li>
              ))}
            </ul>
          )}
        </div>

        <h2 className="mt-12 utility-label text-primary">Disposition</h2>
        <div className="mt-4 grid gap-8 lg:grid-cols-[1fr_1fr]">
          {canRecordResults(staff) ? (
            <LotDispositionForm
              currentStatus={lot.status}
              allowed={allowed}
              blockers={blockers}
              action={setLotDispositionAction.bind(null, lot.lotNumber)}
            />
          ) : (
            <div className="border border-border bg-secondary p-5 text-sm">
              <p className="font-semibold">Release checklist</p>
              <ul className="mt-2 space-y-1">
                {blockers.length === 0 ? <li>All release conditions are met.</li> : blockers.map((b) => <li key={b}>{b}</li>)}
              </ul>
              <p className="mt-3 text-muted-foreground">Only QC and admin roles can record a decision.</p>
            </div>
          )}
          <div>
            <p className="text-sm font-semibold">Decision history</p>
            {statusEvents.filter((e) => e.kind !== 'cost').length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No decisions recorded yet.</p>
            ) : (
              <ul className="mt-2 divide-y divide-border border border-border text-sm">
                {statusEvents.filter((e) => e.kind !== 'cost').map((e) => (
                  <li key={e.id} className="p-3">
                    <span className="font-mono text-xs">{day(e.createdAt)}</span> &middot;{' '}
                    {e.kind === 'correction' ? (
                      <span className="font-semibold">Record corrected</span>
                    ) : (
                      <>
                        {e.fromStatus} &rarr; <span className="font-semibold">{e.toStatus}</span>
                      </>
                    )}{' '}
                    &middot; {e.decidedBy}
                    {e.reason && <p className="mt-1 text-muted-foreground">{e.reason}</p>}
                  </li>
                ))}
              </ul>
            )}
            {statusEvents.some((e) => e.kind === 'cost') && (
              <>
                <p className="mt-6 text-sm font-semibold">Cost history</p>
                <ul className="mt-2 divide-y divide-border border border-border text-sm">
                  {statusEvents.filter((e) => e.kind === 'cost').map((e) => (
                    <li key={e.id} className="p-3">
                      <span className="font-mono text-xs">{day(e.createdAt)}</span> &middot; {e.decidedBy}
                      {e.reason && <p className="mt-1 text-muted-foreground">{e.reason}</p>}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>

        <h2 className="mt-12 utility-label text-primary">
          Who received this lot ({consignees.length})
        </h2>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          The recall question, answered from the order lines stamped at dispatch — not from the
          movement ledger below. If this lot had to be recalled today, these are the people to
          notify and this is how well you could reach them.
        </p>
        {consignees.length === 0 ? (
          <p className="mt-4 border border-border p-4 text-sm text-muted-foreground">
            No shipped order line carries this lot.
          </p>
        ) : (
          <>
            <p className="mt-4 flex flex-wrap gap-4 border border-border bg-secondary p-4 text-sm">
              <span>
                <strong>{reach.reachable}</strong> reachable
              </span>
              <span>
                <strong>{reach.unproven}</strong> unproven
              </span>
              <span className={reach.unreachable ? 'text-destructive' : undefined}>
                <strong>{reach.unreachable}</strong> not reachable
              </span>
              <span>
                <strong>{reach.withSecondRoute}</strong> with a phone number
              </span>
            </p>
            <div className="mt-4 overflow-x-auto border border-border">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary">
                    <th className="p-3 font-semibold">Shipped</th>
                    <th className="p-3 font-semibold">Order</th>
                    <th className="p-3 font-semibold">Consignee</th>
                    <th className="p-3 font-semibold">Destination</th>
                    <th className="p-3 font-semibold">Packs</th>
                    <th className="p-3 font-semibold">Reachable</th>
                  </tr>
                </thead>
                <tbody>
                  {consignees.map((consignee) => (
                    <tr key={`${consignee.orderNumber}-${consignee.sku}`} className="border-b border-border/60 align-top">
                      <td className="p-3 whitespace-nowrap">
                        {consignee.shippedAt?.toISOString().slice(0, 10) ?? '—'}
                      </td>
                      <td className="p-3">
                        <Link
                          href={`/manage/orders/${encodeURIComponent(consignee.orderNumber)}`}
                          className="font-mono text-xs text-primary underline"
                        >
                          {consignee.orderNumber}
                        </Link>
                      </td>
                      <td className="p-3">
                        {consignee.consigneeName}
                        {consignee.consigneeInstitution && (
                          <span className="block text-xs text-muted-foreground">
                            {consignee.consigneeInstitution}
                          </span>
                        )}
                        <span className="block text-xs text-muted-foreground">
                          {consignee.reachability.email ?? 'no email on the record'}
                          {consignee.reachability.phone ? ` · ${consignee.reachability.phone}` : ''}
                        </span>
                      </td>
                      <td className="p-3">{consignee.destination}</td>
                      <td className="p-3">{consignee.packs}</td>
                      <td className="p-3">
                        <span
                          className={`border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                            consignee.reachability.state === 'unreachable'
                              ? 'border-destructive/40 text-destructive'
                              : 'border-border'
                          }`}
                        >
                          {reachabilityLabel(consignee.reachability.state)}
                        </span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {consignee.reachability.reasons[0]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <h2 className="mt-12 utility-label text-primary">Movement ledger ({movements.length})</h2>
        {canFulfil(staff) && (
          <InventoryMovementForm
            today={new Date().toISOString().slice(0, 10)}
            canIncrease={canVerifyAccounts(staff)}
            action={recordInventoryMovementAction.bind(null, lot.lotNumber)}
          />
        )}
        <div className="mt-4 overflow-x-auto border border-border">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary">
                <th className="p-3 font-semibold">Date</th>
                <th className="p-3 font-semibold">Type</th>
                <th className="p-3 font-semibold">Quantity</th>
                <th className="p-3 font-semibold">Counterparty</th>
                <th className="p-3 font-semibold">Recorded by</th>
                <th className="p-3 font-semibold">Note</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((m) => (
                <tr key={m.id} className="border-b border-border last:border-b-0">
                  <td className="p-3 font-mono text-xs">{day(m.occurredAt)}</td>
                  <td className="p-3">{MOVEMENT_LABEL[m.movementType] ?? m.movementType}</td>
                  <td className="p-3 font-mono text-xs">
                    {m.direction === 'increase' ? '+' : m.direction === 'decrease' ? '−' : ''}{m.quantity}
                  </td>
                  <td className="p-3">{m.consigneeName ?? '—'}{m.consigneeInstitution ? ` · ${m.consigneeInstitution}` : ''}</td>
                  <td className="p-3">{m.recordedBy}</td>
                  <td className="p-3 text-muted-foreground">
                    {m.note ?? '—'}
                    {(m.witnessOne || m.witnessTwo) && (
                      <span className="mt-1 block text-xs">
                        Witnesses: {[m.witnessOne, m.witnessTwo].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
