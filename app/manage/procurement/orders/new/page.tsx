import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { PurchaseOrderForm } from '@/components/manage/procurement-forms';
import { listAllProducts } from '@/lib/catalog-data';
import { listSuppliers } from '@/lib/procurement';
import { canFulfil, requireStaff } from '@/lib/staff-auth';
import { createPurchaseOrderAction } from '../../actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'New purchase order', robots: { index: false, follow: false } };

export default async function NewPurchaseOrderPage() {
  const staff = await requireStaff('/manage/procurement/orders/new');
  if (!canFulfil(staff)) redirect('/manage?denied=1');
  const [suppliers, products] = await Promise.all([listSuppliers(), listAllProducts()]);
  const qualified = suppliers.filter((s) => s.active && s.qualificationStatus === 'qualified').map((s) => ({ id: s.id, name: s.name }));
  return (
    <main className="bg-background text-foreground">
      <section className="mx-auto max-w-[1100px] px-5 py-12 sm:px-8 lg:px-12">
        <Link href="/manage/procurement" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-primary">
          <ArrowLeft className="size-4" /> Procurement
        </Link>
        <h1 className="mt-6 font-display text-4xl font-extrabold tracking-[-0.05em]">New purchase order</h1>
        {qualified.length === 0 && <p className="mt-4 border border-border bg-secondary p-4 text-sm">No qualified supplier yet. Qualify one first.</p>}
        <div className="mt-10">
          <PurchaseOrderForm
            suppliers={qualified}
            products={products.filter((p) => p.visibility !== 'withdrawn').map((p) => ({ code: p.code, name: p.name }))}
            today={new Date().toISOString().slice(0, 10)}
            action={createPurchaseOrderAction}
          />
        </div>
      </section>
    </main>
  );
}
