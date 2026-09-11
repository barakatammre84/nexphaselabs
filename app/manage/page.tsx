import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, CircleCheck, Lock, Mail } from 'lucide-react';
import { LotAlerts } from '@/components/manage/lot-alerts';
import { CatalogUnavailable } from '@/components/site/catalog-unavailable';
import {
  DOMAIN_LABEL,
  activityTimeline,
  domainsForRole,
  queueCounts,
} from '@/lib/activity';
import { loadCatalog } from '@/lib/catalog-data';
import { lotAlerts } from '@/lib/lot-alerts';
import { notificationCounts } from '@/lib/notifications';
import {
  listOperationalControls,
  operationalControlSummary,
} from '@/lib/operational-controls';
import { caseSummary } from '@/lib/operational-cases';
import { canFulfil, canManageStaff, requireStaff } from '@/lib/staff-auth';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Operations',
  robots: { index: false, follow: false },
};

type Props = { searchParams: Promise<{ denied?: string; digest?: string }> };
const stamp = (d: Date) => d.toISOString().replace('T', ' ').slice(5, 16);

export default async function DashboardPage({ searchParams }: Props) {
  const staff = await requireStaff('/manage');
  const { denied, digest } = await searchParams;
  const admin = canManageStaff(staff);
  const domains = domainsForRole(staff);
  const loaded = await loadCatalog(async () => {
    const controls = await listOperationalControls();
    return {
      counts: await queueCounts(),
      alerts: await lotAlerts(),
      recent: await activityTimeline(domains, 15, 15),
      notices: admin ? await notificationCounts() : {},
      controls: operationalControlSummary(controls, staff.id),
      cases: await caseSummary(staff.id),
    };
  });
  const c = loaded.data?.counts;
  const tiles = c
    ? [
        {
          n: c.verificationsWaiting,
          label: 'organisations waiting for a decision',
          href: '/manage/verification?status=submitted',
          urgent: c.verificationsWaiting > 0,
        },
        {
          n: c.ordersAwaitingPayment,
          label: 'orders awaiting payment',
          href: '/manage/orders?queue=awaiting_payment',
          urgent: false,
        },
        {
          n: c.ordersToFulfil,
          label: 'paid orders to pick and ship',
          href: '/manage/orders?queue=paid',
          urgent: c.ordersToFulfil > 0,
        },
        {
          n: c.ordersFulfilling,
          label: 'orders being prepared',
          href: '/manage/orders?queue=fulfilling',
          urgent: false,
        },
        {
          n: c.refundsDue,
          label: 'refunds due',
          href: '/manage/orders?queue=refund_due',
          urgent: c.refundsDue > 0,
        },
        {
          n: c.lotsInQuarantine,
          label: 'lots in quarantine',
          href: '/manage/lots?status=quarantine',
          urgent: false,
        },
        {
          n: c.lotsOnHold,
          label: 'lots on hold',
          href: '/manage/lots?status=on_hold',
          urgent: c.lotsOnHold > 0,
        },
        ...(canFulfil(staff)
          ? [
              {
                n: c.openPurchaseOrders,
                label: 'open purchase orders',
                href: '/manage/procurement',
                urgent: false,
              },
            ]
          : []),
        ...(admin
          ? [
              {
                n: c.staffOnOneTimePassword,
                label: 'staff still on a one-time password',
                href: '/manage/staff',
                urgent: false,
              },
            ]
          : []),
        ...(admin
          ? [
              {
                n: loaded.data?.notices.attention ?? 0,
                label: 'customer notifications needing attention',
                href: '/manage/notifications?status=attention',
                urgent: (loaded.data?.notices.attention ?? 0) > 0,
              },
            ]
          : []),
        {
          n: loaded.data?.controls.mine ?? 0,
          label: 'operating controls assigned to me',
          href: '/manage/controls',
          urgent: (loaded.data?.controls.overdue ?? 0) > 0,
        },
        {
          n: loaded.data?.cases.mine ?? 0,
          label: 'open operational cases assigned to me',
          href: '/manage/cases',
          urgent:
            (loaded.data?.cases.overdue ?? 0) > 0 ||
            (loaded.data?.cases.critical ?? 0) > 0,
        },
        ...(admin
          ? [
              {
                n: loaded.data?.controls.launchOpen ?? 0,
                label: 'launch-critical controls still open',
                href: '/manage/controls',
                urgent: (loaded.data?.controls.launchOpen ?? 0) > 0,
              },
            ]
          : []),
      ]
    : [];

  return (
    <main className="bg-background text-foreground">
      <section className="mx-auto max-w-[1500px] px-5 py-14 sm:px-8 lg:px-12">
        <p className="utility-label flex items-center gap-3 text-primary">
          <Lock className="size-4" /> Internal &middot; operations
        </p>
        <div className="mt-6 flex flex-wrap items-end justify-between gap-6">
          <h1 className="page-title">Today’s operations</h1>
          {admin && (
            <form method="post" action="/api/manage/digest">
              <button
                type="submit"
                className="inline-flex h-11 items-center gap-2 border border-foreground/20 px-5 text-sm font-semibold hover:border-primary hover:text-primary"
              >
                <Mail className="size-4" /> Email me today&rsquo;s digest
              </button>
            </form>
          )}
        </div>
        {denied && (
          <p
            role="status"
            className="mt-6 border border-border bg-secondary p-4 text-sm"
          >
            Your role ({staff.role}) cannot open that page.
          </p>
        )}
        {digest === 'sent' && (
          <p
            role="status"
            className="mt-6 flex items-center gap-2 border border-border bg-secondary p-4 text-sm"
          >
            <CircleCheck className="size-4 text-primary" /> Digest sent to{' '}
            {staff.email}.
          </p>
        )}
        {digest === 'failed' && (
          <p
            role="alert"
            className="mt-6 border border-destructive/40 bg-secondary p-4 text-sm"
          >
            The digest could not be sent. Check the email configuration.
          </p>
        )}

        {loaded.unavailable ? (
          <div className="mt-10">
            <CatalogUnavailable />
          </div>
        ) : (
          <>
            <div className="mt-8 grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {tiles.map((t) => (
                <Link
                  key={t.label}
                  href={t.href}
                  className="group flex flex-col justify-between gap-6 bg-background p-6 hover:bg-accent"
                >
                  <span
                    className={`font-display text-4xl font-extrabold tracking-tight ${t.urgent ? 'text-primary' : t.n === 0 ? 'text-muted-foreground' : ''}`}
                  >
                    {t.n}
                  </span>
                  <span className="flex items-end justify-between gap-3 text-sm">
                    {t.label}
                    <ArrowRight className="size-4 shrink-0 text-primary transition-transform group-hover:translate-x-1" />
                  </span>
                </Link>
              ))}
            </div>

            {(loaded.data?.alerts.length ?? 0) > 0 && (
              <div className="mt-8">
                <LotAlerts alerts={loaded.data!.alerts} compact />
              </div>
            )}

            <div className="mt-12 flex items-end justify-between gap-6">
              <h2 className="utility-label text-primary">Recent activity</h2>
              <Link
                href="/manage/activity"
                className="text-sm font-semibold text-primary hover:underline"
              >
                Full timeline
              </Link>
            </div>
            <ul className="mt-4 divide-y divide-border border border-border text-sm">
              {(loaded.data?.recent ?? []).length === 0 && (
                <li className="p-3 text-muted-foreground">
                  Nothing recorded yet.
                </li>
              )}
              {(loaded.data?.recent ?? []).map((a) => (
                <li
                  key={a.id}
                  className="flex flex-wrap items-baseline gap-x-3 p-3"
                >
                  <span className="font-mono text-xs text-muted-foreground">
                    {stamp(a.at)}
                  </span>
                  <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                    {DOMAIN_LABEL[a.domain]}
                  </span>
                  <Link
                    href={a.href}
                    className="font-semibold text-primary hover:underline"
                  >
                    {a.subject}
                  </Link>
                  <span>{a.action}</span>
                  <span className="text-muted-foreground">{a.actor}</span>
                  {a.note && (
                    <span className="w-full text-xs text-muted-foreground">
                      {a.note}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </main>
  );
}
