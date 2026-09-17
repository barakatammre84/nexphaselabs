import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { CustomerNav } from '@/components/site/customer-nav';
import { SavedAddresses } from '@/components/site/saved-addresses';
import { listAddresses } from '@/lib/account-addresses';
import { requireAccount } from '@/lib/account-auth';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Delivery addresses',
  robots: { index: false, follow: false },
};

type Props = {
  searchParams: Promise<{ saved?: string; removed?: string; defaulted?: string; address_error?: string }>;
};

/** Saved delivery addresses, on their own page since the dashboard became a hub (owner, 16 Sep 2026). */
export default async function AccountAddressesPage({ searchParams }: Props) {
  const account = await requireAccount('/account/addresses');
  const { saved, removed, defaulted, address_error: addressError } = await searchParams;
  const addresses = await listAddresses(account.id);

  return (
    <main className="text-foreground">
      <section className="mx-auto max-w-[1080px] px-4 py-10 sm:px-6">
        <div className="ion-page-hero p-7 sm:p-10">
          <Link href="/account" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-primary">
            <ArrowLeft className="size-4" /> Dashboard
          </Link>
          <p className="ion-kicker mt-6">Manage your account</p>
          <h1 className="ion-heading mt-5 text-4xl sm:text-5xl">Addresses</h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
            The delivery addresses offered at checkout. {addresses.length === 0 ? 'None saved yet.' : `${addresses.length} saved.`}
          </p>
          <div className="relative z-10 mt-7"><CustomerNav current="/account/addresses" /></div>
        </div>
        <SavedAddresses
          addresses={addresses}
          saved={saved === '1'}
          removed={removed === '1'}
          defaulted={defaulted === '1'}
          error={addressError ?? null}
        />
      </section>
    </main>
  );
}
