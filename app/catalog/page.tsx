import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { CatalogUnavailable } from '@/components/site/catalog-unavailable';
import { ProductImage } from '@/components/site/product-image';
import { ResearchNoticeBlock } from '@/components/site/research-notice';
import {
  CHEMICAL_CLASSES,
  CLASS_ANCHORS,
  CLASS_BLURBS,
  REGULATORY_STATEMENT,
  STATUS_LABEL,
} from '@/lib/catalog';
import { groupByClass, listPublishedProducts, loadCatalog } from '@/lib/catalog-data';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Catalog',
  description:
    'The full NexPhase Labs catalog, indexed by chemical class. Supplied to qualified organizations for laboratory research use only.',
};

export default async function CatalogPage() {
  const catalog = await loadCatalog(listPublishedProducts);
  const all = catalog.data ?? [];
  const byClass = groupByClass(all);

  return (
    <main className="bg-background text-foreground">
      <section className="mx-auto max-w-[1500px] border-b border-border px-5 py-14 sm:px-8 lg:px-12 lg:py-20">
        <p className="utility-label flex items-center gap-3 text-primary">
          <span className="h-px w-8 bg-primary" />
          Catalog {!catalog.unavailable && <>&middot; {all.length} materials</>}
        </p>
        <h1 className="mt-7 max-w-3xl font-display text-[clamp(2.6rem,5vw,4.6rem)] font-extrabold leading-[0.92] tracking-[-0.06em]">
          Every material, with its paperwork.
        </h1>
        <p className="mt-7 max-w-2xl text-lg leading-8 text-muted-foreground">
          Pricing and availability are shown to verified research accounts. Specifications below describe the
          material; purity and lot data come from the certificate of analysis issued for the lot you receive.
        </p>
        <nav className="mt-9 flex flex-wrap gap-3" aria-label="Chemical classes">
          {CHEMICAL_CLASSES.map((area) => (
            <a
              key={area}
              href={`#${CLASS_ANCHORS[area]}`}
              className="inline-flex h-10 items-center border border-foreground/20 px-4 text-sm font-semibold transition-colors hover:border-primary hover:text-primary"
            >
              {area}
            </a>
          ))}
        </nav>
        {/* Rule 1 — conditions of supply in the body, above the fold. */}
        <div className="mt-9 max-w-2xl border-l-2 border-primary bg-secondary px-6 py-5">
          <p className="utility-label text-primary">Conditions of supply</p>
          <p className="mt-3 text-sm font-semibold leading-6">{REGULATORY_STATEMENT}</p>
        </div>
      </section>

      {catalog.unavailable && (
        <section className="mx-auto max-w-[1500px] border-b border-border px-5 py-14 sm:px-8 lg:px-12">
          <CatalogUnavailable />
        </section>
      )}

      {CHEMICAL_CLASSES.map((area) => {
        const items = byClass.get(area) ?? [];
        if (items.length === 0) return null;

        return (
          <section
            key={area}
            id={CLASS_ANCHORS[area]}
            className="mx-auto max-w-[1500px] scroll-mt-32 border-b border-border px-5 py-14 sm:px-8 lg:px-12"
          >
            <div className="mb-9 max-w-2xl">
              <h2 className="font-display text-3xl font-extrabold tracking-[-0.04em] sm:text-4xl">{area}</h2>
              <p className="mt-3 leading-7 text-muted-foreground">{CLASS_BLURBS[area]}</p>
            </div>

            <div className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-3">
              {items.map((product) => (
                <Link key={product.code} href={`/catalog/${product.slug}`} className="group flex flex-col bg-background">
                  <div className="relative aspect-[1.18] overflow-hidden bg-secondary">
                    <ProductImage
                      code={product.code}
                      name={product.name}
                      image={product.image}
                      imageClassName="transition-transform duration-500 group-hover:scale-[1.025]"
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    />
                    <span className="absolute right-4 top-4 bg-background px-2 py-1 font-mono text-[10px] text-muted-foreground">
                      {product.code}
                    </span>
                    <span className="absolute left-4 top-4 spec-pill">{STATUS_LABEL[product.status]}</span>
                  </div>
                  <div className="flex flex-1 flex-col justify-between gap-5 border-t border-border p-5 lg:p-7">
                    <div>
                      <h3 className="font-display text-2xl font-bold tracking-tight">{product.name}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        CAS {product.casNumber} &middot; {product.form}
                      </p>
                      <p className="mt-4 font-mono text-xs leading-6 text-muted-foreground">{product.purity}</p>
                    </div>
                    <span className="flex items-center gap-2 text-sm font-bold text-primary">
                      Specifications
                      <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        );
      })}

      <ResearchNoticeBlock />
    </main>
  );
}
