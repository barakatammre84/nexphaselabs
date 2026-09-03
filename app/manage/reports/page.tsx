import type { Metadata } from 'next';
import { Download, Lock } from 'lucide-react';
import { canVerifyAccounts, requireStaff } from '@/lib/staff-auth';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Reports', robots: { index: false, follow: false } };

const EXPORTS = [
  { href: '/api/manage/reports/orders.csv', title: 'Orders', detail: 'One row per order line: customer, organisation, SKU, quantity, price, lot, allocated cost and margin. Import into QuickBooks as sales.' },
  { href: '/api/manage/reports/shipments.csv', title: 'Movement ledger', detail: 'Every receipt and shipment with the named consignee, address, carrier, tracking and who recorded it.' },
  { href: '/api/manage/reports/lots.csv', title: 'Inventory by lot', detail: 'Quantity received and remaining, landed cost, status, release and retest dates.' },
];

export default async function ReportsPage() {
  const staff = await requireStaff('/manage/reports');
  const admin = canVerifyAccounts(staff);
  return (
    <main className="bg-background text-foreground">
      <section className="mx-auto max-w-[1500px] px-5 py-14 sm:px-8 lg:px-12">
        <p className="utility-label flex items-center gap-3 text-primary">
          <Lock className="size-4" /> Internal &middot; reports
        </p>
        <h1 className="mt-6 font-display text-[clamp(2.2rem,4.2vw,3.6rem)] font-extrabold leading-[0.95] tracking-[-0.05em]">Reports</h1>
        <p className="mt-6 max-w-2xl text-sm leading-6 text-muted-foreground">
          The operational record is the source for the books. These exports are what a CPA, a bank or an insurer asks
          for; there is no home-made ledger to reconcile against.
        </p>
        {!admin ? (
          <p className="mt-10 border border-border bg-secondary p-6 text-sm text-muted-foreground">Exports are available to admins.</p>
        ) : (
          <ul className="mt-10 grid gap-px bg-border sm:grid-cols-3">
            {EXPORTS.map((e) => (
              <li key={e.href} className="bg-background p-7">
                <h2 className="font-display text-xl font-bold tracking-tight">{e.title}</h2>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{e.detail}</p>
                <a href={e.href} className="mt-6 inline-flex h-11 items-center gap-2 bg-primary px-5 text-sm font-bold text-primary-foreground hover:bg-primary/90">
                  <Download className="size-4" /> Download CSV
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
