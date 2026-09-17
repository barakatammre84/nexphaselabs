import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { AlertCircle, CircleCheck, Ticket } from 'lucide-react';
import { listCoupons } from '@/lib/coupons';
import { freeShippingThresholdCents } from '@/lib/free-shipping';
import { NOTICE_COOKIE, readNotice } from '@/lib/notice';
import { canManageStaff, requireStaff } from '@/lib/staff-auth';
import { formatCents } from '@/lib/visibility-rules';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Promo codes', robots: { index: false, follow: false } };

type Props = { searchParams: Promise<{ saved?: string; error?: string }> };

const input =
  'mt-1 h-11 w-full rounded-lg border border-border bg-white px-3 text-sm outline-none focus:border-primary';

const when = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '—');

/** Administrators create promo codes here; customers enter them at checkout (owner, 16 Sep 2026). */
export default async function CouponsPage({ searchParams }: Props) {
  const staff = await requireStaff('/manage/coupons');
  const admin = canManageStaff(staff);
  const { saved, error } = await searchParams;
  const notice = saved || error ? readNotice((await cookies()).get(NOTICE_COOKIE)?.value) : null;
  const rows = admin ? await listCoupons() : [];
  const freeShippingCents = admin ? await freeShippingThresholdCents() : null;

  return (
    <main className="mx-auto max-w-6xl px-5 py-10">
      <div className="flex items-center gap-3">
        <Ticket className="size-6 text-primary" />
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Promo codes</h1>
      </div>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
        A code comes off the materials subtotal before shipping and tax. Customers enter it on the cart page; it is
        priced into their delivery quote and recorded on the order. Codes are switched off, never deleted.
      </p>
      {!admin && (
        <p role="alert" className="mt-6 rounded-lg border border-border bg-secondary p-4 text-sm">
          Only administrators manage promo codes.
        </p>
      )}
      {notice && (
        <p
          role={error ? 'alert' : 'status'}
          className={`mt-6 flex items-center gap-2 rounded-lg border p-4 text-sm ${error ? 'border-destructive/40' : 'border-border'} bg-secondary`}
        >
          {error ? <AlertCircle className="size-4 text-destructive" /> : <CircleCheck className="size-4 text-primary" />}
          {notice}
        </p>
      )}

      {admin && (
        <>
          <section className="mt-8 rounded-2xl border border-border bg-white p-6">
            <h2 className="font-display text-xl font-bold">Free delivery</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Above this materials subtotal (after any promo code) the cheapest delivery is offered at no charge and the
              cart shows how far a customer is from it.{' '}
              {freeShippingCents === null ? 'Currently off.' : `Currently from ${formatCents(freeShippingCents)}.`}
            </p>
            <form method="post" action="/api/manage/coupons" className="mt-4 flex flex-wrap items-end gap-4">
              <input type="hidden" name="intent" value="free_shipping" />
              <label className="block text-sm">
                <span className="font-semibold">Threshold (USD, blank = off)</span>
                <input
                  name="threshold_dollars"
                  type="number"
                  min="1"
                  step="1"
                  defaultValue={freeShippingCents === null ? '' : String(Math.round(freeShippingCents / 100))}
                  className={input}
                />
              </label>
              <button type="submit" className="action-primary">Save</button>
            </form>
          </section>

          <section className="mt-8 rounded-2xl border border-border bg-white p-6">
            <h2 className="font-display text-xl font-bold">Create a code</h2>
            <form method="post" action="/api/manage/coupons" className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <input type="hidden" name="intent" value="create" />
              <label className="block text-sm">
                <span className="font-semibold">Code</span>
                <input name="code" required maxLength={32} pattern="[A-Za-z0-9-]{3,32}" placeholder="WELCOME10" className={`${input} font-mono uppercase`} />
              </label>
              <label className="block text-sm">
                <span className="font-semibold">Kind</span>
                <select name="kind" className={input}>
                  <option value="percent">Percent off the subtotal</option>
                  <option value="fixed">Fixed dollars off</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="font-semibold">Value (percent, or dollars)</span>
                <input name="value" type="number" min={1} step="0.01" required className={input} />
              </label>
              <label className="block text-sm">
                <span className="font-semibold">Minimum subtotal (dollars, optional)</span>
                <input name="min_subtotal_dollars" type="number" min={0} step={1} className={input} />
              </label>
              <label className="block text-sm">
                <span className="font-semibold">Valid from (optional)</span>
                <input name="starts_at" type="date" className={input} />
              </label>
              <label className="block text-sm">
                <span className="font-semibold">Valid until (optional)</span>
                <input name="ends_at" type="date" className={input} />
              </label>
              <label className="block text-sm">
                <span className="font-semibold">Total uses (optional)</span>
                <input name="max_redemptions" type="number" min={1} step={1} className={input} />
              </label>
              <label className="block text-sm">
                <span className="font-semibold">Uses per account (optional)</span>
                <input name="per_account_limit" type="number" min={1} step={1} className={input} />
              </label>
              <label className="block text-sm lg:col-span-3">
                <span className="font-semibold">Note (staff only)</span>
                <input name="note" maxLength={200} placeholder="Launch week, newsletter, …" className={input} />
              </label>
              <div className="lg:col-span-3">
                <button type="submit" className="action-primary">Create promo code</button>
              </div>
            </form>
          </section>

          <section className="mt-8 overflow-x-auto rounded-2xl border border-border bg-white">
            <table className="w-full text-sm">
              <thead className="bg-secondary text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Discount</th>
                  <th className="px-4 py-3">Minimum</th>
                  <th className="px-4 py-3">Window</th>
                  <th className="px-4 py-3">Uses</th>
                  <th className="px-4 py-3">Per account</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-6 text-muted-foreground">No promo codes yet.</td>
                  </tr>
                )}
                {rows.map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-3 font-mono font-semibold">{c.code}</td>
                    <td className="px-4 py-3">{c.kind === 'percent' ? `${c.value}%` : formatCents(c.value)}</td>
                    <td className="px-4 py-3">{c.minSubtotalCents === null ? '—' : formatCents(c.minSubtotalCents)}</td>
                    <td className="px-4 py-3 font-mono text-xs">{when(c.startsAt)} → {when(c.endsAt)}</td>
                    <td className="px-4 py-3 font-mono">{c.redemptionCount}{c.maxRedemptions === null ? '' : ` / ${c.maxRedemptions}`}</td>
                    <td className="px-4 py-3">{c.perAccountLimit ?? '—'}</td>
                    <td className="px-4 py-3">
                      <form method="post" action="/api/manage/coupons" className="flex items-center gap-2">
                        <input type="hidden" name="intent" value="toggle" />
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="active" value={c.active ? 'off' : 'on'} />
                        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${c.active ? 'bg-primary/10 text-primary' : 'bg-secondary text-muted-foreground'}`}>
                          {c.active ? 'Active' : 'Off'}
                        </span>
                        <button type="submit" className="text-xs font-semibold text-primary">
                          {c.active ? 'Switch off' : 'Switch on'}
                        </button>
                      </form>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{c.note ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </main>
  );
}
