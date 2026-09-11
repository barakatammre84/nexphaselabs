import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertCircle, ArrowLeft, ExternalLink } from 'lucide-react';
import { ControlForm } from '@/components/manage/control-form';
import {
  CONTROL_STATUS_LABEL,
  assignableStaff,
  controlHistory,
  listOperationalControls,
  operationalControlSummary,
} from '@/lib/operational-controls';
import { requireStaff } from '@/lib/staff-auth';
import { updateOperationalControlAction } from './actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Operating controls',
  robots: { index: false, follow: false },
};

const day = (date: Date | null) => date?.toISOString().slice(0, 10) ?? '—';

export default async function ControlsPage() {
  const staff = await requireStaff('/manage/controls');
  const [controls, people, history] = await Promise.all([
    listOperationalControls(),
    assignableStaff(),
    controlHistory(60),
  ]);
  const summary = operationalControlSummary(controls, staff.id);
  const areas = [...new Set(controls.map((control) => control.area))];

  return (
    <main className="bg-background text-foreground">
      <section className="mx-auto max-w-[1200px] px-5 py-12 sm:px-8 lg:px-12">
        <Link
          href="/manage"
          className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-primary"
        >
          <ArrowLeft className="size-4" /> Operations
        </Link>
        <h1 className="mt-6 page-title">Operating controls</h1>
        <p className="mt-4 max-w-3xl text-sm leading-6 text-muted-foreground">
          One truthful register for launch evidence, owners, dates and blockers.
          A green software check does not approve a business control. No control
          is ready until a person records reviewable evidence.
        </p>

        <div className="mt-8 grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-5">
          {[
            [summary.ready, 'ready'],
            [summary.launchOpen, 'launch blockers'],
            [summary.overdue, 'overdue'],
            [summary.awaitingReview, 'awaiting review'],
            [summary.mine, 'assigned to me'],
          ].map(([number, label]) => (
            <div key={String(label)} className="bg-background p-5">
              <p className="font-display text-3xl font-extrabold">{number}</p>
              <p className="mt-2 text-xs text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>

        {summary.launchOpen > 0 && (
          <p className="mt-6 flex gap-2 border border-destructive/40 bg-secondary p-4 text-sm">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
            Not operationally ready: {summary.launchOpen} launch-critical control
            {summary.launchOpen === 1 ? ' remains' : 's remain'} open.
          </p>
        )}

        {areas.map((area) => (
          <section key={area} className="mt-12" aria-labelledby={`area-${area}`}>
            <h2 id={`area-${area}`} className="utility-label text-primary">
              {area}
            </h2>
            <div className="mt-4 space-y-4">
              {controls
                .filter((control) => control.area === area)
                .map((control) => (
                  <article key={control.key} className="border border-border p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="max-w-3xl">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold">{control.title}</h3>
                          {control.launchCritical && (
                            <span className="border border-destructive/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                              Launch critical
                            </span>
                          )}
                        </div>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">
                          {control.description}
                        </p>
                      </div>
                      <span className="border border-border bg-secondary px-3 py-1 text-xs font-semibold">
                        {CONTROL_STATUS_LABEL[control.status]}
                      </span>
                    </div>
                    <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-3">
                      <div>
                        <dt className="font-semibold">Owner</dt>
                        <dd className="mt-1 text-muted-foreground">
                          {control.ownerName ?? 'Unassigned'}
                        </dd>
                      </div>
                      <div>
                        <dt className="font-semibold">Due</dt>
                        <dd className="mt-1 text-muted-foreground">
                          {day(control.dueOn)}
                        </dd>
                      </div>
                      <div>
                        <dt className="font-semibold">Evidence</dt>
                        <dd className="mt-1 text-muted-foreground">
                          {control.evidenceUrl ? (
                            <a
                              href={control.evidenceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-primary underline"
                            >
                              Open evidence <ExternalLink className="size-3" />
                            </a>
                          ) : (
                            'None linked'
                          )}
                        </dd>
                      </div>
                    </dl>
                    {control.note && (
                      <p className="mt-4 whitespace-pre-wrap border-l-2 border-border pl-3 text-sm">
                        {control.note}
                      </p>
                    )}
                    {control.updatedBy && (
                      <p className="mt-3 text-xs text-muted-foreground">
                        Updated {day(control.updatedAt)} by {control.updatedBy}
                      </p>
                    )}
                    <ControlForm
                      control={control}
                      staff={{ id: staff.id, role: staff.role }}
                      people={people}
                      action={updateOperationalControlAction.bind(null, control.key)}
                    />
                  </article>
                ))}
            </div>
          </section>
        ))}

        <section className="mt-14 border-t border-border pt-8">
          <h2 className="utility-label text-primary">Recent control history</h2>
          {history.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              No control updates recorded yet.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-border border-y border-border">
              {history.map((event) => (
                <li key={event.id} className="py-3 text-sm">
                  <span className="font-mono text-xs text-muted-foreground">
                    {event.createdAt.toISOString().slice(0, 16).replace('T', ' ')}
                  </span>{' '}
                  <span className="font-semibold">{event.controlKey}</span> ·{' '}
                  {event.fromStatus} → {event.toStatus} · {event.actor}
                  {event.note && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {event.note}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </section>
    </main>
  );
}
