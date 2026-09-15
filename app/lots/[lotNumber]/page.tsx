import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Download } from 'lucide-react';
import { CatalogUnavailable } from '@/components/site/catalog-unavailable';
import { ResearchNoticeBlock } from '@/components/site/research-notice';
import { REGULATORY_STATEMENT } from '@/lib/catalog';
import { loadCatalog } from '@/lib/catalog-data';
import { DOCUMENT_LABEL, DOCUMENT_TYPES } from '@/lib/documents';
import { TEST_TYPE_LABEL, lotNumberFromParam, type TestType } from '@/lib/lot-rules';
import { getPublicLot, publicDocumentPath } from '@/lib/lots-public';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ lotNumber: string }> };

/**
 * Permanent public page for a released lot. Indexable on purpose: a lot
 * record is a unique, genuinely useful page no competitor can duplicate. It
 * carries the regulatory statement in the body, above the fold, and nothing
 * about what the material does.
 */

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lotNumber } = await params;
  const normalised = lotNumberFromParam(lotNumber);
  if (!normalised) return { title: 'Lot not found' };
  const loaded = await loadCatalog(() => getPublicLot(normalised));
  if (!loaded.data) return { title: loaded.unavailable ? 'Lot records unavailable' : 'Lot not found' };
  const lot = loaded.data;
  return {
    title: `Lot ${lot.lotNumber} — ${lot.productName} (${lot.productCode})`,
    description: `Analytical record for lot ${lot.lotNumber} of ${lot.productName}, CAS ${lot.casNumber}: certificate of analysis, identity and purity results. Laboratory research use only.`,
  };
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="grid gap-1 border-b border-border py-4 sm:grid-cols-[220px_1fr] sm:gap-6">
      <dt className="text-sm font-semibold text-muted-foreground">{label}</dt>
      <dd className="break-words font-mono text-sm leading-6">{value}</dd>
    </div>
  );
}

export default async function PublicLotPage({ params }: Props) {
  const { lotNumber } = await params;
  const normalised = lotNumberFromParam(lotNumber);
  if (!normalised) notFound();

  const loaded = await loadCatalog(() => getPublicLot(normalised));
  if (loaded.unavailable) {
    return (
      <main className="bg-background text-foreground">
        <section className="mx-auto max-w-[1500px] px-5 py-14 sm:px-8 lg:px-12">
          <CatalogUnavailable />
        </section>
      </main>
    );
  }
  const lot = loaded.data;
  if (!lot) notFound();

  const available = DOCUMENT_TYPES.filter((t) => lot.documents[t]);

  return (
    <main className="bg-background text-foreground">
      <div className="mx-auto max-w-[1500px] px-5 pt-8 sm:px-8 lg:px-12">
        <Link
          href="/documentation/lot-lookup"
          className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-primary"
        >
          <ArrowLeft className="size-4" />
          Lot lookup
        </Link>
      </div>

      <section className="mx-auto max-w-[1500px] border-b border-border px-5 py-10 sm:px-8 lg:px-12">
        <p className="utility-label text-primary">Lot record</p>
        <h1 className="mt-5 font-display text-[clamp(2.2rem,4.5vw,3.6rem)] font-extrabold leading-[0.96] tracking-[-0.05em]">
          {lot.lotNumber}
        </h1>
        <p className="mt-3 font-mono text-sm text-muted-foreground">
          {lot.productCode} &middot; {lot.productName} &middot; CAS {lot.casNumber}
        </p>
        <p className="mt-6 max-w-2xl leading-8 text-muted-foreground">
          The analytical record for this lot as released. Files below are the certificate and instrument outputs
          for this lot, not for the product line.
        </p>
        {/* Rule 1 — conditions of supply in the body, above the fold. */}
        <div className="mt-8 max-w-2xl border-l-2 border-primary bg-secondary px-6 py-5">
          <p className="utility-label text-primary">Conditions of supply</p>
          <p className="mt-3 text-sm font-semibold leading-6">{REGULATORY_STATEMENT}</p>
        </div>
      </section>

      <section className="mx-auto max-w-[1500px] border-b border-border px-5 py-14 sm:px-8 lg:px-12">
        <div className="grid gap-12 lg:grid-cols-2">
          <div>
            <h2 className="utility-label text-primary">Lot</h2>
            <dl className="mt-5 border-t border-border">
              <Row label="Manufacturer" value={lot.manufacturerName} />
              <Row label="Manufacturer address" value={lot.manufacturerAddress} />
              <Row label="Country of origin" value={lot.countryOfOrigin} />
              <Row label="Date of manufacture" value={lot.manufactureDate} />
              <Row label="Released on" value={lot.releasedOn} />
              <Row label="Retest date" value={lot.retestDate} />
              <Row label="Storage condition" value={lot.storageCondition} />
            </dl>
          </div>
          <div>
            <h2 className="utility-label text-primary">Analytical summary</h2>
            <dl className="mt-5 border-t border-border">
              <Row label="Testing laboratory" value={lot.analyticalLab} />
              <Row label="Accession number" value={lot.accessionNumber} />
              <Row label="Testing standard" value={lot.testingStandard} />
              <Row
                label="Purity"
                value={lot.purityResult ? `${lot.purityResult}${lot.purityMethod ? ` (${lot.purityMethod})` : ''}` : null}
              />
              <Row
                label="Identity"
                value={lot.identityConfirmed ? `Confirmed${lot.identityMethod ? ` by ${lot.identityMethod}` : ''}` : null}
              />
              <Row label="Appearance" value={lot.appearance} />
              <Row label="Net peptide content" value={lot.netPeptideContent} />
              <Row label="Water content" value={lot.waterContent} />
              <Row label="Heavy metals" value={lot.heavyMetalsSummary} />
            </dl>

            <h2 className="mt-10 utility-label text-primary">Documents</h2>
            {available.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">
                Files for this lot are available on request at research@nexphaselabs.net.
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-border border border-border">
                {available.map((t) => (
                  <li key={t} className="flex items-center justify-between gap-4 p-4 text-sm">
                    <span>{DOCUMENT_LABEL[t]}</span>
                    <a
                      href={publicDocumentPath(lot.lotNumber, t)}
                      className="inline-flex items-center gap-1.5 font-semibold text-primary"
                    >
                      <Download className="size-3.5" /> Download
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {lot.tests.length > 0 && (
        <section className="mx-auto max-w-[1500px] border-b border-border px-5 py-14 sm:px-8 lg:px-12">
          <h2 className="utility-label text-primary">Analytical results</h2>
          <div className="mt-5 overflow-x-auto border border-border">
            <table className="w-full min-w-[44rem] text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary">
                  {['Test', 'Analyte', 'Method', 'Result', 'Specification'].map((h) => (
                    <th key={h} className="p-4 font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lot.tests.map((test, index) => (
                  <tr key={`${test.testType}-${test.analyte ?? index}`} className="border-b border-border last:border-b-0">
                    <td className="p-4">{TEST_TYPE_LABEL[test.testType as TestType] ?? test.testType}</td>
                    <td className="p-4 text-muted-foreground">{test.analyte ?? '—'}</td>
                    <td className="p-4 font-mono text-xs">{test.method}</td>
                    <td className="p-4 font-mono text-xs">{test.result}</td>
                    <td className="p-4 font-mono text-xs text-muted-foreground">{test.specification ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <ResearchNoticeBlock />
    </main>
  );
}
