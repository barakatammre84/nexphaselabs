import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, CircleCheck } from 'lucide-react';
import { StaffAccountForms } from '@/components/manage/staff-forms';
import { getStaffDetail } from '@/lib/staff-admin';
import { canManageStaff, requireStaff } from '@/lib/staff-auth';
import { staffAccountAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Staff account', robots: { index: false, follow: false } };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ done?: string; n?: string }> };

const DONE: Record<string, string> = {
  role: 'Role changed.',
  deactivate: 'Account deactivated and its sessions ended.',
  reactivate: 'Account reactivated.',
  revoke: 'Sessions ended.',
};

function doneText(done: string, n: string | undefined, isSelf: boolean): string {
  if (done !== 'revoke') return DONE[done];
  const count = /^\d{1,4}$/.test(n ?? '') ? Number(n) : null;
  if (isSelf) return count === 0 ? 'No other sessions to end; this one continues.' : `${count ?? 'Other'} other session${count === 1 ? '' : 's'} ended; this one continues.`;
  return count === null ? 'Sessions ended.' : `${count} session${count === 1 ? '' : 's'} ended.`;
}

const stamp = (d: Date) => d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';

export default async function StaffAccountPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { done, n } = await searchParams;
  const staff = await requireStaff(`/manage/staff/${encodeURIComponent(id)}`);
  if (!canManageStaff(staff)) redirect('/manage?denied=1');
  if (!/^stf_[a-f0-9]{8,32}$/.test(id)) notFound();
  const detail = await getStaffDetail(id);
  if (!detail) notFound();
  const { user, sessions, events } = detail;
  const now = new Date();
  const live = sessions.filter((s) => !s.revokedAt && s.expiresAt > now).length;

  return (
    <main className="bg-background text-foreground">
      <section className="mx-auto max-w-[1100px] px-5 py-12 sm:px-8 lg:px-12">
        <Link href="/manage/staff" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-primary">
          <ArrowLeft className="size-4" /> Staff accounts
        </Link>
        <p className="mt-6 font-mono text-xs text-muted-foreground">
          {user.id} &middot; {user.role} &middot; {user.active ? 'active' : 'inactive'} &middot; created {user.createdAt.toISOString().slice(0, 10)}
          {user.createdBy ? ` by ${user.createdBy}` : ''}
        </p>
        <h1 className="mt-2 font-display text-4xl font-extrabold tracking-[-0.05em]">{user.name}</h1>
        <p className="mt-2 font-mono text-sm">{user.email}</p>
        {done && Object.hasOwn(DONE, done) && (
          <p role="status" className="mt-6 flex items-center gap-2 border border-border bg-secondary p-4 text-sm">
            <CircleCheck className="size-4 text-primary" /> {doneText(done, n, user.id === staff.id)}
          </p>
        )}
        {user.mustChangePassword && (
          <p className="mt-6 border border-border bg-secondary p-4 text-sm">
            This account holds a one-time password and can see nothing until the person replaces it with their own.
          </p>
        )}

        <div className="mt-10">
          <StaffAccountForms action={staffAccountAction.bind(null, user.id)} role={user.role} active={user.active} isSelf={user.id === staff.id} activeSessions={live} />
        </div>

        <h2 className="mt-14 utility-label text-primary">Sessions</h2>
        <div className="mt-4 overflow-x-auto border border-border">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary">
                {['Started', 'Expires', 'Ended', 'Client'].map((h) => (
                  <th key={h} className="p-3 font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sessions.length === 0 && (
                <tr>
                  <td className="p-3 text-muted-foreground" colSpan={4}>
                    No sessions yet.
                  </td>
                </tr>
              )}
              {sessions.map((s) => (
                <tr key={s.id} className="border-b border-border last:border-b-0">
                  <td className="p-3 font-mono text-xs">{stamp(s.createdAt)}</td>
                  <td className="p-3 font-mono text-xs">{stamp(s.expiresAt)}</td>
                  <td className="p-3 font-mono text-xs">{s.revokedAt ? stamp(s.revokedAt) : s.expiresAt > now ? 'live' : 'expired'}</td>
                  <td className="p-3 text-xs text-muted-foreground">{s.userAgent ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2 className="mt-14 utility-label text-primary">History</h2>
        <ul className="mt-4 divide-y divide-border border border-border text-sm">
          {events.length === 0 && <li className="p-3 text-muted-foreground">No events recorded yet (account predates the history table).</li>}
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
