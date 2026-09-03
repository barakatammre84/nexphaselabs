import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { ClassForm } from '@/components/manage/class-form';
import { getClass, listClassRevisions } from '@/lib/classes';
import { canEditCatalog, requireStaff } from '@/lib/staff-auth';
import { saveClassAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Edit class',
  robots: { index: false, follow: false },
};

type Props = { params: Promise<{ id: string }> };

export default async function EditClassPage({ params }: Props) {
  const { id } = await params;
  const staff = await requireStaff(`/manage/classes/${encodeURIComponent(id)}`);
  if (!canEditCatalog(staff)) redirect('/manage?denied=1');
  if (!/^[a-z0-9-]{2,40}$/.test(id)) notFound();
  const cls = await getClass(id);
  if (!cls) notFound();
  const revisions = await listClassRevisions(id);

  return (
    <main className="bg-background text-foreground">
      <section className="mx-auto max-w-[1100px] px-5 py-12 sm:px-8 lg:px-12">
        <Link
          href="/manage/classes"
          className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-primary"
        >
          <ArrowLeft className="size-4" /> Chemical classes
        </Link>
        <p className="mt-6 font-mono text-xs text-muted-foreground">
          {cls.id} &middot; {cls.active ? 'active' : 'inactive'} &middot; last
          changed {cls.updatedAt.toISOString().slice(0, 10)}
        </p>
        <h1 className="mt-2 font-display text-4xl font-extrabold tracking-[-0.05em]">
          {cls.name}
        </h1>
        <div className="mt-10">
          <ClassForm
            initial={{
              id: cls.id,
              name: cls.name,
              blurb: cls.blurb,
              sortOrder: String(cls.sortOrder),
              active: cls.active ? 'on' : '',
            }}
            mode="update"
            action={saveClassAction.bind(null, { kind: 'update', id: cls.id })}
          />
        </div>
        <h2 className="mt-14 utility-label text-primary">History</h2>
        <ul className="mt-4 divide-y divide-border border border-border text-sm">
          {revisions.length === 0 && (
            <li className="p-3 text-muted-foreground">
              Seeded; no changes recorded yet.
            </li>
          )}
          {revisions.map((r) => (
            <li key={r.id} className="p-3">
              <span className="font-mono text-xs">
                {r.createdAt.toISOString().slice(0, 10)}
              </span>{' '}
              &middot; <span className="font-semibold">{r.action}</span>{' '}
              &middot; {r.changedBy}
              {r.note && (
                <span className="block text-xs text-muted-foreground">
                  {r.note}
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
