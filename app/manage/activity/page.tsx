import type { Metadata } from 'next';
import Link from 'next/link';
import { Lock } from 'lucide-react';
import { CatalogUnavailable } from '@/components/site/catalog-unavailable';
import { DOMAIN_LABEL, activityTimeline, domainsForRole, type ActivityDomain } from '@/lib/activity';
import { loadCatalog } from '@/lib/catalog-data';
import { requireStaff } from '@/lib/staff-auth';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Activity', robots: { index: false, follow: false } };
type Props = { searchParams: Promise<{ domain?: string }> };
const stamp = (d: Date) => d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';

export default async function ActivityPage({ searchParams }: Props) {
  const staff = await requireStaff('/manage/activity');
  const { domain } = await searchParams;
  const allowed = domainsForRole(staff);
  const chosen = allowed.includes(domain as ActivityDomain) ? [domain as ActivityDomain] : [...allowed];
  const loaded = await loadCatalog(() => activityTimeline(chosen, 200, 100));
  const rows = loaded.data ?? [];

  return (
    <main className="bg-background text-foreground">
      <section className="mx-auto max-w-[1500px] px-5 py-14 sm:px-8 lg:px-12">
        <p className="utility-label flex items-center gap-3 text-primary">
          <Lock className="size-4" /> Internal &middot; activity
        </p>
        <h1 className="mt-6 font-display text-[clamp(2.2rem,4.2vw,3.6rem)] font-extrabold leading-[0.95] tracking-[-0.05em]">Everything that happened</h1>
        <p className="mt-6 max-w-2xl text-sm leading-6 text-muted-foreground">
          One timeline across the areas your role can see, read straight from the append-only histories. Nothing here can be edited or
          deleted.
        </p>
        <nav className="mt-8 flex flex-wrap gap-2" aria-label="Domains">
          <Link href="/manage/activity" className={`inline-flex h-9 items-center border px-3 text-sm font-semibold ${chosen.length > 1 ? 'border-primary text-primary' : 'border-foreground/20'}`}>
            All
          </Link>
          {allowed.map((d) => (
            <Link key={d} href={`/manage/activity?domain=${d}`} className={`inline-flex h-9 items-center border px-3 text-sm font-semibold ${chosen.length === 1 && chosen[0] === d ? 'border-primary text-primary' : 'border-foreground/20'}`}>
              {DOMAIN_LABEL[d]}
            </Link>
          ))}
        </nav>
        {loaded.unavailable ? (
          <div className="mt-10">
            <CatalogUnavailable />
          </div>
        ) : (
          <ul className="mt-6 divide-y divide-border border border-border text-sm">
            {rows.length === 0 && <li className="p-3 text-muted-foreground">Nothing recorded.</li>}
            {rows.map((a) => (
              <li key={a.id} className="flex flex-wrap items-baseline gap-x-3 p-3">
                <span className="font-mono text-xs text-muted-foreground">{stamp(a.at)}</span>
                <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">{DOMAIN_LABEL[a.domain]}</span>
                <Link href={a.href} className="font-semibold text-primary hover:underline">
                  {a.subject}
                </Link>
                <span>{a.action}</span>
                <span className="text-muted-foreground">{a.actor}</span>
                {a.note && <span className="w-full text-xs text-muted-foreground">{a.note}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
