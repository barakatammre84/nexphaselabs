'use client';

import { useState } from 'react';
import { AlertCircle, Download, Loader2, Search } from 'lucide-react';

const DOCUMENT_LABEL: Record<string, string> = {
  coa: 'Certificate of analysis',
  chromatogram: 'HPLC chromatogram',
  mass_spec: 'Mass spectrum',
  sds: 'Safety data sheet',
};

type LotTest = {
  testType: string;
  analyte: string | null;
  method: string;
  result: string;
  specification: string | null;
  passed: boolean | null;
};

type LotSearchHit = {
  lotNumber: string;
  productCode: string;
  productName: string;
  casNumber: string;
  accessionNumber: string | null;
  analyticalLab: string | null;
  purityResult: string | null;
  releasedOn: string | null;
};

type LotRecord = {
  lotNumber: string;
  productCode: string;
  productName: string;
  casNumber: string;
  manufacturerName: string | null;
  manufacturerAddress: string | null;
  countryOfOrigin: string | null;
  manufactureDate: string | null;
  purityResult: string | null;
  purityMethod: string | null;
  identityConfirmed: boolean;
  identityMethod: string | null;
  waterContent: string | null;
  heavyMetalsSummary: string | null;
  accessionNumber: string | null;
  analyticalLab: string | null;
  netPeptideContent: string | null;
  appearance: string | null;
  testingStandard: string | null;
  retestDate: string | null;
  storageCondition: string | null;
  releasedOn: string | null;
  documents: Record<string, boolean>;
  tests: LotTest[];
};

const TEST_LABEL: Record<string, string> = {
  identity: 'Identity',
  purity: 'Purity',
  water: 'Water content',
  endotoxin: 'Bacterial endotoxin',
  heavy_metal: 'Heavy metal',
  residual_solvent: 'Residual solvent',
};

function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="grid gap-1 border-b border-border py-4 sm:grid-cols-[220px_1fr] sm:gap-6">
      <dt className="text-sm font-semibold text-muted-foreground">{label}</dt>
      <dd className="break-words font-mono text-sm leading-6">{value}</dd>
    </div>
  );
}

