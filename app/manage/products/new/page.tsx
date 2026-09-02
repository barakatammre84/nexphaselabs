import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { ProductForm } from '@/components/manage/product-form';
import { EMPTY_VALUES } from '@/lib/catalog-form';
import { canEditCatalog, requireStaff } from '@/lib/staff-auth';
import { saveProductAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'New product', robots: { index: false, follow: false } };

export default async function NewProductPage() {
  const staff = await requireStaff('/manage/products/new');
  if (!canEditCatalog(staff)) redirect('/manage?denied=1');
  const action = saveProductAction.bind(null, { kind: 'create' });

  return (
    <main className="bg-background text-foreground">
      <section className="mx-auto max-w-[1100px] px-5 py-12 sm:px-8 lg:px-12">
        <Link href="/manage" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-primary">
          <ArrowLeft className="size-4" /> Catalog manager
        </Link>
        <h1 className="mt-6 font-display text-4xl font-extrabold tracking-[-0.05em]">New product</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          A product is a chemical identity with sourced data. There is no field for dose, route or indication because
          the catalog does not carry that information.
        </p>
        <div className="mt-10">
          <ProductForm initial={{ ...EMPTY_VALUES, visibility: 'draft', status: 'enquire' }} mode="create" action={action} />
        </div>
      </section>
    </main>
  );
}
