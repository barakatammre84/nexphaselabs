import Link from 'next/link';
import { FileCheck2, LayoutDashboard, PackageSearch, ShoppingBag, ShoppingCart } from 'lucide-react';

const items = [
  { href: '/account', label: 'Dashboard', icon: LayoutDashboard, membersOnly: true },
  { href: '/account/orders', label: 'Orders', icon: PackageSearch },
  { href: '/account/cart', label: 'Cart', icon: ShoppingCart },
  { href: '/catalog', label: 'Shop', icon: ShoppingBag },
  { href: '/documentation/lot-lookup', label: 'COAs', icon: FileCheck2 },
];

export function CustomerNav({ current, guest = false, orientation = 'horizontal' }: { current: string; guest?: boolean; orientation?: 'horizontal' | 'vertical' }) {
  return (
    <nav aria-label="Customer account" className={orientation === 'vertical' ? 'grid gap-2' : 'flex flex-wrap gap-2'}>
      {items
        .filter((item) => !item.membersOnly || !guest)
        .map(({ href, label, icon: Icon }) => {
          const active = current === href;
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-bold transition-colors ${orientation === 'vertical' ? 'w-full' : ''} ${
                active
                  ? 'bg-[var(--ion-navy)] text-white'
                  : 'border border-border bg-white text-muted-foreground hover:border-primary hover:text-primary'
              }`}
            >
              <Icon className="size-4" /> {label}
            </Link>
          );
        })}
    </nav>
  );
}
