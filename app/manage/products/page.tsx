import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, CircleAlert, CircleCheck, Lock, Plus } from 'lucide-react';
import { CatalogUnavailable } from '@/components/site/catalog-unavailable';
import { STATUS_LABEL } from '@/lib/catalog';
import { listAllProducts, loadCatalog } from '@/lib/catalog-data';
import { canEditCatalog, requireStaff } from '@/lib/staff-auth';
import { hiddenPublishedProducts } from '@/lib/storefront';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Catalog manager',
  description: 'Internal catalog manager for NexPhase Labs.',
  robots: { index: false, follow: false },
};

const VISIBILITY_LABEL: Record<string, string> = {
  draft: 'Draft',
  published: 'Published',
  withdrawn: 'Withdrawn',
};

type Props = { searchParams: Promise<{ saved?: string; denied?: string }> };

export default async function CatalogManagerPage({ searchParams }: Props) {
  const staff = await requireStaff('/manage/products');
  const { saved, denied } = await searchParams;
  const loaded = await loadCatalog(listAllProducts);
  const items = loaded.data ?? [];
  const canEdit = canEditCatalog(staff);
  const hidden = loaded.unavailable ? [] : await hiddenPublishedProducts();
  const hiddenByCode = new Map(hidden.map((product) => [product.code, product]));

  return (
    <main className="bg-background text-foreground">
      <section className="mx-auto max-w-[1500px] px-5 py-14 sm:px-8 lg:px-12">
        <p className="utility-label flex items-center gap-3 text-primary">
          <Lock className="size-4" />
          Internal &middot; catalog manager
        </p>
        <div className="mt-6 flex flex-wrap items-end justify-between gap-6">
          <h1 className="font-display text-[clamp(2.2rem,4.2vw,3.6rem)] font-extrabold leading-[0.95] tracking-[-0.05em]">
            Catalog manager
          </h1>
          {canEdit && (
            <Link
              href="/manage/products/new"
              className="inline-flex h-11 items-center gap-2 bg-primary px-5 text-sm font-bold text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="size-4" /> New product
            </Link>
          )}
        </div>

        {saved && /^NPL-\d{3,4}$/.test(saved) && (
          <p role="status" className="mt-6 flex items-center gap-2 border border-border bg-secondary p-4 text-sm">
            <CircleCheck className="size-4 text-primary" /> {saved} saved.
          </p>
        )}
        {denied && (
          <p role="status" className="mt-6 border border-border bg-secondary p-4 text-sm">
            Your role ({staff.role}) can view the catalog but not edit it.
          </p>
        )}

        <p className="mt-6 max-w-2xl text-sm leading-6 text-muted-foreground">
          Every save is checked against the catalog rules and recorded as a
          revision with your name. Published products appear only when their
          photograph, public price and released-lot requirements are also met.
        </p>

        {hidden.length > 0 && (
          <div
            role="alert"
            className="mt-6 border border-destructive bg-destructive/5 p-4 text-sm"
          >
            <p className="flex items-center gap-2 font-semibold text-destructive">
              <CircleAlert className="size-4" />
              {hidden.length} published{' '}
              {hidden.length === 1 ? 'material is' : 'materials are'} hidden
              from shoppers.
            </p>
            <p className="mt-2 text-muted-foreground">
              Review the warning in each row. A hidden material has no working
              public catalog page.
            </p>
          </div>
        )}

        {loaded.unavailable ? (
          <div className="mt-10">
            <CatalogUnavailable />
          </div>
        ) : (
          <div className="mt-10 overflow-x-auto border border-border">
            <table className="w-full min-w-[960px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary text-left">
                  <th className="p-4 font-semibold">Code</th>
                  <th className="p-4 font-semibold">Name</th>
                  <th className="p-4 font-semibold">CAS</th>
                  <th className="p-4 font-semibold">Chemical class</th>
                  <th className="p-4 font-semibold">Pack sizes</th>
                  <th className="p-4 font-semibold">Status</th>
                  <th className="p-4 font-semibold">Visibility</th>
                  <th className="p-4 font-semibold">Featured</th>
                  <th className="p-4 font-semibold"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((product) => {
                  const hiddenProduct = hiddenByCode.get(product.code);
                  return (
                    <tr
                      key={product.code}
                      className="border-b border-border last:border-b-0"
                    >
                      <td className="p-4 font-mono text-xs text-muted-foreground">
                        {product.code}
                      </td>
                      <td className="p-4 font-semibold">{product.name}</td>
                      <td className="p-4 text-muted-foreground">
                        {product.casNumber}
                      </td>
                      <td className="p-4 text-muted-foreground">
                        {product.chemicalClass}
                      </td>
                      <td className="p-4 font-mono text-xs text-muted-foreground">
                        {product.variants
                          .filter((v) => v.active)
                          .map(
                            (v) =>
                              `${v.quantity}${v.institutionalPriceCents !== null ? ` ($${(v.institutionalPriceCents / 100).toFixed(2)})` : ''}`,
                          )
                          .join(', ')}
                      </td>
                      <td className="p-4">
                        <span className="spec-pill">
                          {STATUS_LABEL[product.status]}
                        </span>
                      </td>
                      <td className="p-4 text-muted-foreground">
                        <span>{VISIBILITY_LABEL[product.visibility]}</span>
                        {hiddenProduct && (
                          <p className="mt-1 max-w-56 text-xs leading-5 text-destructive">
                            Hidden: {hiddenProduct.blockers.join('; ')}
                          </p>
                        )}
                      </td>
                      <td className="p-4 text-muted-foreground">
                        {product.featured ? 'Yes' : '—'}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-4">
                          {canEdit && (
                            <Link
                              href={`/manage/products/${product.code}`}
                              className="inline-flex items-center gap-1.5 font-semibold text-primary"
                            >
                              Edit
                            </Link>
                          )}
                          {product.visibility === 'published' &&
                            !hiddenProduct && (
                              <Link
                                href={`/catalog/${product.slug}`}
                                className="inline-flex items-center gap-1.5 font-semibold text-muted-foreground hover:text-primary"
                              >
                                View <ArrowRight className="size-3.5" />
                              </Link>
                            )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
