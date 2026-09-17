import Link from 'next/link';
import {
  BellRing, CreditCard, FileText, Handshake,
  FileCheck2,
  LayoutDashboard,
  LifeBuoy,
  MapPin,
  PackageSearch,
  ShoppingBag,
  ShoppingCart,
  UserRound,
} from 'lucide-react';
import { affiliateProgramEnabled } from '@/lib/site-config';

/**
 * One navigation for every customer page (owner, 16 Sep 2026: a dashboard a
 * customer can move around in). `membersOnly` items are hidden from the guest
 * sessions that still exist while ACCOUNT_REQUIRED is off.
 */
const items = [
  { href: '/account', label: 'Dashboard', icon: LayoutDashboard, membersOnly: true },
  { href: '/account/orders', label: 'Orders', icon: PackageSearch },
  { href: '/account/addresses', label: 'Addresses', icon: MapPin, membersOnly: true },
  { href: '/account/details', label: 'Account details', icon: UserRound, membersOnly: true },
  { href: '/account/payment', label: 'Payment', icon: CreditCard, membersOnly: true },
  { href: '/account/waitlist', label: 'Waitlist', icon: BellRing, membersOnly: true },
  { href: '/account/documents', label: 'Documents', icon: FileText, membersOnly: true },
  { href: '/account/affiliate', label: 'Partner', icon: Handshake, membersOnly: true, whileOpen: true },
  { href: '/account/cart', label: 'Cart', icon: ShoppingCart },
  { href: '/catalog', label: 'Shop', icon: ShoppingBag },
  { href: '/documentation/lot-lookup', label: 'COAs', icon: FileCheck2 },
  { href: '/contact', label: 'Support', icon: LifeBuoy },
];

export function CustomerNav({ current, guest = false, orientation = 'horizontal' }: { current: string; guest?: boolean; orientation?: 'horizontal' | 'vertical' }) {
  return (
    <nav aria-label="Customer account" className={orientation === 'vertical' ? 'grid gap-2' : 'flex flex-wrap gap-2'}>
      {items
        .filter((item) => !item.membersOnly || !guest)
        .filter((item) => !item.whileOpen || affiliateProgramEnabled())
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
