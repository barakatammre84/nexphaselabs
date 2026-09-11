import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Lock } from 'lucide-react';
import { CatalogUnavailable } from '@/components/site/catalog-unavailable';
import { CreateStaffForm } from '@/components/manage/staff-forms';
import { loadCatalog } from '@/lib/catalog-data';
import { listStaff } from '@/lib/staff-admin';
import { canManageStaff, requireStaff } from '@/lib/staff-auth';
import { createStaffAction } from './actions';
import {
  STAFF_PERMISSION_KEYS,
  STAFF_PERMISSION_LABELS,
  STAFF_ROLES,
  STAFF_ROLE_PERMISSIONS,
  STAFF_ROLE_TITLES,
} from '@/lib/staff-roles';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Staff accounts', robots: { index: false, follow: false } };

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '—');

export default async function StaffPage() {
  const staff = await requireStaff('/manage/staff');
  if (!canManageStaff(staff)) redirect('/manage?denied=1');
  const loaded = await loadCatalog(listStaff);
  const people = loaded.data ?? [];

  return (
    <main className="bg-background text-foreground">
      <section className="mx-auto max-w-[1300px] px-5 py-14 sm:px-8 lg:px-12">
        <p className="utility-label flex items-center gap-3 text-primary">
          <Lock className="size-4" /> Internal &middot; staff accounts
        </p>
        <h1 className="mt-6 font-display text-[clamp(2.2rem,4.2vw,3.6rem)] font-extrabold leading-[0.95] tracking-[-0.05em]">Staff accounts</h1>
        <p className="mt-6 max-w-2xl text-sm leading-6 text-muted-foreground">
          Who can sign in and what their role allows. Accounts are never deleted: they are deactivated and keep their
          history. New accounts and resets issue a one-time password shown exactly once.
        </p>

        {loaded.unavailable ? (
          <div className="mt-10">
            <CatalogUnavailable />
          </div>
        ) : (
          <div className="mt-10 overflow-x-auto border border-border">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary">
                  {['Name', 'Email', 'Role', 'Status', 'Last sign-in', 'Live sessions', 'Password', ''].map((h) => (
                    <th key={h} className="p-4 font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {people.map((p) => (
                  <tr key={p.id} className="border-b border-border last:border-b-0">
                    <td className="p-4 font-semibold">
                      {p.name}
                      {p.id === staff.id && <span className="ml-2 font-mono text-[11px] text-muted-foreground">you</span>}
                    </td>
                    <td className="p-4 font-mono text-xs">{p.email}</td>
                    <td className="p-4 font-mono text-xs">{p.role}</td>
                    <td className="p-4">{p.active ? (p.lockedUntil && p.lockedUntil > new Date() ? 'Locked' : 'Active') : 'Inactive'}</td>
                    <td className="p-4 font-mono text-xs">{day(p.lastLoginAt)}</td>
                    <td className="p-4 font-mono text-xs">{p.activeSessions}</td>
                    <td className="p-4 text-xs">{p.mustChangePassword ? 'One-time, must change' : `Own, set ${day(p.passwordChangedAt)}`}</td>
                    <td className="p-4">
                      <Link href={`/manage/staff/${p.id}`} className="font-semibold text-primary hover:underline">
                        Manage
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <section className="mt-14 border-t border-border pt-10">
          <h2 className="utility-label text-primary">Add a staff account</h2>
          <div className="mt-6 max-w-4xl">
            <CreateStaffForm action={createStaffAction} />
          </div>
        </section>
        <section className="mt-14 border-t border-border pt-10">
          <h2 className="utility-label text-primary">
            Three-person authority matrix
          </h2>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-muted-foreground">
            Assign one primary account to each role. Shared logins are not
            allowed. The admin role keeps emergency coverage, but normal work
            should remain with the named quality or operations owner so the
            history shows meaningful separation.
          </p>
          <div className="mt-6 overflow-x-auto border border-border">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary">
                  <th className="p-3">Authority</th>
                  {STAFF_ROLES.map((role) => (
                    <th key={role} className="p-3">
                      {STAFF_ROLE_TITLES[role]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {STAFF_PERMISSION_KEYS.map((permission) => (
                  <tr key={permission} className="border-b border-border last:border-b-0">
                    <th className="p-3 font-medium">
                      {STAFF_PERMISSION_LABELS[permission]}
                    </th>
                    {STAFF_ROLES.map((role) => (
                      <td key={role} className="p-3">
                        {STAFF_ROLE_PERMISSIONS[role].includes(permission)
                          ? 'Allowed'
                          : 'No access'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </main>
  );
}
