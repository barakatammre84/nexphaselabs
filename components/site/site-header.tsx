import { NavLink } from '@/components/site/nav-link';
import { openCheckoutEnabled } from '@/lib/site-config';
import { MobileMenu } from '@/components/site/mobile-menu';
import { BrandLogo } from '@/components/site/brand-logo';
import { FileCheck2, ShoppingCart, UserRound } from 'lucide-react';
import { getAccount } from '@/lib/account-auth';
import { HeaderSearch } from '@/components/site/header-search';

const navigation = [
  { href: '/catalog', label: 'Shop' },
  { href: '/documentation/lot-lookup', label: 'COA' },
  { href: '/faq', label: 'FAQ' },
  { href: '/about', label: 'About us' },
  { href: '/documentation', label: 'Our standards' },
  { href: '/contact', label: 'Contact' },
];
export async function SiteHeader() {
  const open = openCheckoutEnabled();
  let signedIn = false;
  if (!open) {
    try {
      const account = await getAccount();
      signedIn = Boolean(account);
    } catch (error) {
      console.error(
        '[header] account lookup failed',
        error instanceof Error ? error.message : error,
      );
    }
  }
  const accountHref = open
    ? '/account/orders'
    : signedIn
      ? '/account'
      : '/account/sign-in';
  const accountLabel = open
    ? 'Your orders'
    : signedIn
      ? 'Your account'
      : 'Sign in';
  return (
    <header className="site-header sticky top-0 z-40 px-4 py-3 sm:px-6">
      <div className="mx-auto flex min-h-[4.75rem] max-w-[1280px] items-center justify-between gap-4 rounded-[2rem] border border-white/80 bg-white/95 px-5 shadow-[0_18px_44px_rgba(14,18,59,0.14)] backdrop-blur sm:px-7">
        <NavLink
          href="/"
          className="shrink-0"
          aria-label="NexPhase Labs home"
        >
          <BrandLogo />
        </NavLink>
        <nav
          className="hidden items-center gap-6 text-sm font-bold xl:flex"
          aria-label="Primary navigation"
        >
          {navigation.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              className="py-3 hover:text-primary"
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="hidden items-center gap-2 text-sm font-semibold xl:flex">
          <HeaderSearch />
          <NavLink
            href="/documentation/lot-lookup"
            className="header-icon-link"
            aria-label="Find a certificate of analysis"
          >
            <FileCheck2 className="size-5" />
          </NavLink>
          <NavLink
            href={accountHref}
            className="header-icon-link"
            aria-label={accountLabel}
          >
            <UserRound className="size-5" />
          </NavLink>
          <NavLink
            href={open || signedIn ? '/account/cart' : '/account/sign-up?tier=institutional'}
            className="header-cart-link"
          >
            <ShoppingCart className="size-4" />
            {open || signedIn ? 'Cart' : 'Get access'}
          </NavLink>
        </div>
        <MobileMenu>
          <nav
            aria-label="Mobile navigation"
            className="absolute right-0 top-full mt-3 grid w-[min(20rem,calc(100vw-2.5rem))] gap-1 rounded-lg border border-border bg-white p-3 shadow-lg"
          >
            {navigation.map((item) => (
              <NavLink
                key={item.href}
                href={item.href}
                className="rounded px-3 py-3 text-sm font-semibold hover:bg-secondary"
              >
                {item.label}
              </NavLink>
            ))}
            <NavLink
              href="/catalog#catalog-search"
              className="px-3 py-3 text-sm font-semibold"
            >
              Search catalog
            </NavLink>
            <NavLink
              href={accountHref}
              className="px-3 py-3 text-sm font-semibold"
            >
              {accountLabel}
            </NavLink>
            <NavLink
              href={open || signedIn ? '/account/cart' : '/account/sign-up?tier=institutional'}
              className="action-primary"
            >
              {open || signedIn ? 'Cart' : 'Research access'}
            </NavLink>
          </nav>
        </MobileMenu>
      </div>
    </header>
  );
}
