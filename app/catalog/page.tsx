import type { Metadata } from 'next';
import Link from 'next/link';
import { openCheckoutEnabled } from '@/lib/site-config';
import { ArrowRight } from 'lucide-react';
import { CatalogUnavailable } from '@/components/site/catalog-unavailable';
import { ProductImage } from '@/components/site/product-image';
import { ResearchNoticeBlock } from '@/components/site/research-notice';
import { REGULATORY_STATEMENT, STATUS_LABEL } from '@/lib/catalog';
import {
  groupByClass,
  listPublishedProducts,
  loadCatalog,
} from '@/lib/catalog-data';
import { searchMaterials, searchQuery } from '@/lib/workflow-display';
import { listActiveClasses } from '@/lib/classes';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Catalog',
  description:
    'The full NexPhase Labs catalog, indexed by chemical class. Supplied to qualified organizations for laboratory research use only.',
};

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const open = openCheckoutEnabled();
  const query = searchQuery((await searchParams).q);
  const catalog = await loadCatalog(async () => ({
    products: await listPublishedProducts(),
    classes: await listActiveClasses(),
  }));
  const all = catalog.data?.products ?? [];
  const classes = catalog.data?.classes ?? [];
  const results = searchMaterials(all, query);
  const byClass = groupByClass(results);

  return (
    <main className="bg-background text-foreground">
      <section className="mx-auto max-w-[1500px] border-b border-border px-5 py-8 sm:px-8 lg:px-12 lg:py-12">
        <p className="utility-label flex items-center gap-3 text-primary">
          <span className="h-px w-8 bg-primary" />
          Catalog {!catalog.unavailable && <>&middot; {all.length} materials</>}
        </p>
        <h1 className="page-title mt-4 max-w-3xl">
          Find your research material.
        </h1>
        {/* Rule 1 — conditions of supply in the body, above the fold. */}
        <div className="mt-5 max-w-2xl border-l-2 border-primary bg-secondary px-4 py-3">
          <p className="utility-label text-primary">Conditions of supply</p>
          <p className="mt-2 text-sm font-semibold leading-6">
            {REGULATORY_STATEMENT}
          </p>
        </div>
        <p className="mt-4 max-w-2xl leading-7 text-muted-foreground">
          {open
            ? 'Browse materials, choose a pack size, and check out as a guest. No account, email verification, or organization approval required.'
            : 'Browse chemical specifications below. Pricing and ordering require an approved research account.'}
        </p>
        <nav
          className="mt-9 flex flex-wrap gap-3"
          aria-label="Chemical classes"
        >
          {classes
            .filter((area) => (byClass.get(area.name)?.length ?? 0) > 0)
            .map((area) => (
              <a
                key={area.id}
                href={`#${area.id}`}
                className="inline-flex h-10 items-center border border-foreground/20 px-4 text-sm font-semibold transition-colors hover:border-primary hover:text-primary"
              >
                {area.name}
              </a>
            ))}
        </nav>
      </section>

      {!catalog.unavailable && (
        <section className="mx-auto max-w-[1500px] px-5 pt-10 sm:px-8 lg:px-12">
          <form
            id="catalog-search"
            role="search"
            action="/catalog"
            method="get"
          >
            <label
              htmlFor="material-query"
              className="block text-sm font-semibold"
            >
              Search by name, catalog number, or CAS
            </label>
            <div className="mt-3 flex flex-wrap gap-3">
              <input
                id="material-query"
                name="q"
                type="search"
                defaultValue={query}
                maxLength={120}
                placeholder="For example, BPC-157 or NPL-001"
                className="min-h-12 min-w-0 flex-1 basis-64 rounded-md border border-input px-4"
              />
              <button type="submit" className="action-primary">
                Search materials
              </button>
              {query && (
                <Link
                  href="/catalog#catalog-search"
                  className="action-secondary"
                >
                  Clear search
                </Link>
              )}
            </div>
          </form>
          <p role="status" className="mt-4 text-sm text-muted-foreground">
            {results.length} {results.length === 1 ? 'material' : 'materials'}
            {query ? <> matching &ldquo;{query}&rdquo;</> : ' in the catalog'}.
          </p>
          {results.length === 0 && (
            <p className="mt-4 rounded-md bg-secondary p-5">
              No matching materials. Try a shorter name or check the catalog
              number.{' '}
              <a
                className="font-semibold text-primary"
                href="mailto:research@nexphaselabs.net"
              >
                Ask us for help
              </a>
              .
            </p>
          )}
        </section>
      )}

      {catalog.unavailable && (
        <section className="mx-auto max-w-[1500px] border-b border-border px-5 py-14 sm:px-8 lg:px-12">
          <CatalogUnavailable />
        </section>
      )}

      {classes.map((area) => {
        const items = byClass.get(area.name) ?? [];
        if (items.length === 0) return null;

        return (
          <section
            key={area.id}
            id={area.id}
            className="mx-auto max-w-[1500px] scroll-mt-32 border-b border-border px-5 py-14 sm:px-8 lg:px-12"
          >
            <div className="mb-9 max-w-2xl">
              <h2 className="font-display text-3xl font-extrabold tracking-[-0.04em] sm:text-4xl">
                {area.name}
              </h2>
              {area.blurb && (
                <p className="mt-3 leading-7 text-muted-foreground">
                  {area.blurb}
                </p>
              )}
            </div>

            <div className="grid gap-7 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((product) => (
                <Link
                  key={product.code}
                  href={`/catalog/${product.slug}`}
                  className="group flex flex-col overflow-hidden rounded-lg bg-background"
                >
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
                    <span className="absolute left-4 top-4 spec-pill">
                      {STATUS_LABEL[product.status]}
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col justify-between gap-5 py-5">
                    <div>
                      <h3 className="font-display text-2xl font-bold tracking-tight">
                        {product.name}
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        CAS {product.casNumber} &middot; {product.form}
                      </p>
                      <p className="mt-4 font-mono text-xs leading-6 text-muted-foreground">
                        {product.purity}
                      </p>
                    </div>
                    <span className="flex items-center gap-2 text-sm font-bold text-primary">
                      {open ? 'View prices & order' : 'Specifications'}
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
