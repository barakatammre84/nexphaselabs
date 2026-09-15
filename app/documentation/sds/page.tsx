import type { Metadata } from 'next';
import Link from 'next/link';
import { FileText } from 'lucide-react';
import { CatalogUnavailable } from '@/components/site/catalog-unavailable';
import { ResearchNoticeBlock } from '@/components/site/research-notice';
import { REGULATORY_STATEMENT } from '@/lib/catalog';
import { listPublishedProducts, loadCatalog } from '@/lib/catalog-data';
import { currentSdsByProduct } from '@/lib/product-documents';
import { listStorefrontProductLinks } from '@/lib/storefront';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Safety data sheets',
  description: 'Safety data sheets for every material in the NexPhase Labs catalog, by catalog code and CAS number.',
};

export default async function SdsLibraryPage() {
  const loaded = await loadCatalog(async () => {
    const [list, listed] = await Promise.all([listPublishedProducts(), listStorefrontProductLinks()]);
    const sheets = await currentSdsByProduct(list.map((p) => p.id));
    // Every published material keeps its sheet, but only a listed product has a
    // catalog page to link to; the rest would answer 404.
    const pages = new Set(listed.map((p) => p.slug));
    return list.map((p) => ({ product: p, sds: sheets.get(p.id) ?? null, hasPage: pages.has(p.slug) }));
  });
  const rows = loaded.data ?? [];

  return (
    <main className="bg-background text-foreground">
      <section className="mx-auto max-w-[1500px] border-b border-border px-5 py-14 sm:px-8 lg:px-12 lg:py-20">
        <p className="utility-label flex items-center gap-3 text-primary">
          <span className="h-px w-8 bg-primary" />
          Documentation
        </p>
        <h1 className="mt-7 max-w-3xl font-display text-[clamp(2.4rem,5vw,4.2rem)] font-extrabold leading-[0.94] tracking-[-0.055em]">
          Safety data sheets
        </h1>
        <p className="mt-7 max-w-2xl text-lg leading-8 text-muted-foreground">
          The hazard-communication sheet for each material in the catalog, in GHS format. Read it before handling.
          Where suppliers classify a compound differently, the sheet issued with your lot governs.
        </p>
        <div className="mt-9 max-w-2xl border-l-2 border-primary bg-secondary px-6 py-5">
          <p className="utility-label text-primary">Conditions of supply</p>
          <p className="mt-3 text-sm font-semibold leading-6">{REGULATORY_STATEMENT}</p>
        </div>
      </section>

      <section className="mx-auto max-w-[1500px] border-b border-border px-5 py-14 sm:px-8 lg:px-12">
        {loaded.unavailable ? (
          <CatalogUnavailable />
        ) : (
          <div className="overflow-x-auto border border-border">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary">
                  {['Code', 'Material', 'CAS', 'Safety data sheet'].map((h) => (
                    <th key={h} className="p-4 font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ product, sds, hasPage }) => (
                  <tr key={product.code} className="border-b border-border last:border-b-0">
                    <td className="p-4 font-mono text-xs">{product.code}</td>
                    <td className="p-4">
                      {hasPage ? (
                        <Link href={`/catalog/${product.slug}`} className="font-semibold hover:text-primary">
                          {product.name}
                        </Link>
                      ) : (
                        <span className="font-semibold">{product.name}</span>
                      )}
                    </td>
                    <td className="p-4 font-mono text-xs">{product.casNumber}</td>
                    <td className="p-4">
                      {sds ? (
                        <a href={`/api/products/${product.code}/sds`} className="inline-flex items-center gap-1.5 font-semibold text-primary">
                          <FileText className="size-3.5" /> PDF{sds.revision ? ` · ${sds.revision}` : ''}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">Issued with shipment; on request</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <ResearchNoticeBlock />
    </main>
  );
}
