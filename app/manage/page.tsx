import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Lock } from 'lucide-react';
import { STATUS_LABEL, products } from '@/lib/catalog';

export const metadata: Metadata = {
  title: 'Catalog manager',
  description: 'Internal catalog manager for NexPhase Labs.',
  robots: { index: false, follow: false },
};

/**
 * Stage 2 of the build.
 *
 * Right now this is a read-only view of lib/catalog.ts so the footer link is
 * not a dead end. The editable version needs, in order:
 *   1. a `products` table in db/schema.ts and a generated migration
 *   2. the D1 binding wired up (see .openai/hosting.json)
 *   3. server actions to create, update, and archive a row
 *   4. sign-in enforced with requireChatGPTUser() from app/chatgpt-auth.ts
 * Until step 4 exists, this page must stay read-only.
 */

export default function ManagePage() {
  return (
    <main className="bg-background text-foreground">
      <section className="mx-auto max-w-[1500px] px-5 py-14 sm:px-8 lg:px-12">
        <p className="utility-label flex items-center gap-3 text-primary">
          <Lock className="size-4" />
          Internal &middot; catalog manager
        </p>
        <h1 className="mt-6 font-display text-[clamp(2.2rem,4.2vw,3.6rem)] font-extrabold leading-[0.95] tracking-[-0.05em]">
          Catalog manager
        </h1>

        <p className="mt-6 max-w-2xl border border-border bg-secondary p-5 leading-7">
          <strong className="font-semibold">Read-only for now.</strong> The catalog below is served from a single
          source file. Editing here needs a database table, the D1 binding, and sign-in enforced on this route
          &mdash; that is the next stage of the build. Until then, catalog changes are made in{' '}
          <code className="font-mono text-sm">lib/catalog.ts</code>.
        </p>

        <div className="mt-10 overflow-x-auto border border-border">
          <table className="w-full min-w-[820px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary text-left">
                <th className="p-4 font-semibold">Code</th>
                <th className="p-4 font-semibold">Name</th>
                <th className="p-4 font-semibold">CAS</th>
                <th className="p-4 font-semibold">Chemical class</th>
                <th className="p-4 font-semibold">Status</th>
                <th className="p-4 font-semibold">Featured</th>
                <th className="p-4 font-semibold">Page</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.slug} className="border-b border-border last:border-b-0">
                  <td className="p-4 font-mono text-xs text-muted-foreground">{product.code}</td>
                  <td className="p-4 font-semibold">{product.name}</td>
                  <td className="p-4 text-muted-foreground">{product.casNumber}</td>
                  <td className="p-4 text-muted-foreground">{product.chemicalClass}</td>
                  <td className="p-4">
                    <span className="spec-pill">{STATUS_LABEL[product.status]}</span>
                  </td>
                  <td className="p-4 text-muted-foreground">{product.featured ? 'Yes' : '—'}</td>
                  <td className="p-4">
                    <Link href={`/catalog/${product.slug}`} className="inline-flex items-center gap-1.5 font-semibold text-primary">
                      View <ArrowRight className="size-3.5" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
