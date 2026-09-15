'use client';

import { useActionState } from 'react';
import { AlertCircle, CircleCheck } from 'lucide-react';
import type { ControlFormState } from '@/app/manage/controls/actions';
import {
  CONTROL_STATUSES,
  CONTROL_STATUS_LABEL,
  type ControlStatus,
} from '@/lib/operational-control-rules';
import type { OperationalControlView } from '@/lib/operational-controls';

type Action = (
  previous: ControlFormState,
  data: FormData,
) => Promise<ControlFormState>;

type Props = {
  control: OperationalControlView;
  staff: { id: string; role: string };
  people: { id: string; name: string; role: string }[];
  action: Action;
};

const field =
  'h-10 w-full border border-foreground/20 bg-background px-3 text-sm outline-none focus:border-primary disabled:opacity-60';

export function ControlForm({ control, staff, people, action }: Props) {
  const initial = {
    status: control.status,
    ownerId: control.ownerId ?? '',
    dueOn: control.dueOn?.toISOString().slice(0, 10) ?? '',
    evidenceUrl: control.evidenceUrl ?? '',
    note: control.note ?? '',
  };
  const [state, formAction, pending] = useActionState(action, {
    values: initial,
    errors: [],
    saved: false,
  });
  const values = { ...initial, ...state.values };
  const admin = staff.role === 'admin';
  const editable = admin || control.ownerId === staff.id;
  // Only an administrator records readiness or a waiver, but an owner saving a work
  // note must keep the one already recorded: a select with no matching option would
  // silently submit its first status instead.
  const statuses = admin
    ? CONTROL_STATUSES
    : CONTROL_STATUSES.filter(
        (status) =>
          (status !== 'ready' && status !== 'not_applicable') ||
          status === control.status,
      );

  if (!editable) {
    return (
      <p className="mt-4 text-xs leading-5 text-muted-foreground">
        An administrator assigns the owner. The assigned owner can update work
        and submit evidence for review.
      </p>
    );
  }

  return (
    <form action={formAction} className="mt-5 grid gap-4 lg:grid-cols-2">
      {state.errors.length > 0 && (
        <p
          role="alert"
          className="flex gap-2 border border-destructive/40 bg-background p-3 text-sm lg:col-span-2"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
          {state.errors.join(' ')}
        </p>
      )}
      {state.saved && (
        <p
          role="status"
          className="flex gap-2 border border-border bg-background p-3 text-sm lg:col-span-2"
        >
          <CircleCheck className="mt-0.5 size-4 shrink-0 text-primary" />
          Saved.
        </p>
      )}
      <label className="flex flex-col gap-1 text-xs font-semibold">
        Status
        <select
          name="status"
          key={values.status}
          defaultValue={values.status}
          className={field}
        >
          {statuses.map((status) => (
            <option key={status} value={status}>
              {CONTROL_STATUS_LABEL[status as ControlStatus]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold">
        Owner
        <select
          name="ownerId"
          key={values.ownerId}
          defaultValue={values.ownerId}
          disabled={!admin}
          className={field}
        >
          <option value="">Unassigned</option>
          {people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name} · {person.role}
            </option>
          ))}
        </select>
        {!admin && <input type="hidden" name="ownerId" value={values.ownerId} />}
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold">
        Due date
        <input
          name="dueOn"
          type="date"
          defaultValue={values.dueOn}
          className={field}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold">
        Evidence link
        <input
          name="evidenceUrl"
          type="url"
          maxLength={500}
          defaultValue={values.evidenceUrl}
          placeholder="https://…"
          className={field}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold lg:col-span-2">
        Work note, blocker, or waiver reason
        <textarea
          name="note"
          rows={3}
          maxLength={1000}
          defaultValue={values.note}
          className="w-full border border-foreground/20 bg-background p-3 text-sm outline-none focus:border-primary"
        />
      </label>
      <div className="flex flex-wrap items-center gap-3 lg:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 items-center bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50"
        >
          {pending ? 'Saving…' : admin ? 'Save review' : 'Save work update'}
        </button>
        <p className="text-xs text-muted-foreground">
          Evidence is required for review/ready. Only an administrator records
          final readiness or a waiver.
        </p>
      </div>
    </form>
  );
}