export function LotLookup() {
  const [query, setQuery] = useState('');
  const [state, setState] = useState<
    'idle' | 'loading' | 'found' | 'hits' | 'missing' | 'error'
  >('idle');
  const [record, setRecord] = useState<LotRecord | null>(null);
  const [hits, setHits] = useState<LotSearchHit[]>([]);
  const [message, setMessage] = useState('');

  /**
   * One box, three axes: lot number, accession number, or product.
   *
   * Try an exact lot match first, because that is what someone holding a vial
   * types. Fall back to search so an accession number from a certificate, or a
   * product name, also resolves. Anything unreleased 404s at both steps.
   */
  async function lookup(term: string) {
    setState('loading');
    setRecord(null);
    setHits([]);
    setMessage('');

    try {
      const exact = await fetch(`/api/lots/${encodeURIComponent(term)}`);
      if (exact.ok) {
        setRecord((await exact.json()) as LotRecord);
        setState('found');
        return;
      }
      if (exact.status === 503) {
        const body = (await exact.json().catch(() => ({}))) as {
          error?: string;
        };
        setMessage(body.error ?? 'Lot records are temporarily unavailable.');
        setState('error');
        return;
      }

      const search = await fetch(
        `/api/lots/search?q=${encodeURIComponent(term)}`,
      );
      if (search.ok) {
        const body = (await search.json()) as { results: LotSearchHit[] };
        if (body.results.length === 1) {
          const only = await fetch(
            `/api/lots/${encodeURIComponent(body.results[0].lotNumber)}`,
          );
          if (only.ok) {
            setRecord((await only.json()) as LotRecord);
            setState('found');
            return;
          }
        }
        if (body.results.length > 0) {
          setHits(body.results);
          setState('hits');
          return;
        }
      }

      setMessage(
        'No released lot matches that lot number, accession number, or product.',
      );
      setState('missing');
    } catch {
      setMessage(
        'The lot service could not be reached. Try again, or email research@nexphaselabs.net.',
      );
      setState('error');
    }
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const term = query.trim();
    if (term.length < 2) return;
    await lookup(term);
  }

  return (
    <div>
      <form
        onSubmit={onSubmit}
        className="flex max-w-2xl flex-col gap-3 sm:flex-row"
      >
        <label htmlFor="lot" className="sr-only">
          Lot number, accession number, or product
        </label>
        <input
          id="lot"
          name="lot"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Lot number, accession number, or product"
          autoComplete="off"
          spellCheck={false}
          className="h-12 flex-1 rounded-full border border-input bg-secondary px-5 font-mono text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
        />
        <button
          type="submit"
          disabled={state === 'loading' || !query.trim()}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-bold text-primary-foreground shadow-[0_10px_24px_rgba(4,110,149,0.22)] transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {state === 'loading' ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Search className="size-4" />
          )}
          Look up lot
        </button>
      </form>

      {(state === 'missing' || state === 'error') && (
        <div className="mt-8 flex max-w-xl items-start gap-3 rounded-[1.25rem] border border-border bg-secondary p-5">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-primary" />
          <p className="text-sm leading-6">{message}</p>
        </div>
      )}

      {state === 'hits' && hits.length > 0 && (
        <div className="mt-10">
          <p className="utility-label text-primary">
            {hits.length} released {hits.length === 1 ? 'lot' : 'lots'}
          </p>
          <div className="mt-5 overflow-x-auto border border-border">
            <table className="w-full min-w-[44rem] text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary">
                  <th className="p-4 font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                    Lot
                  </th>
                  <th className="p-4 font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                    Material
                  </th>
                  <th className="p-4 font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                    Accession
                  </th>
                  <th className="p-4 font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                    Purity
                  </th>
                  <th className="p-4 font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                    Released
                  </th>
                </tr>
              </thead>
              <tbody>
                {hits.map((hit) => (
                  <tr
                    key={hit.lotNumber}
                    className="border-b border-border last:border-b-0"
                  >
                    <td className="p-4">
                      <button
                        type="button"
                        onClick={() => {
                          setQuery(hit.lotNumber);
                          void lookup(hit.lotNumber);
                        }}
                        className="font-mono text-sm font-semibold text-primary underline underline-offset-2"
                      >
                        {hit.lotNumber}
                      </button>
                    </td>
                    <td className="p-4">
                      {hit.productName}
                      <span className="block font-mono text-[11px] text-muted-foreground">
                        {hit.productCode} &middot; CAS {hit.casNumber}
                      </span>
                    </td>
                    <td className="p-4 font-mono text-xs text-muted-foreground">
                      {hit.accessionNumber ?? '\u2014'}
                    </td>
                    <td className="p-4 font-mono text-xs">
                      {hit.purityResult ?? '\u2014'}
                    </td>
                    <td className="p-4 font-mono text-xs text-muted-foreground">
                      {hit.releasedOn ?? '\u2014'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {state === 'found' && record && (
        <div className="mt-10">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
            <h2 className="font-display text-3xl font-extrabold tracking-[-0.04em]">
              {record.lotNumber}
            </h2>
            <span className="font-mono text-sm text-muted-foreground">
              {record.productCode} &middot; {record.productName}
            </span>
          </div>

          <dl className="mt-8 max-w-4xl border-t border-border">
            <Field label="CAS number" value={record.casNumber} />
            <Field label="Manufacturer" value={record.manufacturerName} />
            <Field
              label="Manufacturer address"
              value={record.manufacturerAddress}
            />
            <Field label="Country of origin" value={record.countryOfOrigin} />
            <Field label="Date of manufacture" value={record.manufactureDate} />
            <Field
              label="Purity"
              value={
                record.purityResult
                  ? `${record.purityResult}${record.purityMethod ? ` (${record.purityMethod})` : ''}`
                  : null
              }
            />
            <Field
              label="Identity"
              value={
                record.identityConfirmed
                  ? `Confirmed${record.identityMethod ? ` by ${record.identityMethod}` : ''}`
                  : 'Not confirmed'
              }
            />
            <Field label="Appearance" value={record.appearance} />
            <Field
              label="Net peptide content"
              value={record.netPeptideContent}
            />
            <Field label="Water content" value={record.waterContent} />
            <Field label="Heavy metals" value={record.heavyMetalsSummary} />
            <Field label="Storage condition" value={record.storageCondition} />
            <Field label="Testing laboratory" value={record.analyticalLab} />
            <Field label="Accession number" value={record.accessionNumber} />
            <Field label="Testing standard" value={record.testingStandard} />
            <Field label="Released on" value={record.releasedOn} />
            <Field label="Retest date" value={record.retestDate} />
          </dl>

          <div className="mt-10">
            <h3 className="utility-label text-primary">
              Documents for this lot
            </h3>
            {Object.values(record.documents).some(Boolean) ? (
              <ul className="mt-5 max-w-xl divide-y divide-border border border-border">
                {Object.entries(record.documents)
                  .filter(([, present]) => present)
                  .map(([type]) => (
                    <li
                      key={type}
                      className="flex items-center justify-between gap-4 p-4 text-sm"
                    >
                      <span>{DOCUMENT_LABEL[type] ?? type}</span>
                      <a
                        href={`/api/lots/${encodeURIComponent(record.lotNumber)}/documents/${type}`}
                        className="inline-flex items-center gap-1.5 font-semibold text-primary"
                      >
                        <Download className="size-3.5" /> Download
                      </a>
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="mt-5 max-w-2xl leading-7 text-muted-foreground">
                Files for this lot are available on request at
                research@nexphaselabs.net, quoting the lot number.
              </p>
            )}
            <p className="mt-4 text-sm text-muted-foreground">
              Permanent record:{' '}
              <a
                href={`/lots/${encodeURIComponent(record.lotNumber)}`}
                className="font-semibold text-primary"
              >
                nexphaselabs.net/lots/{record.lotNumber}
              </a>
            </p>
          </div>

          {record.tests.length > 0 && (
            <div className="mt-12">
              <h3 className="utility-label text-primary">Analytical results</h3>
              <div className="mt-5 overflow-x-auto border border-border">
                <table className="w-full min-w-[44rem] text-left text-sm">
                  <thead>
                    <tr className="border-b border-border bg-secondary">
                      <th className="p-4 font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                        Test
                      </th>
                      <th className="p-4 font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                        Analyte
                      </th>
                      <th className="p-4 font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                        Method
                      </th>
                      <th className="p-4 font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                        Result
                      </th>
                      <th className="p-4 font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                        Specification
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {record.tests.map((test, index) => (
                      <tr
                        key={`${test.testType}-${test.analyte ?? index}`}
                        className="border-b border-border last:border-b-0"
                      >
                        <td className="p-4">
                          {TEST_LABEL[test.testType] ?? test.testType}
                        </td>
                        <td className="p-4 text-muted-foreground">
                          {test.analyte ?? '—'}
                        </td>
                        <td className="p-4 font-mono text-xs">{test.method}</td>
                        <td className="p-4 font-mono text-xs">{test.result}</td>
                        <td className="p-4 font-mono text-xs text-muted-foreground">
                          {test.specification ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
