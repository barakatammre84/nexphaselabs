import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, FileText } from 'lucide-react';
import { CustomerNav } from '@/components/site/customer-nav';
import { requireAccount } from '@/lib/account-auth';
import { pinnedDocumentsForAccount, type PinnedDocumentLine } from '@/lib/document-pins';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Documents', robots: { index: false, follow: false } };

const when = (date: Date | null) =>
  date ? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'America/Los_Angeles' }).format(date) : null;

const documentHref = (line: PinnedDocumentLine, type: 'coa' | 'sds') =>
  `/api/orders/${encodeURIComponent(line.orderNumber)}/items/${encodeURIComponent(line.itemId)}/documents/${type}`;

/**
 * The customer's document library (owner, 16 Sep 2026). Every line here serves the
 * certificate and safety data sheet pinned at dispatch — the copy that travelled with
 * that shipment, never a later re-issue (lib/document-pins.ts).
 */
export default async function AccountDocumentsPage() {
  const account = await requireAccount('/account/documents');
  const lines = await pinnedDocumentsForAccount(account.id);
  const orders = new Map<string, PinnedDocumentLine[]>();
  for (const line of lines) orders.set(line.orderNumber, [...(orders.get(line.orderNumber) ?? []), line]);

  return (
    <main className="text-foreground">
      <section className="mx-auto max-w-[1080px] px-4 py-10 sm:px-6">
        <div className="ion-page-hero p-7 sm:p-10">
          <Link href="/account" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-primary">
            <ArrowLeft className="size-4" /> Dashboard
          </Link>
          <p className="ion-kicker mt-6">Manage your account</p>
          <h1 className="ion-heading mt-5 text-4xl sm:text-5xl">Documents</h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
            Certificates of analysis and safety data sheets as they shipped.{' '}
            {lines.length === 0 ? 'Nothing has shipped yet.' : `${lines.length} document line${lines.length === 1 ? '' : 's'} across ${orders.size} order${orders.size === 1 ? '' : 's'}.`}
          </p>
          <div className="relative z-10 mt-7"><CustomerNav current="/account/documents" /></div>
        </div>

        <section className="ion-panel mt-8 p-7 sm:p-10">
          <div className="flex items-center gap-3">
            <FileText className="size-5 text-primary" />
            <h2 className="font-display text-xl font-bold tracking-tight">Documents as shipped</h2>
          </div>
          <p className="mt-3 max-w-2xl leading-7 text-muted-foreground">
            Each order line keeps the exact certificate and safety data sheet that accompanied it.
            If a lot&rsquo;s certificate is re-issued later, the copy served here stays the one
            recorded at dispatch; the current version is on the public lot page.
          </p>

          {lines.length === 0 ? (
            <p className="mt-6 rounded-[1.2rem] border border-dashed border-border p-6 text-sm leading-6 text-muted-foreground">
              Documents appear here once an order ships. Until then, every released lot&rsquo;s current
              certificate is in the{' '}
              <Link href="/documentation/lot-lookup" className="font-semibold text-primary">lot library</Link>.
            </p>
          ) : (
            <div className="mt-6 grid gap-5">
              {[...orders.entries()].map(([orderNumber, items]) => (
                <article key={orderNumber} className="rounded-[1.2rem] border border-border p-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <Link href={`/account/orders/${encodeURIComponent(orderNumber)}`} className="font-mono text-sm font-bold text-primary underline">
                      Order {orderNumber}
                    </Link>
                    {when(items[0].orderedAt) && (
                      <span className="text-xs text-muted-foreground">Placed {when(items[0].orderedAt)}</span>
                    )}
                  </div>
                  <ul className="mt-4 grid gap-3">
                    {items.map((line) => (
                      <li key={line.itemId} className="rounded-xl border border-border/70 p-4 text-sm">
                        <p className="font-semibold">
                          {line.productName}
                          <span className="ml-2 font-normal text-muted-foreground">
                            {line.packSize} · {line.presentation} · {line.quantity} pack{line.quantity === 1 ? '' : 's'}
                          </span>
                        </p>
                        {line.lotNumber && (
                          <p className="mt-1 font-mono text-xs text-muted-foreground">
                            Lot{' '}
                            <Link href={`/lots/${encodeURIComponent(line.lotNumber)}`} className="text-primary underline">
                              {line.lotNumber}
                            </Link>
                          </p>
                        )}
                        <p className="mt-2 flex flex-wrap gap-4 text-xs font-semibold">
                          {line.coaDocumentId && (
                            <a href={documentHref(line, 'coa')} className="text-primary underline">Certificate of analysis</a>
                          )}
                          {line.sdsDocumentId && (
                            <a href={documentHref(line, 'sds')} className="text-primary underline">Safety data sheet</a>
                          )}
                        </p>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
