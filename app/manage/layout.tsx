import Link from 'next/link';
import { Lock } from 'lucide-react';
import { requireStaff } from '@/lib/staff-auth';

export const dynamic = 'force-dynamic';

/**
 * Every route under /manage requires a staff session. Pages call
 * requireStaff() again themselves — the layout is a convenience, not the
 * only gate — so a page can never render for an anonymous request even if
 * layout rendering is skipped.
 */
export default async function ManageLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff();

  return (
    <div className="border-b border-border bg-background">
      <div className="border-b border-border bg-secondary">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-4 px-5 py-3 text-sm sm:px-8 lg:px-12">
          <nav className="flex items-center gap-6 font-semibold" aria-label="Manager navigation">
            <span className="flex items-center gap-2 text-primary">
              <Lock className="size-4" /> Internal
            </span>
            <Link href="/manage" className="hover:text-primary">
              Catalog
            </Link>
            <Link href="/manage/lots" className="hover:text-primary">
              Lots
            </Link>
          </nav>
          <form method="post" action="/api/staff/sign-out" className="flex items-center gap-4">
            <span className="text-muted-foreground">
              {staff.name} &middot; {staff.role}
            </span>
            <button type="submit" className="font-semibold hover:text-primary">
              Sign out
            </button>
          </form>
        </div>
      </div>
      {children}
    </div>
  );
}
