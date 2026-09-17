import type { Metadata } from 'next';
import Link from 'next/link';
import { Building2, CircleCheck, Clock, BellRing, CreditCard, FileText, LifeBuoy, Lock, MapPin, PackageSearch, UserRound } from 'lucide-react';
import { AccessProgress } from '@/components/site/access-progress';
import { getOrganizationForAccount } from '@/lib/organizations';
import { AcknowledgementForm } from '@/components/site/acknowledgement-form';
import { requireAccount } from '@/lib/account-auth';
import { acknowledgementsCurrent } from '@/lib/account-rules';
import { loadCatalog } from '@/lib/catalog-data';
import { ORDER_STATUS_LABEL, type OrderStatus } from '@/lib/order-rules';
import { listOrdersForAccount } from '@/lib/orders';
import { formatCents } from '@/lib/visibility-rules';
import { CustomerNav } from '@/components/site/customer-nav';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Your account',
  robots: { index: false, follow: false },
};

type Props = {
  searchParams: Promise<{ ack?: string }>;
};

const VERIFICATION_TEXT: Record<string, { title: string; body: string }> = {
  none: {
    title: 'Wholesale application not yet submitted',
    body: 'Complete your wholesale application to open prices, lot availability and ordering on purchase order.',
  },
  submitted: {
    title: 'Application under review',
    body: 'A person is reading your application. You can check this page for the latest status.',
  },
  more_info: {
    title: 'More information needed',
    body: 'Review the request below, update your organization details, and resubmit for review.',
  },
  approved: {
    title: 'Approved wholesale account',
    body: 'Prices and lot availability are visible to you across the catalog, and orders can be placed on purchase order.',
  },
  declined: {
    title: 'Application declined',
    body: 'This organisation could not be approved under our research-use policy.',
  },
  revoked: {
    title: 'Approval withdrawn',
    body: 'Approval of this organisation has been withdrawn. Prices, availability and ordering are no longer available. Open your application for the details.',
  },
};

/** The dashboard hub: one card per thing a customer manages (owner, 16 Sep 2026). */
const HUB = [
  { href: '/account/orders', title: 'Orders', copy: 'Every order, its status, payment and the documents that shipped with it.', icon: PackageSearch },
  { href: '/account/addresses', title: 'Addresses', copy: 'Delivery addresses saved for next time.', icon: MapPin },
  { href: '/account/details', title: 'Account details', copy: 'Your name, email address and password.', icon: UserRound },
  { href: '/account/payment', title: 'Payment', copy: 'How payment works and any order still waiting for it.', icon: CreditCard },
  { href: '/account/waitlist', title: 'Waitlist', copy: 'Pack sizes you asked to hear about when a lot is released.', icon: BellRing },
  { href: '/account/documents', title: 'Documents', copy: 'Certificates and safety data sheets exactly as they shipped with each order.', icon: FileText },
  { href: '/contact', title: 'Support', copy: 'A person answers within one business day. Include your order number.', icon: LifeBuoy },
] as const;

