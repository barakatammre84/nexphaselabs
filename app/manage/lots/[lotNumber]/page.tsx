import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AlertCircle, ArrowLeft, CircleCheck, Download } from 'lucide-react';
import { LotTestForm } from '@/components/manage/lot-test-form';
import { DOCUMENT_LABEL, DOCUMENT_TYPES, isDocumentType } from '@/lib/documents';
import { TEST_TYPE_LABEL, lotNumberFromParam, type TestType } from '@/lib/lot-rules';
import { LOT_STATUS_LABEL, currentDocumentKey, getLotDetail, type LotStatus } from '@/lib/lots-admin';
import { canRecordResults, requireStaff } from '@/lib/staff-auth';
import { addLotTestAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Lot', robots: { index: false, follow: false } };

type Props = {
  params: Promise<{ lotNumber: string }>;
  searchParams: Promise<{ received?: string; uploaded?: string; error?: string; tested?: string }>;
};

const UPLOAD_ERROR: Record<string, string> = {
  type: 'Choose a document type.',
  nofile: 'Choose a file to upload.',
  size: 'The file is larger than 25 MB.',
  filetype: 'Only PDF, PNG and JPEG files are accepted.',
  badform: 'The upload could not be read.',
  store: 'The file could not be stored. Try again shortly.',
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
  const { received, uploaded, error, tested } = await searchParams;
  const staff = await requireStaff(`/manage/lots/${encodeURIComponent(lotNumber)}`);

  const normalised = lotNumberFromParam(lotNumber);
  if (!normalised) notFound();
  const detail = await getLotDetail(normalised);
  if (!detail) notFound();
  const { lot, tests, movements, documents } = detail;
  const uploadError = error ? (UPLOAD_ERROR[error] ?? UPLOAD_ERROR.store) : null;

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
        {tested && (
          <p role="status" className="mt-6 flex items-center gap-2 border border-border bg-secondary p-4 text-sm">
            <CircleCheck className="size-4 text-primary" /> Test result recorded.
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
            </dl>
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

        <h2 className="mt-12 utility-label text-primary">Movement ledger ({movements.length})</h2>
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
                  <td className="p-3 font-mono text-xs">{m.quantity}</td>
                  <td className="p-3">{m.consigneeName ?? '—'}{m.consigneeInstitution ? ` · ${m.consigneeInstitution}` : ''}</td>
                  <td className="p-3">{m.recordedBy}</td>
                  <td className="p-3 text-muted-foreground">{m.note ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
