import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, CreditCard, ShieldCheck } from 'lucide-react';
import { CustomerNav } from '@/components/site/customer-nav';
import { requireAccount } from '@/lib/account-auth';
import { loadCatalog } from '@/lib/catalog-data';
import { ORDER_STATUS_LABEL, type OrderStatus } from '@/lib/order-rules';
import { listOrdersForAccount } from '@/lib/orders';
import { availablePaymentMethods } from '@/lib/payments';
import { formatCents } from '@/lib/visibility-rules';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Payment',
  robots: { index: false, follow: false },
};

/**
 * How payment works for this customer (owner, 16 Sep 2026). Nothing is stored
 * on file: every order is paid on its own page, and the recipient details are
 * shown there and nowhere else — the same rule the FAQ states.
 */
export default async function AccountPaymentPage() {
  const account = await requireAccount('/account/payment');
  const methods = availablePaymentMethods();
  const orders = (await loadCatalog(() => listOrdersForAccount(account.id))).data ?? [];
  const waiting = orders.filter((order) => order.status === 'awaiting_payment');

  return (
    <main className="text-foreground">
      <section className="mx-auto max-w-[1080px] px-4 py-10 sm:px-6">
        <div className="ion-page-hero p-7 sm:p-10">
          <Link href="/account" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-primary">
            <ArrowLeft className="size-4" /> Dashboard
          </Link>
          <p className="ion-kicker mt-6">Manage your account</p>
          <h1 className="ion-heading mt-5 text-4xl sm:text-5xl">Payment</h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
            We keep no card or bank details on file. Each order is paid from its own page, where the
            exact recipient details are shown.
          </p>
          <div className="relative z-10 mt-7"><CustomerNav current="/account/payment" /></div>
        </div>

        <div className="ion-panel mt-6 px-6 py-8 sm:px-10">
          <div className="flex items-center gap-3">
            <CreditCard className="size-5 text-primary" />
            <h2 className="font-display text-xl font-bold tracking-tight">Payment methods</h2>
          </div>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2">
            {methods.map((method) => (
              <li key={method.id} className="rounded-[1.2rem] border border-border p-5">
                <p className="font-semibold">{method.label}</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{method.description}</p>
              </li>
            ))}
          </ul>
          <p className="mt-5 flex items-start gap-2 text-sm leading-6 text-muted-foreground">
            <ShieldCheck className="mt-1 size-4 shrink-0 text-primary" />
            Never send money to an address or account that was not shown to you on your order page.
          </p>

          <div className="mt-10 border-t border-border pt-8">
            <p className="utility-label text-primary">Orders waiting for payment</p>
            {waiting.length === 0 ? (
              <p className="mt-3 text-sm leading-6 text-muted-foreground">Nothing is waiting for payment.</p>
            ) : (
              <ul className="mt-3 divide-y divide-border overflow-hidden rounded-[1.4rem] border border-border text-sm">
                {waiting.map((order) => (
                  <li key={order.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                    <Link href={`/account/orders/${order.orderNumber}`} className="font-mono font-semibold text-primary">
                      {order.orderNumber}
                    </Link>
                    <span>{ORDER_STATUS_LABEL[order.status as OrderStatus] ?? order.status}</span>
                    <span className="font-mono">{formatCents(order.totalCents)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
