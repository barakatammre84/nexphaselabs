import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Lock } from 'lucide-react';
import { CatalogUnavailable } from '@/components/site/catalog-unavailable';
import { STATUS_LABEL } from '@/lib/catalog';
import { listAllProducts, loadCatalog } from '@/lib/catalog-data';
import { requireStaff } from '@/lib/staff-auth';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Catalog manager',
  description: 'Internal catalog manager for NexPhase Labs.',
  robots: { index: false, follow: false },
};

/**
 * Catalog manager. Reads every product from D1 regardless of visibility.
 *
 * Read-only until step 2.3 puts staff sign-in in front of this route; the
 * create/edit form (step 2.4) must not exist before that.
 */

const VISIBILITY_LABEL: Record<string, string> = {
  draft: 'Draft',
  published: 'Published',
  withdrawn: 'Withdrawn',
};

export default async function ManagePage() {
  // The layout gates too; every /manage page checks for itself.
  await requireStaff('/manage');
  const loaded = await loadCatalog(listAllProducts);
  const items = loaded.data ?? [];

  return (
    <main className="bg-background text-foreground">
      <section className="mx-auto max-w-[1500px] px-5 py-14 sm:px-8 lg:px-12">
        <p className="utility-label flex items-center gap-3 text-primary">
          <Lock className="size-4" />
          Internal &middot; catalog manager
        </p>
        <h1 className="mt-6 font-display text-[clamp(2.2rem,4.2vw,3.6rem)] font-extrabold leading-[0.95] tracking-[-0.05em]">
          Catalog manager
        </h1>

        <p className="mt-6 max-w-2xl border border-border bg-secondary p-5 leading-7">
          <strong className="font-semibold">Read-only for now.</strong> The catalog below is served from the
          database. Editing arrives with staff sign-in in the next stage of the build.
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
                  <th className="p-4 font-semibold">Page</th>
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
                      {product.variants.map((v) => v.quantity).join(', ')}
                    </td>
                    <td className="p-4">
                      <span className="spec-pill">{STATUS_LABEL[product.status]}</span>
                    </td>
                    <td className="p-4 text-muted-foreground">{VISIBILITY_LABEL[product.visibility]}</td>
                    <td className="p-4 text-muted-foreground">{product.featured ? 'Yes' : '—'}</td>
                    <td className="p-4">
                      {product.visibility === 'published' ? (
                        <Link
                          href={`/catalog/${product.slug}`}
                          className="inline-flex items-center gap-1.5 font-semibold text-primary"
                        >
                          View <ArrowRight className="size-3.5" />
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
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
