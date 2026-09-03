import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, CircleCheck } from 'lucide-react';
import { AccountServiceForms } from '@/components/manage/account-service-forms';
import { describeToken, getAccountDetail } from '@/lib/account-service';
import { canVerifyAccounts, requireStaff } from '@/lib/staff-auth';
import { accountServiceAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Customer account', robots: { index: false, follow: false } };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ done?: string }> };
const stamp = (d: Date | null) => (d ? d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : '—');
const dollars = (c: number) => `$${(c / 100).toFixed(2)}`;

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-border py-3 sm:grid-cols-[180px_1fr]">
      <dt className="text-sm font-semibold text-muted-foreground">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}

export default async function AccountPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { done } = await searchParams;
  const staff = await requireStaff(`/manage/accounts/${encodeURIComponent(id)}`);
  if (!canVerifyAccounts(staff)) redirect('/manage?denied=1');
  if (!/^acc_[a-f0-9]{8,32}$/.test(id)) notFound();
  const detail = await getAccountDetail(id);
  if (!detail) notFound();
  const { account, organization, acknowledgements, orders, sessions, tokens, events } = detail;
  const now = new Date();
  const live = sessions.filter((s) => !s.revokedAt && s.expiresAt > now).length;

  return (
    <main className="bg-background text-foreground">
      <section className="mx-auto max-w-[1200px] px-5 py-12 sm:px-8 lg:px-12">
        <Link href="/manage/accounts" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-primary">
          <ArrowLeft className="size-4" /> Customer accounts
        </Link>
        <p className="mt-6 font-mono text-xs text-muted-foreground">
          {account.id} &middot; {account.tier} &middot; {account.status.replace('_', ' ')} &middot; created {account.createdAt.toISOString().slice(0, 10)}
        </p>
        <h1 className="mt-2 font-display text-4xl font-extrabold tracking-[-0.05em]">{account.name}</h1>
        <p className="mt-2 font-mono text-sm">{account.email}</p>
        {done && (
          <p role="status" className="mt-6 flex items-center gap-2 border border-border bg-secondary p-4 text-sm">
            <CircleCheck className="size-4 text-primary" /> {done.slice(0, 160)}
          </p>
        )}

        <div className="mt-10">
          <AccountServiceForms action={accountServiceAction.bind(null, account.id)} status={account.status} liveSessions={live} />
        </div>

        <div className="mt-12 grid gap-10 lg:grid-cols-2">
          <div>
            <h2 className="utility-label text-primary">Account</h2>
            <dl className="mt-4 border-t border-border">
              <Row label="Email verified" value={stamp(account.emailVerifiedAt)} />
              <Row label="Last sign-in" value={stamp(account.lastLoginAt)} />
              <Row label="Lockout" value={account.lockedUntil && account.lockedUntil > now ? `locked until ${stamp(account.lockedUntil)}` : `none (${account.failedAttempts} recent failures)`} />
              <Row label="Terms / RUO versions" value={`${account.termsVersion ?? '—'} / ${account.ruoVersion ?? '—'}`} />
              <Row label="Verification" value={account.verificationStatus.replace('_', ' ')} />
            </dl>
          </div>
          <div>
            <h2 className="utility-label text-primary">Organisation</h2>
            {organization ? (
              <dl className="mt-4 border-t border-border">
                <Row label="Legal name" value={<Link href={`/manage/verification/${organization.id}`} className="font-semibold text-primary hover:underline">{organization.legalName}</Link>} />
                <Row label="Status" value={organization.verificationStatus.replace('_', ' ')} />
                <Row label="Website" value={organization.website} />
                <Row label="Reviewed" value={organization.reviewedBy ? `${organization.reviewedBy} · ${stamp(organization.reviewedAt)}` : '—'} />
              </dl>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">No organisation submitted.</p>
            )}
          </div>
        </div>

        <h2 className="mt-12 utility-label text-primary">Orders ({orders.length})</h2>
        <div className="mt-4 overflow-x-auto border border-border">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary">
                {['Order', 'Placed', 'Status', 'Payment', 'Total'].map((h) => (
                  <th key={h} className="p-3 font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 && (
                <tr>
                  <td className="p-3 text-muted-foreground" colSpan={5}>
                    No orders.
                  </td>
                </tr>
              )}
              {orders.map((o) => (
                <tr key={o.id} className="border-b border-border last:border-b-0">
                  <td className="p-3 font-mono text-xs">
                    <Link href={`/manage/orders/${o.orderNumber}`} className="font-semibold text-primary hover:underline">
                      {o.orderNumber}
                    </Link>
                  </td>
                  <td className="p-3 font-mono text-xs">{o.createdAt.toISOString().slice(0, 10)}</td>
                  <td className="p-3">{o.status.replace('_', ' ')}</td>
                  <td className="p-3">{o.paymentStatus.replace('_', ' ')}</td>
                  <td className="p-3 font-mono text-xs">{dollars(o.totalCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-12 grid gap-10 lg:grid-cols-2">
          <div>
            <h2 className="utility-label text-primary">Acknowledgements</h2>
            <ul className="mt-4 divide-y divide-border border border-border text-sm">
              {acknowledgements.length === 0 && <li className="p-3 text-muted-foreground">None recorded.</li>}
              {acknowledgements.map((a) => (
                <li key={a.id} className="p-3">
                  <span className="font-semibold">{a.document === 'ruo' ? 'Research-use acknowledgement' : 'Terms of sale'}</span> {a.version} &middot;{' '}
                  <span className="font-mono text-xs">{stamp(a.acceptedAt)}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="utility-label text-primary">Sessions and email links</h2>
            <ul className="mt-4 divide-y divide-border border border-border text-sm">
              {sessions.slice(0, 8).map((s) => (
                <li key={s.id} className="p-3 font-mono text-xs">
                  session {stamp(s.createdAt)} &middot; {s.revokedAt ? `ended ${stamp(s.revokedAt)}` : s.expiresAt > now ? 'live' : 'expired'}
                  {s.userAgent ? <span className="block text-muted-foreground">{s.userAgent}</span> : null}
                </li>
              ))}
              {tokens.slice(0, 6).map((t) => (
                <li key={t.id} className="p-3 font-mono text-xs text-muted-foreground">
                  {describeToken(t, now)}
                </li>
              ))}
              {sessions.length === 0 && tokens.length === 0 && <li className="p-3 text-muted-foreground">None yet.</li>}
            </ul>
          </div>
        </div>

        <h2 className="mt-12 utility-label text-primary">Service history</h2>
        <ul className="mt-4 divide-y divide-border border border-border text-sm">
          {events.length === 0 && <li className="p-3 text-muted-foreground">No service events recorded.</li>}
          {events.map((e) => (
            <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 p-3">
              <span className="font-mono text-xs">{stamp(e.createdAt)}</span>
              <span className="font-semibold">{e.action.replace(/_/g, ' ')}</span>
              <span className="text-muted-foreground">{e.actor}</span>
              {e.detail && <span className="text-xs text-muted-foreground">{e.detail}</span>}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