export default async function AccountPage({ searchParams }: Props) {
  const account = await requireAccount('/account');
  const { ack } = await searchParams;
  const current = acknowledgementsCurrent(account);
  const verification =
    VERIFICATION_TEXT[account.verificationStatus] ?? VERIFICATION_TEXT.none;
  const approved = account.verificationStatus === 'approved';
  const consumer = account.tier === 'researcher';
  const organization = !consumer
    ? await getOrganizationForAccount(account.id)
    : null;
  const recent =
    (await loadCatalog(() => listOrdersForAccount(account.id, 5))).data ?? [];

  return (
    <main className="text-foreground">
      <section className="mx-auto max-w-[1232px] px-4 py-8 sm:px-6 sm:py-12">
        <div className="ion-panel bg-gradient-to-br from-white via-white to-aqua-wash p-7 sm:p-10">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <p className="ion-kicker">Account dashboard</p>
            <h1 className="ion-heading mt-6 text-4xl sm:text-6xl">
              {account.name}
            </h1>
            <p className="mt-2 font-mono text-sm text-muted-foreground">
              {account.email}
            </p>
          </div>
          <form method="post" action="/api/account/sign-out">
            <button
              type="submit"
              className="action-secondary"
            >
              Sign out
            </button>
          </form>
        </div>

        {!consumer && (
          <AccessProgress
            current={
              ['none', 'more_info', 'declined'].includes(
                account.verificationStatus,
              )
                ? 2
                : 3
            }
            complete={approved}
          />
        )}
        </div>

        <div className="mt-7 grid gap-7 lg:grid-cols-[16rem_1fr] lg:items-start">
        <aside className="ion-panel p-5 lg:sticky lg:top-28">
          <p className="px-3 font-display text-lg font-extrabold text-[var(--ion-navy)]">Your account</p>
          <p className="mt-2 px-3 text-sm leading-6 text-muted-foreground">Move between orders, cart, catalog, and lot records.</p>
          <div className="mt-5"><CustomerNav current="/account" orientation="vertical" /></div>
          <Link href="/contact" className="mt-5 block border-t border-border px-3 pt-5 text-sm font-extrabold text-primary">Need help?</Link>
        </aside>

        <div className="ion-panel p-7 sm:p-10">
        <p className="utility-label text-primary">Manage your account</p>
        <ul className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {HUB.map(({ href, title, copy, icon: Icon }) => (
            <li key={href}>
              <Link
                href={href}
                className="flex h-full flex-col gap-3 rounded-[1.2rem] border border-border p-5 transition-colors hover:border-primary"
              >
                <Icon className="size-5 text-primary" />
                <span className="font-display text-lg font-bold tracking-tight">{title}</span>
                <span className="text-sm leading-6 text-muted-foreground">{copy}</span>
              </Link>
            </li>
          ))}
        </ul>

        {!current ? (
          <div className="mt-10">
            <AcknowledgementForm returnTo="/account" error={ack} />
          </div>
        ) : consumer ? (
          <div className="mt-2 rounded-[1.4rem] border border-border bg-secondary p-6">
            <div className="flex items-center gap-3">
              <CircleCheck className="size-5 text-primary" />
              <h2 className="font-display text-xl font-bold tracking-tight">
                Individual researcher account
              </h2>
            </div>
            <p className="mt-3 leading-7 text-muted-foreground">
              Materials are supplied for laboratory research use only, under the
              acknowledgement you confirmed at sign-up. Shipping is to a
              laboratory or business address.
            </p>
          </div>
        ) : (
          <div className="mt-2 rounded-[1.4rem] border border-border bg-secondary p-6">
            <div className="flex items-center gap-3">
              {approved ? (
                <CircleCheck className="size-5 text-primary" />
              ) : account.verificationStatus === 'submitted' ? (
                <Clock className="size-5 text-primary" />
              ) : (
                <Lock className="size-5 text-primary" />
              )}
              <h2 className="font-display text-xl font-bold tracking-tight">
                {verification.title}
              </h2>
            </div>
            <p className="mt-3 leading-7 text-muted-foreground">
              {verification.body}
            </p>
            {['more_info', 'declined', 'revoked'].includes(
              account.verificationStatus,
            ) &&
              organization?.reviewNote && (
                <div className="mt-4 border-l-2 border-primary pl-4">
                  <p className="text-sm font-semibold">Review message</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
                    {organization.reviewNote}
                  </p>
                </div>
              )}
            {account.verificationStatus !== 'approved' && (
              <Link
                href="/account/organization"
                className="action-primary mt-6 gap-2"
              >
                <Building2 className="size-4" />
                {account.verificationStatus === 'none'
                  ? 'Submit organization details'
                  : account.verificationStatus === 'more_info'
                    ? 'Update details and resubmit'
                    : 'View your submission'}
              </Link>
            )}
          </div>
        )}

        {recent.length > 0 && (
          <div className="mt-10">
            <p className="utility-label text-primary">Recent orders</p>
            <ul className="mt-3 divide-y divide-border overflow-hidden rounded-[1.4rem] border border-border text-sm">
              {recent.map((o) => (
                <li
                  key={o.id}
                  className="flex flex-wrap items-center justify-between gap-3 p-3"
                >
                  <Link
                    href={`/account/orders/${o.orderNumber}`}
                    className="font-mono font-semibold text-primary"
                  >
                    {o.orderNumber}
                  </Link>
                  <span>
                    {ORDER_STATUS_LABEL[o.status as OrderStatus] ?? o.status}
                  </span>
                  <span className="font-mono">{formatCents(o.totalCents)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <dl className="mt-10 border-t border-border">
          <div className="grid gap-1 border-b border-border py-4 sm:grid-cols-[220px_1fr] sm:gap-6">
            <dt className="text-sm font-semibold text-muted-foreground">
              Account type
            </dt>
            <dd className="text-sm">
              {consumer ? 'Researcher' : 'Research organisation'}
            </dd>
          </div>
          <div className="grid gap-1 border-b border-border py-4 sm:grid-cols-[220px_1fr] sm:gap-6">
            <dt className="text-sm font-semibold text-muted-foreground">
              Terms accepted
            </dt>
            <dd className="font-mono text-sm">
              terms {account.termsVersion ?? '—'} &middot; research-use{' '}
              {account.ruoVersion ?? '—'}
            </dd>
          </div>
          <div className="grid gap-1 border-b border-border py-4 sm:grid-cols-[220px_1fr] sm:gap-6">
            <dt className="text-sm font-semibold text-muted-foreground">
              Catalog
            </dt>
            <dd className="flex gap-6 text-sm">
              <Link href="/catalog" className="font-semibold text-primary">
                Browse materials
              </Link>
              <Link href="/account/cart" className="font-semibold text-primary">
                Cart
              </Link>
              <Link
                href="/account/orders"
                className="font-semibold text-primary"
              >
                Orders
              </Link>
            </dd>
          </div>
        </dl>
        </div>

        </div>
      </section>
    </main>
  );
}
