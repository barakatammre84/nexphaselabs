import type { Metadata } from 'next';
import Link from 'next/link';
import { CircleCheck, Lock } from 'lucide-react';
import { CatalogUnavailable } from '@/components/site/catalog-unavailable';
import { ClassForm } from '@/components/manage/class-form';
import { loadCatalog } from '@/lib/catalog-data';
import { listAllClasses, listOrphanClassNames } from '@/lib/classes';
import { canEditCatalog, requireStaff } from '@/lib/staff-auth';
import { saveClassAction } from './actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Chemical classes',
  robots: { index: false, follow: false },
};

type Props = { searchParams: Promise<{ saved?: string }> };

export default async function ClassesPage({ searchParams }: Props) {
  const staff = await requireStaff('/manage/classes');
  const { saved } = await searchParams;
  const loaded = await loadCatalog(async () => ({
    classes: await listAllClasses(),
    orphans: await listOrphanClassNames(),
  }));
  const classes = loaded.data?.classes ?? [];
  const orphans = loaded.data?.orphans ?? [];
  const canEdit = canEditCatalog(staff);

  return (
    <main className="bg-background text-foreground">
      <section className="mx-auto max-w-[1300px] px-5 py-14 sm:px-8 lg:px-12">
        <p className="utility-label flex items-center gap-3 text-primary">
          <Lock className="size-4" /> Internal &middot; chemical classes
        </p>
        <h1 className="mt-6 font-display text-[clamp(2.2rem,4.2vw,3.6rem)] font-extrabold leading-[0.95] tracking-[-0.05em]">
          Chemical classes
        </h1>
        <p className="mt-6 max-w-2xl text-sm leading-6 text-muted-foreground">
          The catalog is organised by what a material is, never by what it is
          studied for. Classes here drive the catalog index, the home page, the
          footer and the product form.
        </p>
        {saved && /^[a-z0-9-]{2,40}$/.test(saved) && (
          <p
            role="status"
            className="mt-6 flex items-center gap-2 border border-border bg-secondary p-4 text-sm"
          >
            <CircleCheck className="size-4 text-primary" /> Class &ldquo;{saved}
            &rdquo; saved.
          </p>
        )}

        {orphans.length > 0 && (
          <div
            role="alert"
            className="mt-6 border border-destructive/40 bg-secondary p-4 text-sm"
          >
            <p className="font-semibold">
              Products carry a class name that matches no class. They are
              reachable by URL but missing from the catalog index.
            </p>
            <ul className="mt-2 list-disc pl-6">
              {orphans.map((o) => (
                <li key={o.name}>
                  &ldquo;{o.name}&rdquo; &middot; {o.productCount} product(s),{' '}
                  {o.publishedCount} published. Open each product and choose an
                  active class, or create a class with exactly this name.
                </li>
              ))}
            </ul>
          </div>
        )}

        {loaded.unavailable ? (
          <div className="mt-10">
            <CatalogUnavailable />
          </div>
        ) : (
          <div className="mt-10 overflow-x-auto border border-border">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary">
                  {[
                    'Order',
                    'Anchor',
                    'Name',
                    'Products',
                    'Published',
                    'Status',
                    '',
                  ].map((h) => (
                    <th
                      key={h}
                      className="p-4 font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {classes.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-border last:border-b-0"
                  >
                    <td className="p-4 font-mono text-xs">{c.sortOrder}</td>
                    <td className="p-4 font-mono text-xs">{c.id}</td>
                    <td className="p-4 font-semibold">{c.name}</td>
                    <td className="p-4 font-mono text-xs">{c.productCount}</td>
                    <td className="p-4 font-mono text-xs">
                      {c.publishedCount}
                    </td>
                    <td className="p-4">{c.active ? 'Active' : 'Inactive'}</td>
                    <td className="p-4">
                      {canEdit && (
                        <Link
                          href={`/manage/classes/${c.id}`}
                          className="font-semibold text-primary hover:underline"
                        >
                          Edit
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {canEdit && (
          <section className="mt-14 border-t border-border pt-10">
            <h2 className="utility-label text-primary">Add a class</h2>
            <div className="mt-6 max-w-3xl">
              <ClassForm
                initial={{
                  sortOrder: String((classes.at(-1)?.sortOrder ?? 0) + 10),
                  active: 'on',
                }}
                mode="create"
                action={saveClassAction.bind(null, { kind: 'create' })}
              />
            </div>
          </section>
        )}
      </section>
    </main>
  );
}
