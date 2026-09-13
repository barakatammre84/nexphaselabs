import Link from 'next/link';
import { Clock, Headphones, ShieldAlert } from 'lucide-react';
import { SUPPORT } from '@/lib/support';

/**
 * A visible way to reach a person, with the commitment we can actually keep.
 *
 * The category's convention is a live-chat bubble promising a reply "within
 * minutes"; a three-person company cannot keep that, and a commitment nobody
 * keeps is worse than none. So this states the real numbers from lib/support.ts
 * — the same ones the queue's ageing alerts and the operating charter read —
 * and it states the boundary in the same breath rather than leaving someone to
 * discover it mid-conversation.
 */
export function SupportStrip({ className = '' }: { className?: string }) {
  return (
    <aside className={`rounded-[1.2rem] border border-border p-5 sm:p-6 ${className}`}>
      <div className="flex flex-wrap items-center gap-3">
        <Headphones className="size-5 text-primary" />
        <h2 className="font-display text-lg font-extrabold">Talk to a person</h2>
      </div>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="font-semibold">Email</dt>
          <dd className="mt-1">
            <a href={`mailto:${SUPPORT.email}`} className="text-primary underline">
              {SUPPORT.email}
            </a>
          </dd>
        </div>
        <div>
          <dt className="flex items-center gap-2 font-semibold">
            <Clock className="size-4 text-primary" /> First reply
          </dt>
          <dd className="mt-1 text-muted-foreground">
            {SUPPORT.firstReply}; order and shipping questions {SUPPORT.orderReply}.
          </dd>
        </div>
        <div>
          <dt className="font-semibold">Hours</dt>
          <dd className="mt-1 text-muted-foreground">{SUPPORT.hours}</dd>
        </div>
      </dl>
      <p className="mt-4 flex gap-2 text-xs leading-6 text-muted-foreground">
        <ShieldAlert className="mt-0.5 size-4 shrink-0" />
        {SUPPORT.outOfScope}
      </p>
      <Link href="/contact" className="mt-4 inline-flex text-sm font-extrabold text-primary">
        Open a support request →
      </Link>
    </aside>
  );
}
