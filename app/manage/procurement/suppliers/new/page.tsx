import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { SupplierForm } from '@/components/manage/procurement-forms';
import { canFulfil, requireStaff } from '@/lib/staff-auth';
import { saveSupplierAction } from '../../actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'New supplier', robots: { index: false, follow: false } };

export default async function NewSupplierPage() {
  const staff = await requireStaff('/manage/procurement/suppliers/new');
  if (!canFulfil(staff)) redirect('/manage?denied=1');
  return (
    <main className="bg-background text-foreground">
      <section className="mx-auto max-w-[1000px] px-5 py-12 sm:px-8 lg:px-12">
        <Link href="/manage/procurement" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-primary">
          <ArrowLeft className="size-4" /> Procurement
        </Link>
        <h1 className="mt-6 font-display text-4xl font-extrabold tracking-[-0.05em]">New supplier</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">Created unqualified. An admin records the qualification decision before any order is raised.</p>
        <div className="mt-10">
          <SupplierForm initial={{}} mode="create" action={saveSupplierAction.bind(null, { kind: 'create' })} />
        </div>
      </section>
    </main>
  );
}
