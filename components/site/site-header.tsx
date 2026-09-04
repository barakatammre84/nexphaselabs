import Link from 'next/link';
import { MobileMenu } from '@/components/site/mobile-menu';
import { getAccount } from '@/lib/account-auth';

const navigation = [
  { href: '/catalog', label: 'Catalog' },
  { href: '/documentation', label: 'Documentation & QC' },
  { href: '/about', label: 'About' },
  { href: '/faq', label: 'Help & FAQ' },
];
export async function SiteHeader() {
  let signedIn = false;
  try {
    signedIn = Boolean(await getAccount());
  } catch (error) {
    console.error(
      '[header] account lookup failed',
      error instanceof Error ? error.message : error,
    );
  }
  const accountHref = signedIn ? '/account' : '/account/sign-in';
  const accountLabel = signedIn ? 'Your account' : 'Sign in';
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-white/95 backdrop-blur">
      <div className="mx-auto flex min-h-20 max-w-[1500px] items-center justify-between gap-4 px-5 sm:px-8 lg:px-12">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-3"
          aria-label="NexPhase Labs home"
        >
          <span className="grid size-10 place-items-center rounded-full bg-foreground text-sm font-bold text-white">
            NX
          </span>
          <span className="font-display text-base font-semibold tracking-tight sm:text-lg">
            NexPhase Labs
          </span>
        </Link>
        <nav
          className="hidden items-center gap-6 text-sm font-semibold xl:flex"
          aria-label="Primary navigation"
        >
          {navigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="py-3 hover:text-primary"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-5 text-sm font-semibold xl:flex">
          <Link
            href="/catalog#catalog-search"
            className="py-3 hover:text-primary"
          >
            Search
          </Link>
          <Link href={accountHref} className="py-3 hover:text-primary">
            {accountLabel}
          </Link>
          <Link
            href={signedIn ? '/account/cart' : '/access'}
            className="action-primary"
          >
            {signedIn ? 'Cart' : 'Research access'}
          </Link>
        </div>
        <MobileMenu>
          <nav
            aria-label="Mobile navigation"
            className="absolute right-0 top-full mt-3 grid w-[min(20rem,calc(100vw-2.5rem))] gap-1 rounded-lg border border-border bg-white p-3 shadow-lg"
          >
            {navigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded px-3 py-3 text-sm font-semibold hover:bg-secondary"
              >
                {item.label}
              </Link>
            ))}
            <Link
              href="/catalog#catalog-search"
              className="px-3 py-3 text-sm font-semibold"
            >
              Search catalog
            </Link>
            <Link
              href={accountHref}
              className="px-3 py-3 text-sm font-semibold"
            >
              {accountLabel}
            </Link>
            <Link
              href={signedIn ? '/account/cart' : '/access'}
              className="action-primary"
            >
              {signedIn ? 'Cart' : 'Research access'}
            </Link>
          </nav>
        </MobileMenu>
      </div>
    </header>
  );
}
