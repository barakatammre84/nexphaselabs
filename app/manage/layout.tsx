import Link from 'next/link';
import { Lock } from 'lucide-react';
import {
  canFulfil,
  canHandleFeedback,
  canManageStaff,
  canVerifyAccounts,
  requireStaff,
} from '@/lib/staff-auth';
import { feedbackCounts } from '@/lib/feedback';

export const dynamic = 'force-dynamic';

/**
 * Every route under /manage requires a staff session. Pages call
 * requireStaff() again themselves — the layout is a convenience, not the
 * only gate — so a page can never render for an anonymous request even if
 * layout rendering is skipped.
 */
export default async function ManageLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const staff = await requireStaff();
  const feedback = canHandleFeedback(staff)
    ? await feedbackCounts()
    : { unread: 0 };

  return (
    <div className="border-b border-border bg-background">
      <div className="border-b border-border bg-secondary">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-4 px-5 py-3 text-sm sm:px-8 lg:px-12">
          <nav
            className="flex flex-wrap items-center gap-x-6 gap-y-3 font-semibold"
            aria-label="Manager navigation"
          >
            <span className="flex items-center gap-2 text-primary">
              <Lock className="size-4" /> Internal
            </span>
            <Link href="/manage" className="hover:text-primary">
              Dashboard
            </Link>
            <Link href="/manage/products" className="hover:text-primary">
              Catalog
            </Link>
            <Link href="/manage/classes" className="hover:text-primary">
              Classes
            </Link>
            <Link href="/manage/lots" className="hover:text-primary">
              Lots
            </Link>
            <Link href="/manage/verification" className="hover:text-primary">
              Verification
            </Link>
            <Link href="/manage/orders" className="hover:text-primary">
              Orders
            </Link>
            <Link href="/manage/payments/zelle" className="hover:text-primary">
              Zelle
            </Link>
            {canFulfil(staff) && (
              <Link href="/manage/procurement" className="hover:text-primary">
                Procurement
              </Link>
            )}
            {/* The report exports answer only canVerifyAccounts (app/api/manage/reports). */}
            {canVerifyAccounts(staff) && (
              <Link href="/manage/reports" className="hover:text-primary">
                Reports
              </Link>
            )}
            <Link href="/manage/activity" className="hover:text-primary">
              Activity
            </Link>
            <Link href="/manage/controls" className="hover:text-primary">
              Controls
            </Link>
            <Link href="/manage/cases" className="hover:text-primary">
              Cases
            </Link>
            {canHandleFeedback(staff) && (
              <Link href="/manage/feedback" className="hover:text-primary">
                Feedback{feedback.unread > 0 ? ` (${feedback.unread})` : ''}
              </Link>
            )}
            {canManageStaff(staff) && (
              <>
                <Link
                  href="/manage/notifications"
                  className="hover:text-primary"
                >
                  Notifications
                </Link>
                <Link href="/manage/readiness" className="hover:text-primary">
                  Readiness
                </Link>
                <Link href="/manage/hazcom" className="hover:text-primary">
                  Hazard comms
                </Link>
                <Link href="/manage/accounts" className="hover:text-primary">
                  Accounts
                </Link>
                <Link href="/manage/staff" className="hover:text-primary">
                  Staff
                </Link>
              </>
            )}
          </nav>
          <form
            method="post"
            action="/api/staff/sign-out"
            className="flex items-center gap-4"
          >
            <Link
              href="/staff/password"
              className="text-muted-foreground hover:text-primary"
            >
              Password
            </Link>
            <span className="text-muted-foreground">
              {staff.name} &middot; {staff.role}
            </span>
            <button type="submit" className="font-semibold hover:text-primary">
              Sign out
            </button>
          </form>
        </div>
      </div>
      {children}
    </div>
  );
}
