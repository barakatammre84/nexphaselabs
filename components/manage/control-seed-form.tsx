'use client';

import { useActionState } from 'react';
import { AlertCircle, CircleCheck } from 'lucide-react';
import type { ControlSeedState } from '@/app/manage/controls/actions';
import type { ControlAssignmentProposal } from '@/lib/operational-controls';
import { STAFF_ROLE_TITLES, type StaffRole } from '@/lib/staff-roles';

type Action = (
  previous: ControlSeedState,
  data: FormData,
) => Promise<ControlSeedState>;

type Props = {
  proposals: ControlAssignmentProposal[];
  people: { id: string; name: string; role: string }[];
  defaultDueOn: string;
  action: Action;
};

const field =
  'h-9 w-full border border-foreground/20 bg-background px-2 text-xs outline-none focus:border-primary';

/**
 * Assign an owner and a due date to every unassigned control in one pass.
 * Each row is pre-set to the seat the operating model puts that control under
 * and can be changed before applying. Status, evidence and readiness are
 * deliberately absent: a control becomes ready when a person records evidence,
 * never because a list was applied.
 */
export function ControlSeedForm({ proposals, people, defaultDueOn, action }: Props) {
  const [state, formAction, pending] = useActionState(action, {
    errors: [],
    assigned: 0,
    unchanged: 0,
  });

  if (proposals.length === 0) return null;

  return (
    <form action={formAction} className="mt-8 border border-border p-5">
      <h2 className="font-semibold">
        Assign {proposals.length} unassigned control{proposals.length === 1 ? '' : 's'}
      </h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
        Each row starts on the seat the operating model puts it under. Change any of them.
        This records an owner and a due date — nothing else. Evidence and readiness stay
        with the owner and the reviewer.
      </p>

      {state.errors.length > 0 && (
        <div
          role="alert"
          className="mt-4 flex gap-2 border border-destructive/40 bg-secondary p-3 text-sm"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <ul className="space-y-1">
            {state.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      )}
      {state.assigned > 0 && (
        <p
          role="status"
          className="mt-4 flex gap-2 border border-border bg-secondary p-3 text-sm"
        >
          <CircleCheck className="mt-0.5 size-4 shrink-0 text-primary" />
          Assigned {state.assigned} control{state.assigned === 1 ? '' : 's'}
          {state.unchanged > 0 && `, ${state.unchanged} already matched`}.
        </p>
      )}

      <label className="mt-5 flex max-w-xs flex-col gap-1 text-xs font-semibold">
        Due date for these controls
        <input name="dueOn" type="date" defaultValue={defaultDueOn} required className={field} />
      </label>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className="py-2 pr-4 font-semibold">Control</th>
              <th scope="col" className="py-2 pr-4 font-semibold">Seat</th>
              <th scope="col" className="py-2 font-semibold">Owner</th>
            </tr>
          </thead>
          <tbody>
            {proposals.map((proposal) => (
              <tr key={proposal.key} className="border-b border-border/60 align-top">
                <td className="py-2 pr-4">
                  <span className="font-semibold">{proposal.title}</span>
                  <span className="block font-mono text-[11px] text-muted-foreground">
                    {proposal.key}
                  </span>
                </td>
                <td className="py-2 pr-4 text-muted-foreground">
                  {STAFF_ROLE_TITLES[proposal.suggestedRole as StaffRole]}
                  {proposal.basis === 'no-one-in-that-seat' && (
                    <span className="block text-[11px] text-destructive">
                      nobody holds that seat — defaulted to an administrator
                    </span>
                  )}
                  {proposal.basis === 'nobody-available' && (
                    <span className="block text-[11px] text-destructive">
                      no active staff account to assign
                    </span>
                  )}
                </td>
                <td className="py-2">
                  <select
                    name={`owner:${proposal.key}`}
                    defaultValue={proposal.ownerId ?? ''}
                    className={field}
                  >
                    <option value="">Leave unassigned</option>
                    {people.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.name} · {person.role}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="mt-5 inline-flex h-10 items-center bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50"
      >
        {pending ? 'Assigning…' : 'Assign owners and due date'}
      </button>
    </form>
  );
}
