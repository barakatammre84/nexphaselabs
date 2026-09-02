import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { ProductForm } from '@/components/manage/product-form';
import { getProductByCode } from '@/lib/catalog-data';
import { productToValues } from '@/lib/catalog-form';
import { canEditCatalog, requireStaff } from '@/lib/staff-auth';
import { saveProductAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Edit product', robots: { index: false, follow: false } };

type Props = { params: Promise<{ code: string }> };

export default async function EditProductPage({ params }: Props) {
  const { code } = await params;
  const staff = await requireStaff(`/manage/products/${encodeURIComponent(code)}`);
  if (!canEditCatalog(staff)) redirect('/manage?denied=1');

  if (!/^NPL-\d{3,4}$/i.test(code)) notFound();
  const product = await getProductByCode(code);
  if (!product) notFound();

  const action = saveProductAction.bind(null, { kind: 'update', code: product.code });

  return (
    <main className="bg-background text-foreground">
      <section className="mx-auto max-w-[1100px] px-5 py-12 sm:px-8 lg:px-12">
        <Link href="/manage" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-primary">
          <ArrowLeft className="size-4" /> Catalog manager
        </Link>
        <p className="mt-6 font-mono text-xs text-muted-foreground">
          {product.code} &middot; {product.visibility} &middot; last changed{' '}
          {product.updatedAt.toISOString().slice(0, 10)}
        </p>
        <h1 className="mt-2 font-display text-4xl font-extrabold tracking-[-0.05em]">{product.name}</h1>
        <div className="mt-10">
          <ProductForm initial={productToValues(product)} mode="update" action={action} />
        </div>
      </section>
    </main>
  );
}
