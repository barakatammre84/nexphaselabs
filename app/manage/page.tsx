import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, CircleCheck, Lock, Plus } from 'lucide-react';
import { CatalogUnavailable } from '@/components/site/catalog-unavailable';
import { STATUS_LABEL } from '@/lib/catalog';
import { listAllProducts, loadCatalog } from '@/lib/catalog-data';
import { canEditCatalog, requireStaff } from '@/lib/staff-auth';

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

export default async function ManagePage({ searchParams }: Props) {
  // The layout gates too; every /manage page checks for itself.
  const staff = await requireStaff('/manage');
  const { saved, denied } = await searchParams;
  const loaded = await loadCatalog(listAllProducts);
  const items = loaded.data ?? [];
  const canEdit = canEditCatalog(staff);

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
          Every save is checked against the catalog rules and recorded as a revision with your name. Only published
          products appear on the site.
        </p>

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
                {items.map((product) => (
                  <tr key={product.code} className="border-b border-border last:border-b-0">
                    <td className="p-4 font-mono text-xs text-muted-foreground">{product.code}</td>
                    <td className="p-4 font-semibold">{product.name}</td>
                    <td className="p-4 text-muted-foreground">{product.casNumber}</td>
                    <td className="p-4 text-muted-foreground">{product.chemicalClass}</td>
                    <td className="p-4 font-mono text-xs text-muted-foreground">
                      {product.variants
                        .filter((v) => v.active)
                        .map((v) => `${v.quantity}${v.institutionalPriceCents !== null ? ` ($${(v.institutionalPriceCents / 100).toFixed(2)})` : ''}`)
                        .join(', ')}
                    </td>
                    <td className="p-4">
                      <span className="spec-pill">{STATUS_LABEL[product.status]}</span>
                    </td>
                    <td className="p-4 text-muted-foreground">{VISIBILITY_LABEL[product.visibility]}</td>
                    <td className="p-4 text-muted-foreground">{product.featured ? 'Yes' : '—'}</td>
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
                        {product.visibility === 'published' && (
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
