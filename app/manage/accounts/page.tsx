import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Lock, Search } from 'lucide-react';
import { CatalogUnavailable } from '@/components/site/catalog-unavailable';
import { searchAccounts } from '@/lib/account-service';
import { loadCatalog } from '@/lib/catalog-data';
import { canVerifyAccounts, requireStaff } from '@/lib/staff-auth';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Customer accounts', robots: { index: false, follow: false } };

type Props = { searchParams: Promise<{ q?: string }> };
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '—');

export default async function AccountsPage({ searchParams }: Props) {
  const staff = await requireStaff('/manage/accounts');
  if (!canVerifyAccounts(staff)) redirect('/manage?denied=1');
  const { q } = await searchParams;
  const query = (q ?? '').slice(0, 80);
  const loaded = await loadCatalog(() => searchAccounts(query));
  const rows = loaded.data ?? [];

  return (
    <main className="bg-background text-foreground">
      <section className="mx-auto max-w-[1400px] px-5 py-14 sm:px-8 lg:px-12">
        <p className="utility-label flex items-center gap-3 text-primary">
          <Lock className="size-4" /> Internal &middot; customer accounts
        </p>
        <h1 className="mt-6 font-display text-[clamp(2.2rem,4.2vw,3.6rem)] font-extrabold leading-[0.95] tracking-[-0.05em]">Customer accounts</h1>
        <p className="mt-6 max-w-2xl text-sm leading-6 text-muted-foreground">
          Find an account by email, name or organisation. Staff can resend verification, email a reset link, end
          sessions, and suspend or reinstate. Staff never see or set a customer&rsquo;s password.
        </p>
        <form method="get" action="/manage/accounts" className="mt-8 flex max-w-xl gap-3">
          <label htmlFor="q" className="sr-only">
            Email, name or organisation
          </label>
          <input id="q" name="q" defaultValue={query} placeholder="Email, name or organisation" className="h-11 flex-1 border border-foreground/20 bg-background px-3 text-sm" />
          <button type="submit" className="inline-flex h-11 items-center gap-2 border border-foreground/20 px-4 text-sm font-semibold hover:border-primary hover:text-primary">
            <Search className="size-4" /> Search
          </button>
        </form>
        {loaded.unavailable ? (
          <div className="mt-10">
            <CatalogUnavailable />
          </div>
        ) : (
          <div className="mt-8 overflow-x-auto border border-border">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary">
                  {['Name', 'Email', 'Organisation', 'Tier', 'Status', 'Verification', 'Orders', 'Last sign-in', ''].map((h) => (
                    <th key={h} className="p-4 font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td className="p-4 text-muted-foreground" colSpan={9}>
                      No accounts{query ? ` matching "${query}"` : ''}.
                    </td>
                  </tr>
                )}
                {rows.map((a) => (
                  <tr key={a.id} className="border-b border-border last:border-b-0">
                    <td className="p-4 font-semibold">{a.name}</td>
                    <td className="p-4 font-mono text-xs">{a.email}</td>
                    <td className="p-4">{a.organizationName ?? '—'}</td>
                    <td className="p-4 font-mono text-xs">{a.tier}</td>
                    <td className="p-4">{a.status.replace('_', ' ')}</td>
                    <td className="p-4">{a.verificationStatus.replace('_', ' ')}</td>
                    <td className="p-4 font-mono text-xs">{a.orderCount}</td>
                    <td className="p-4 font-mono text-xs">{day(a.lastLoginAt)}</td>
                    <td className="p-4">
                      <Link href={`/manage/accounts/${a.id}`} className="font-semibold text-primary hover:underline">
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
