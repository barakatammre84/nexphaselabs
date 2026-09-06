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
  const [state, setState] = useState<'idle' | 'loading' | 'found' | 'missing' | 'error'>('idle');
  const [record, setRecord] = useState<LotRecord | null>(null);
  const [message, setMessage] = useState('');

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const lot = query.trim();
    if (!lot) return;

    setState('loading');
    setRecord(null);
    setMessage('');

    try {
      const response = await fetch(`/api/lots/${encodeURIComponent(lot)}`);
      if (response.ok) {
        setRecord((await response.json()) as LotRecord);
        setState('found');
        return;
      }
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      setMessage(body.error ?? 'That lot could not be retrieved.');
      setState(response.status === 404 ? 'missing' : 'error');
    } catch {
      setMessage('The lot service could not be reached. Try again, or email research@nexphaselabs.net.');
      setState('error');
    }
  }

  return (
    <div>
      <form onSubmit={onSubmit} className="flex max-w-2xl flex-col gap-3 sm:flex-row">
        <label htmlFor="lot" className="sr-only">
          Lot number
        </label>
        <input
          id="lot"
          name="lot"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="e.g. NPL1-260714-A"
          autoComplete="off"
          spellCheck={false}
          className="h-12 flex-1 rounded-full border border-input bg-secondary px-5 font-mono text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
        />
        <button
          type="submit"
          disabled={state === 'loading' || !query.trim()}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-bold text-primary-foreground shadow-[0_10px_24px_rgba(52,127,242,0.22)] transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
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
            <Field label="Manufacturer address" value={record.manufacturerAddress} />
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
            <Field label="Water content" value={record.waterContent} />
            <Field label="Heavy metals" value={record.heavyMetalsSummary} />
            <Field label="Storage condition" value={record.storageCondition} />
            <Field label="Released on" value={record.releasedOn} />
            <Field label="Retest date" value={record.retestDate} />
          </dl>

          <div className="mt-10">
            <h3 className="utility-label text-primary">Documents for this lot</h3>
            {Object.values(record.documents).some(Boolean) ? (
              <ul className="mt-5 max-w-xl divide-y divide-border border border-border">
                {Object.entries(record.documents)
                  .filter(([, present]) => present)
                  .map(([type]) => (
                    <li key={type} className="flex items-center justify-between gap-4 p-4 text-sm">
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
                Files for this lot are available on request at research@nexphaselabs.net, quoting the lot number.
              </p>
            )}
            <p className="mt-4 text-sm text-muted-foreground">
              Permanent record:{' '}
              <a href={`/lots/${encodeURIComponent(record.lotNumber)}`} className="font-semibold text-primary">
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
                        <td className="p-4">{TEST_LABEL[test.testType] ?? test.testType}</td>
                        <td className="p-4 text-muted-foreground">{test.analyte ?? '—'}</td>
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
