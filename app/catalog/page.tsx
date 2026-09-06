import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Search } from 'lucide-react';
import { openCheckoutEnabled } from '@/lib/site-config';
import { CatalogUnavailable } from '@/components/site/catalog-unavailable';
import { ProductImage } from '@/components/site/product-image';
import { ResearchNoticeBlock } from '@/components/site/research-notice';
import { REGULATORY_STATEMENT, STATUS_LABEL } from '@/lib/catalog';
import { listPublishedProducts, loadCatalog } from '@/lib/catalog-data';
import { searchMaterials, searchQuery } from '@/lib/workflow-display';
import { listActiveClasses } from '@/lib/classes';
import { currentViewer } from '@/lib/visibility';
import { formatCents, priceFor } from '@/lib/visibility-rules';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Catalog',
  description:
    'The full NexPhase Labs catalog, indexed by chemical class. Supplied for laboratory research use only.',
};

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; class?: string; sort?: string }>;
}) {
  const open = openCheckoutEnabled();
  const rawParams = await searchParams;
  const query = searchQuery(rawParams.q);
  const selectedClass = (rawParams.class ?? '').slice(0, 120);
  const sort = rawParams.sort === 'za' ? 'za' : 'az';
  const catalog = await loadCatalog(async () => ({
    products: await listPublishedProducts(),
    classes: await listActiveClasses(),
  }));
  const all = catalog.data?.products ?? [];
  const classes = catalog.data?.classes ?? [];
  const results = searchMaterials(all, query)
    .filter((product) => !selectedClass || product.chemicalClass === selectedClass)
    .sort((a, b) =>
      sort === 'za'
        ? b.name.localeCompare(a.name)
        : a.name.localeCompare(b.name),
    );
  const { visibility } = await currentViewer();

  return (
    <main className="text-foreground">
      <section className="mx-auto max-w-[1280px] px-4 pb-6 pt-3 sm:px-6">
        <div className="ion-panel bg-gradient-to-br from-white via-white to-blue-50 p-7 sm:p-10 lg:p-12">
          <div className="grid gap-8 lg:grid-cols-[1fr_0.85fr] lg:items-end">
            <div>
              <span className="ion-kicker">
                Shop products · {all.length} materials
              </span>
              <h1 className="ion-heading mt-6 max-w-3xl text-[clamp(3rem,6vw,5.5rem)]">
                Research products ready to explore.
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
                Search by product name, catalog number, or CAS. Compare available
                pack sizes and review the lot documentation before ordering.
              </p>
            </div>
            <div className="rounded-[1.4rem] border border-blue-100 bg-white/80 p-5 shadow-sm">
              <p className="text-sm font-extrabold text-[var(--ion-navy)]">
                Conditions of supply
              </p>
              <p className="mt-2 text-sm font-semibold leading-6 text-muted-foreground">
                {REGULATORY_STATEMENT}
              </p>
            </div>
          </div>
        </div>
      </section>

      {catalog.unavailable ? (
        <section className="mx-auto max-w-[1280px] px-4 py-10 sm:px-6">
          <CatalogUnavailable />
        </section>
      ) : (
        <section className="mx-auto grid max-w-[1280px] gap-7 px-4 py-10 sm:px-6 lg:grid-cols-[17rem_1fr]">
          <aside className="hidden lg:block">
            <div className="ion-panel sticky top-28 p-5">
              <p className="font-display text-lg font-extrabold text-[var(--ion-navy)]">
                Shop products
              </p>
              <nav className="mt-5" aria-label="Products">
                <ul className="max-h-[62vh] space-y-1 overflow-y-auto pr-2">
                  {all.map((product) => (
                    <li key={product.code}>
                      <Link
                        href={`/catalog/${product.slug}`}
                        className="block rounded-xl px-3 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-primary"
                      >
                        {product.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
              <div className="mt-5 border-t border-border pt-5">
                <p className="text-xs font-bold text-muted-foreground">
                  Browse by chemical class
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {classes.map((area) => (
                    <Link
                      key={area.id}
                      href={`/catalog?class=${encodeURIComponent(area.name)}#catalog-search`}
                      className={`rounded-full px-3 py-2 text-xs font-bold ${selectedClass === area.name ? 'bg-primary text-white' : 'bg-secondary text-[var(--ion-navy)] hover:text-primary'}`}
                    >
                      {area.name}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </aside>

          <div>
            <form
              id="catalog-search"
              role="search"
              action="/catalog"
              method="get"
              className="ion-panel p-4 sm:p-5"
            >
              <label htmlFor="material-query" className="sr-only">
                Search by name, catalog number, or CAS
              </label>
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_12rem_10rem_auto]">
                <div className="relative min-w-0 flex-1">
                  <Search className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    id="material-query"
                    name="q"
                    type="search"
                    defaultValue={query}
                    maxLength={120}
                    placeholder="Search by product, catalog number, or CAS"
                    className="min-h-13 w-full rounded-full border border-input bg-secondary py-3 pl-12 pr-4 text-sm outline-none focus:border-primary"
                  />
                </div>
                <label className="sr-only" htmlFor="catalog-class">Chemical class</label>
                <select id="catalog-class" name="class" defaultValue={selectedClass} className="min-h-13 rounded-full border border-input bg-secondary px-4 text-sm font-bold text-[var(--ion-navy)] outline-none focus:border-primary">
                  <option value="">All classes</option>
                  {classes.map((area) => <option key={area.id} value={area.name}>{area.name}</option>)}
                </select>
                <label className="sr-only" htmlFor="catalog-sort">Sort products</label>
                <select id="catalog-sort" name="sort" defaultValue={sort} className="min-h-13 rounded-full border border-input bg-secondary px-4 text-sm font-bold text-[var(--ion-navy)] outline-none focus:border-primary">
                  <option value="az">Name A–Z</option>
                  <option value="za">Name Z–A</option>
                </select>
                <button type="submit" className="action-primary gap-2">
                  Apply <ArrowRight className="size-4" />
                </button>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 px-2">
                <p role="status" className="text-sm font-semibold text-muted-foreground">
                {results.length} {results.length === 1 ? 'material' : 'materials'}
                {query ? <> matching “{query}”</> : ' found'}
                {selectedClass ? <> in {selectedClass}</> : ''}.
                </p>
                {(query || selectedClass || sort !== 'az') && <Link href="/catalog#catalog-search" className="text-sm font-extrabold text-primary">Clear filters</Link>}
              </div>
            </form>

            {results.length === 0 && (
              <div className="ion-panel mt-6 p-7 text-sm">
                No matching materials. Try a shorter name or catalog number.{' '}
                <a
                  className="font-bold text-primary"
                  href="mailto:research@nexphaselabs.net"
                >
                  Ask us for help
                </a>
                .
              </div>
            )}

            <section className="mt-10" aria-label="Product results">
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                      {results.map((product) => (
                        <Link
                          key={product.code}
                          href={`/catalog/${product.slug}`}
                          className="ion-panel group flex flex-col p-3"
                        >
                          <div className="relative aspect-[1.08] overflow-hidden rounded-[1.25rem] bg-secondary">
                            <ProductImage
                              code={product.code}
                              name={product.name}
                              image={product.image}
                              imageClassName="transition-transform duration-500 group-hover:scale-[1.025]"
                              sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 28vw"
                            />
                            <span className="absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1.5 text-[10px] font-extrabold text-[var(--ion-navy)] shadow-sm backdrop-blur">
                              {product.chemicalClass}
                            </span>
                            <span className="absolute right-3 top-3 rounded-full bg-[var(--ion-navy)] px-3 py-1.5 text-[10px] font-extrabold text-white shadow-sm">{STATUS_LABEL[product.status]}</span>
                          </div>
                          <div className="flex flex-1 flex-col justify-between gap-6 px-3 pb-3 pt-5">
                            <div>
                              <p className="text-xs font-bold text-primary">
                                {product.code}
                              </p>
                              <h3 className="mt-2 font-display text-xl font-extrabold tracking-tight text-[var(--ion-navy)]">
                                {product.name}
                              </h3>
                              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                                CAS {product.casNumber} · {product.form}
                              </p>
                              <p className="mt-3 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Research use only</p>
                              {visibility.pricing !== 'none' && (() => {
                                const prices = product.variants
                                  .filter((variant) => variant.active)
                                  .map((variant) => priceFor(variant, visibility.pricing))
                                  .filter((price): price is number => price !== null);
                                if (prices.length === 0) return null;
                                const minimum = Math.min(...prices);
                                const maximum = Math.max(...prices);
                                return (
                                  <p className="mt-4 font-display text-lg font-extrabold text-[var(--ion-navy)]">
                                    {minimum === maximum
                                      ? formatCents(minimum)
                                      : `${formatCents(minimum)} – ${formatCents(maximum)}`}
                                  </p>
                                );
                              })()}
                            </div>
                            <span className="flex items-center justify-between text-sm font-extrabold text-primary">
                              {open ? 'Select options' : 'View specifications'}
                              <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                            </span>
                          </div>
                        </Link>
                      ))}
              </div>
            </section>
          </div>
        </section>
      )}

      <ResearchNoticeBlock />
    </main>
  );
}
