import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { LotForm } from '@/components/manage/lot-form';
import { CatalogUnavailable } from '@/components/site/catalog-unavailable';
import { listAllProducts, loadCatalog } from '@/lib/catalog-data';
import { openExpectedReceipts } from '@/lib/procurement';
import { canFulfil, requireStaff } from '@/lib/staff-auth';
import { receiveLotAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Receive a lot', robots: { index: false, follow: false } };

export default async function NewLotPage() {
  const staff = await requireStaff('/manage/lots/new');
  const loaded = await loadCatalog(listAllProducts);
  const expected = (canFulfil(staff) ? ((await loadCatalog(openExpectedReceipts)).data ?? []) : []).map((e) => ({
    lineId: e.lineId,
    productCode: e.productCode,
    quantity: e.quantity,
    supplierName: e.supplierName,
    landedCost: (e.landedCostCents / 100).toFixed(2),
    label: `${e.poNumber} · ${e.productCode} ${e.productName} · ${e.quantity} ordered${e.receivedQuantity ? `, ${e.receivedQuantity} received` : ''} · ${e.supplierName} · landed $${(e.landedCostCents / 100).toFixed(2)}`,
  }));
  const products = (loaded.data ?? [])
    .filter((p) => p.visibility !== 'withdrawn')
    .map((p) => ({ code: p.code, name: p.name }));

  return (
    <main className="bg-background text-foreground">
      <section className="mx-auto max-w-[1100px] px-5 py-12 sm:px-8 lg:px-12">
        <Link href="/manage/lots" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-primary">
          <ArrowLeft className="size-4" /> Lots
        </Link>
        <h1 className="mt-6 font-display text-4xl font-extrabold tracking-[-0.05em]">Receive a lot</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          Record what arrived, from whom, and where it is stored. This writes the lot in quarantine and the receipt
          line in the movement ledger with your name on it.
        </p>
        <div className="mt-10">
          {loaded.unavailable ? (
            <CatalogUnavailable />
          ) : (
            <LotForm products={products} expected={expected} today={new Date().toISOString().slice(0, 10)} action={receiveLotAction} />
          )}
        </div>
      </section>
    </main>
  );
}
