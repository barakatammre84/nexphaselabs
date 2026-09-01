import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { ResearchNoticeBlock } from '@/components/site/research-notice';
import { RESEARCH_AREAS, STATUS_LABEL, productsByArea, products } from '@/lib/catalog';

export const metadata: Metadata = {
  title: 'Catalog',
  description:
    'The full NexPhase Labs catalog of research materials, indexed by research area. Supplied to qualified organizations for laboratory research use only.',
};

const areaAnchors: Record<string, string> = {
  'Tissue & repair models': 'tissue',
  'Metabolic & endocrine models': 'metabolic',
  'Neurological models': 'neuro',
  'Cellular energy models': 'cellular',
};

const areaBlurbs: Record<string, string> = {
  'Tissue & repair models': 'Materials studied in wound, matrix, and tissue-repair research models.',
  'Metabolic & endocrine models': 'Materials studied in preclinical metabolic and endocrine research models.',
  'Neurological models': 'Materials studied in preclinical neurological and behavioral research models.',
  'Cellular energy models': 'Reagents and coenzymes used in cellular energy and enzymatic assay work.',
};

export default function CatalogPage() {
  return (
    <main className="bg-background text-foreground">
      <section className="mx-auto max-w-[1500px] border-b border-border px-5 py-14 sm:px-8 lg:px-12 lg:py-20">
        <p className="utility-label flex items-center gap-3 text-primary">
          <span className="h-px w-8 bg-primary" />
          Catalog &middot; {products.length} materials
        </p>
        <h1 className="mt-7 max-w-3xl font-display text-[clamp(2.6rem,5vw,4.6rem)] font-extrabold leading-[0.92] tracking-[-0.06em]">
          Every material, with its paperwork.
        </h1>
        <p className="mt-7 max-w-2xl text-lg leading-8 text-muted-foreground">
          Pricing and availability are shown to verified research accounts. Specifications below describe the
          material; purity and lot data come from the certificate of analysis issued for the lot you receive.
        </p>
        <nav className="mt-9 flex flex-wrap gap-3" aria-label="Research areas">
          {RESEARCH_AREAS.map((area) => (
            <a
              key={area}
              href={`#${areaAnchors[area]}`}
              className="inline-flex h-10 items-center border border-foreground/20 px-4 text-sm font-semibold transition-colors hover:border-primary hover:text-primary"
            >
              {area}
            </a>
          ))}
        </nav>
      </section>

      {RESEARCH_AREAS.map((area) => {
        const items = productsByArea(area);
        if (items.length === 0) return null;

        return (
          <section
            key={area}
            id={areaAnchors[area]}
            className="mx-auto max-w-[1500px] scroll-mt-32 border-b border-border px-5 py-14 sm:px-8 lg:px-12"
          >
            <div className="mb-9 max-w-2xl">
              <h2 className="font-display text-3xl font-extrabold tracking-[-0.04em] sm:text-4xl">{area}</h2>
              <p className="mt-3 leading-7 text-muted-foreground">{areaBlurbs[area]}</p>
            </div>

            <div className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-3">
              {items.map((product) => (
                <Link key={product.code} href={`/catalog/${product.slug}`} className="group flex flex-col bg-background">
                  <div className="relative aspect-[1.18] overflow-hidden bg-secondary">
                    <Image
                      src={product.image}
                      alt={`${product.name} research material vial`}
                      fill
                      className="object-cover mix-blend-multiply transition-transform duration-500 group-hover:scale-[1.025]"
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
                        {product.size} &middot; {product.form}
                      </p>
                      <p className="mt-4 text-sm leading-6 text-muted-foreground">{product.summary}</p>
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
