import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { ProductForm } from '@/components/manage/product-form';
import { getProductByCode } from '@/lib/catalog-data';
import { productToValues } from '@/lib/catalog-form';
import { sdsHistory } from '@/lib/product-documents';
import { canEditCatalog, requireStaff } from '@/lib/staff-auth';
import { saveProductAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Edit product', robots: { index: false, follow: false } };

type Props = { params: Promise<{ code: string }>; searchParams: Promise<{ sds?: string }> };

const SDS_MESSAGE: Record<string, string> = {
  ok: 'Safety data sheet uploaded. It is now the sheet served for this material.',
  nofile: 'Choose a PDF to upload.',
  size: 'The file is larger than 25 MB.',
  filetype: 'The safety data sheet must be a PDF.',
  badform: 'The upload could not be read.',
  store: 'The file could not be stored. Try again shortly.',
};

export default async function EditProductPage({ params, searchParams }: Props) {
  const { code } = await params;
  const { sds } = await searchParams;
  const staff = await requireStaff(`/manage/products/${encodeURIComponent(code)}`);
  if (!canEditCatalog(staff)) redirect('/manage?denied=1');

  if (!/^NPL-\d{3,4}$/i.test(code)) notFound();
  const product = await getProductByCode(code);
  if (!product) notFound();

  const action = saveProductAction.bind(null, { kind: 'update', code: product.code });
  const sheets = await sdsHistory(product.id);
  const sdsMessage = sds ? (SDS_MESSAGE[sds] ?? SDS_MESSAGE.store) : null;

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

        <section className="mt-14 border-t border-border pt-10">
          <h2 className="utility-label text-primary">Safety data sheet</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            The sheet uploaded here is served publicly from the product page and the SDS library. A new upload
            supersedes the previous one; earlier revisions stay on file.
          </p>
          {sdsMessage && (
            <p role={sds === 'ok' ? 'status' : 'alert'} className="mt-4 max-w-2xl border border-border bg-secondary p-3 text-sm">
              {sdsMessage}
            </p>
          )}
          {sheets.length > 0 && (
            <ul className="mt-4 max-w-2xl divide-y divide-border border border-border text-sm">
              {sheets.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                  <span>
                    {d.revision ?? 'Unlabelled revision'}
                    {d.supersededAt ? <span className="ml-2 text-xs text-muted-foreground">superseded {d.supersededAt.toISOString().slice(0, 10)}</span> : <span className="ml-2 text-xs font-semibold text-primary">current</span>}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {d.originalName ?? d.objectKey.split('/').pop()} &middot; {d.uploadedAt.toISOString().slice(0, 10)} &middot; {d.uploadedBy}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <form method="post" action={`/api/manage/products/${product.code}/sds`} encType="multipart/form-data" className="mt-4 flex max-w-2xl flex-col gap-4 border border-border bg-secondary p-5">
            <label className="flex flex-col gap-1.5 text-sm">
              Revision label
              <input name="revision" maxLength={80} placeholder='e.g. "Rev 2, 2026-08-14"' className="h-11 border border-foreground/20 bg-background px-3 text-sm" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              PDF (up to 25 MB)
              <input name="file" type="file" required accept="application/pdf" className="text-sm" />
            </label>
            <button type="submit" className="inline-flex h-11 w-fit items-center bg-primary px-5 text-sm font-bold text-primary-foreground hover:bg-primary/90">
              Upload safety data sheet
            </button>
          </form>
        </section>
      </section>
    </main>
  );
}
