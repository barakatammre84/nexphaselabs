import Link from 'next/link';
import { FileCheck2 } from 'lucide-react';
import {
  LOT_LIBRARY_PER_PRODUCT,
  publicDocumentPath,
  type LotCatalogueEntry,
} from '@/lib/lots-public';

/**
 * The certificate library, browsable by product.
 *
 * Searching by lot number assumes the reader already holds a vial. Someone
 * deciding whether to buy needs to see that the certificates exist at all, and
 * that they name a laboratory and carry that laboratory's own accession number
 * — which is the one thing in this category a customer can check without
 * trusting the seller.
 *
 * Every lot here has passed the same publication rule as the public lookup: a
 * quarantined, held, rejected, withdrawn or superseded lot cannot appear, and
 * neither can a released one missing its lab, accession number or testing
 * standard.
 */
export function LotLibrary({ products }: { products: LotCatalogueEntry[] }) {
  if (products.length === 0) {
    return (
      <p className="mt-6 rounded-[1.2rem] border border-border p-5 text-sm leading-6 text-muted-foreground">
        No released lot has been published yet. Certificates appear here as lots are released —
        each one tied to the lot number on the vial, never to the product line.
      </p>
    );
  }

  return (
    <div className="mt-6 grid gap-5">
      {products.map((product) => {
        const shown = product.lots.slice(0, LOT_LIBRARY_PER_PRODUCT);
        const more = product.lots.length - shown.length;
        return (
          <article key={product.productCode} className="rounded-[1.2rem] border border-border p-5 sm:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h3 className="font-display text-lg font-extrabold">{product.productName}</h3>
              <p className="font-mono text-xs text-muted-foreground">
                {product.productCode} · CAS {product.casNumber}
              </p>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                    <th scope="col" className="py-2 pr-4 font-semibold">Lot</th>
                    <th scope="col" className="py-2 pr-4 font-semibold">Released</th>
                    <th scope="col" className="py-2 pr-4 font-semibold">Purity</th>
                    <th scope="col" className="py-2 font-semibold">Laboratory · accession</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((lot) => (
                    <tr key={lot.lotNumber} className="border-b border-border/60">
                      <td className="py-2 pr-4">
                        <Link
                          href={`/lots/${encodeURIComponent(lot.lotNumber)}`}
                          className="inline-flex items-center gap-2 font-mono text-xs font-bold text-primary underline"
                        >
                          <FileCheck2 className="size-3.5" />
                          {lot.lotNumber}
                        </Link>
                        {lot.hasCoa && (
                          <a
                            href={publicDocumentPath(lot.lotNumber, 'coa')}
                            className="ml-3 text-xs font-semibold text-primary underline"
                          >
                            Certificate
                          </a>
                        )}
                      </td>
                      <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">
                        {lot.releasedOn ?? '—'}
                      </td>
                      <td className="py-2 pr-4 font-mono text-xs">{lot.purityResult ?? '—'}</td>
                      <td className="py-2 text-xs text-muted-foreground">
                        {lot.analyticalLab ?? '—'}
                        {lot.accessionNumber && (
                          <span className="block font-mono">{lot.accessionNumber}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {more > 0 && (
              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-semibold text-primary">
                  {more} earlier lot{more === 1 ? '' : 's'}
                </summary>
                <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                  {product.lots.slice(LOT_LIBRARY_PER_PRODUCT).map((lot) => (
                    <li key={lot.lotNumber} className="font-mono text-xs">
                      <Link href={`/lots/${encodeURIComponent(lot.lotNumber)}`} className="text-primary underline">
                        {lot.lotNumber}
                      </Link>
                      <span className="text-muted-foreground"> · released {lot.releasedOn ?? '—'}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </article>
        );
      })}
      <p className="text-xs leading-6 text-muted-foreground">
        The accession number is the testing laboratory&apos;s own reference for the sample. It is
        printed here so a certificate can be checked with the laboratory rather than with us.
      </p>
    </div>
  );
}
